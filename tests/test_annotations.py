"""注解层单测：四层坐标、章节级注解、检索文本与引用契约。

重型回归（评测基线 / 重排）在 test_retrieval；别名守卫在 test_lexicon_guard。
"""
from __future__ import annotations

from philo_rag import citations as cit
from philo_rag.index import Store
from philo_rag.ingest import _apply_section_tags
from philo_rag.schema import Chunk


# --------------------------------------------------------------------------- #
# 四层坐标
# --------------------------------------------------------------------------- #
def test_coords_follow_digit_positions(lex):
    assert lex.coords_of("2-3-3") == ["场域论=2", "本体论=3", "认识论=3"]
    assert lex.coords_of("3-2-1-4") == [
        "场域论=3", "本体论=2", "认识论=1", "目的论=4"
    ]
    assert lex.coords_of("") == []


# --------------------------------------------------------------------------- #
# 章节级注解
# --------------------------------------------------------------------------- #
def _chunk(seq: int, path: list[str], concepts: list[str], philosophers: list[str]) -> Chunk:
    return Chunk(
        chunk_id=f"c{seq}", doc_id="d", seq=seq, text="正文",
        chapter_path=path, concepts=list(concepts), philosophers=list(philosophers),
    )


def test_section_tags_are_shared_but_not_own():
    path = ["第 2 卷 形而上学", "2-3 复习课", "2-3-3 单子主义"]
    a = _chunk(1, path, ["单子"], ["莱布尼茨"])
    b = _chunk(2, path, ["单子", "虚无"], ["莱布尼茨", "康德"])
    c = _chunk(3, path, ["虚无"], ["康德"])
    _apply_section_tags([a, b, c])
    assert a.section_concepts == ["虚无"]           # 本节共识里扣除自身注解
    assert b.section_concepts == []                 # 自己的注解不重复继承
    assert c.section_concepts == ["单子"]
    assert a.section_philosophers == ["康德"]
    assert b.section_philosophers == []
    assert c.section_philosophers == ["莱布尼茨"]


def test_section_tags_skip_single_chunk_units():
    c = _chunk(1, ["1-1 科学实在论"], ["资本"], ["马克思"])
    _apply_section_tags([c])
    assert c.section_concepts == [] and c.section_philosophers == []


# --------------------------------------------------------------------------- #
# 检索文本（embed_text）
# --------------------------------------------------------------------------- #
def test_embed_text_carries_coords_and_caps_tags():
    c = _chunk(1, ["第 1 卷 实在论", "1-1-1 物理主义"], [f"概念{i}" for i in range(30)], ["康德"])
    c.coords = ["场域论=1", "本体论=1"]
    text = c.embed_text(max_tags=10)
    assert "坐标：场域论=1｜本体论=1" in text
    tags_line = text.split("\n")[2]
    capped = next(p for p in tags_line.split("｜") if p.startswith("概念："))
    assert len(capped.removeprefix("概念：").split("、")) == 10
    # 0 = 不截断，保持旧行为
    full = next(
        p for p in c.embed_text().split("\n")[2].split("｜") if p.startswith("概念：")
    )
    assert len(full.removeprefix("概念：").split("、")) == 30


def test_embed_text_excludes_section_tags():
    c = _chunk(1, ["1-1 科学实在论"], ["资本"], ["马克思"])
    c.section_concepts = ["虚无"]
    assert "虚无" not in c.embed_text()


# --------------------------------------------------------------------------- #
# 过滤与引用契约
# --------------------------------------------------------------------------- #
def test_filter_ids_accepts_axis(lex):
    store = Store()
    store.chunks = [
        _chunk(1, ["第 2 卷 形而上学", "2-3-3 单子主义"], ["单子"], []),
        _chunk(2, ["第 1 卷 实在论", "1-1-1 物理主义"], ["虚无"], []),
    ]
    store.chunks[0].coords = lex.coords_of("2-3-3")
    store.chunks[1].coords = lex.coords_of("1-1-1")
    store._build_lexical(lex)
    assert store.filter_ids(axis="场域论=2") == {"c1"}
    assert store.filter_ids(axis="场域论=2", concept="虚无") == set()


def test_citations_from_hits_carry_new_fields(lex):
    c = _chunk(1, ["第 2 卷 形而上学", "2-3-3 单子主义"], ["单子", "虚无"], ["莱布尼茨"])
    c.coords = ["场域论=2", "本体论=3", "认识论=3"]
    c.section_concepts = ["形而上学"]
    hit = {
        "chunk": c,
        "score": 0.123456,
        "matched_concepts": ["单子"],
        "matched_philosophers": ["莱布尼茨"],
    }
    (entry,) = cit.citations_from_hits([hit], "哲学大纲", lex)
    assert entry["coords"] == ["场域论=2", "本体论=3", "认识论=3"]
    assert entry["section_concepts"] == ["形而上学"]
    assert entry["matched_concepts"] == ["单子"]
    assert entry["matched_philosophers"] == ["莱布尼茨"]
    assert entry["concepts"] == ["单子", "虚无"]   # 块的完整注解原样保留


def test_group_citations_leave_new_fields_empty_by_default():
    entry = cit._entry(1, citation="出处")
    for key in ("coords", "section_concepts", "matched_concepts"):
        assert entry[key] == []
