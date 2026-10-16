"""概念卡（retrieve.build_concept_card）：字段契约与两条统计口径。

概念卡是前端「概念卡」面板的唯一数据源：定义句 + 单元分布 + 共现理论家 +
相关概念 + 所属主题 + 引文。这里固定字段集合，并守住两条口径：
相关概念来自块级**精确注解**的共现（不含自身与别名、按共现次数降序），
所属主题来自主题词典（`lexicon/themes.yaml`）。
"""
from __future__ import annotations

from philo_rag.retrieve import build_concept_card


def test_card_field_set_is_stable(store, lex):
    card = build_concept_card(store, lex, "大他者", limit=5)
    assert card["found"] is True
    assert set(card) == {"term", "aliases", "found", "definition", "units",
                         "philosophers", "related", "themes", "quotes"}
    assert {"chunk_id", "text", "unit", "unit_title", "citation", "page"} <= set(card["definition"])


def test_unknown_term_returns_empty_card(store, lex):
    card = build_concept_card(store, lex, "量子引力波弦论", limit=5)
    assert card["found"] is False
    assert card["related"] == [] and card["themes"] == [] and card["quotes"] == []


def test_related_is_ranked_and_excludes_self(store, lex):
    card = build_concept_card(store, lex, "大他者", limit=5)
    std = lex.concept_card("大他者")["name"]
    names = [r["name"] for r in card["related"]]
    assert std not in names
    counts = [r["count"] for r in card["related"]]
    assert counts == sorted(counts, reverse=True)
    assert all(c >= 1 for c in counts)


def test_themes_match_theme_lexicon(store, lex):
    checked = 0
    for term in ("客体小a", "能指", "扬弃", "意识形态", "大他者"):
        card_lex = lex.concept_card(term)
        card = build_concept_card(store, lex, term, limit=3)
        if not card_lex or not card["found"]:
            continue
        std = card_lex["name"]
        expected = [str(t.get("name", "")) for t in lex.themes if std in (t.get("concepts") or [])]
        assert card["themes"] == expected, term
        checked += 1
    assert checked >= 3, "词典里应有多个可核对的概念"


def test_card_chunks_resolve_in_store(store, lex):
    card = build_concept_card(store, lex, "大他者", limit=5)
    assert store.by_id(card["definition"]["chunk_id"]) is not None
    assert all(q["chunk_id"] and store.by_id(q["chunk_id"]) for q in card["quotes"])


def test_every_sampled_lexicon_concept_builds_a_card(store, lex):
    """词典里的概念都应能建出卡片（抽样 20 个；定义句可能缺失，但结构必须在）。"""
    for term in list(lex.concepts)[:20]:
        card = build_concept_card(store, lex, term, limit=2)
        assert card["found"] is True, term
        assert card["term"] == term
        assert isinstance(card["units"], list) and isinstance(card["quotes"], list)
