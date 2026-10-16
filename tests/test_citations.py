"""前端引用条目（philo_rag/citations.py）：三种来源必须产出同一种结构。

这是前端的隐含契约：字段漏一个，界面就得多写一处兜底。所以这里既查字段集合，
也查各自特有的取值规则（char_span 文案、text 截断、evidence_id 只在 theme 出现）。
"""
from __future__ import annotations

from philo_rag import citations as cit
from philo_rag.answer_evidence import build_point_evidence
from philo_rag.retrieve import hybrid_search


def _hits(store, lex, cfg, question="什么是字头？"):
    doc_title = store.manifest.get("doc_title", "")
    return hybrid_search(store, question, cfg, lex, top_k=8), doc_title


def _group_evidence(store, lex, cfg, question="什么是字头？"):
    hits, _ = _hits(store, lex, cfg, question)
    return build_point_evidence(question, hits, store, lex, cfg, limit=5)


def test_canonical_field_set_is_stable():
    assert set(cit._FIELDS) == {
        "chunk_id", "citation", "chapter_path", "unit", "unit_title", "volume",
        "char_span", "start", "end", "page", "chunk_type", "philosophers",
        "concepts", "eras", "coords", "section_concepts", "section_philosophers",
        "matched_concepts", "matched_philosophers", "text", "score",
    }


def test_entry_fills_defaults_and_keeps_extra_fields():
    entry = cit._entry(3, unit="1-1", text="原文", evidence_id="E1")
    assert entry["n"] == 3
    assert entry["unit"] == "1-1"
    assert entry["chapter_path"] == []
    assert entry["score"] == 0.0
    assert entry["evidence_id"] == "E1"
    # 缺省列表不能是共享可变对象
    assert entry["philosophers"] is not cit._FIELDS["philosophers"]


def test_hits_citations_carry_metadata(store, lex, cfg):
    hits, doc_title = _hits(store, lex, cfg)
    entries = cit.citations_from_hits(hits, doc_title, lex)
    assert [e["n"] for e in entries] == list(range(1, len(hits) + 1))
    first, chunk = entries[0], hits[0]["chunk"]
    assert set(entries[0]) == set(cit._FIELDS) | {"n"}
    assert first["chunk_id"] == chunk.chunk_id
    assert first["char_span"] == f"{chunk.start}-{chunk.end}"
    assert first["citation"] == chunk.citation(doc_title)
    assert first["text"] == chunk.text
    assert first["unit_title"] == lex.unit_title(chunk.unit_code())


def test_group_citations_use_precomputed_citation(store, lex, cfg):
    evidence = _group_evidence(store, lex, cfg)
    entries = cit.citations_from_groups(evidence)
    assert len(entries) == len(evidence)
    assert set(entries[0]) == set(cit._FIELDS) | {"n"}
    assert entries[0]["citation"] == evidence[0]["citation"]
    assert entries[0]["chunk_type"] == "body"
    assert entries[0]["philosophers"] == []
    assert len(entries[0]["text"]) <= cit.TEXT_MAX


def test_theme_citations_add_evidence_id_only():
    res = {
        "anchors": {"philosophers": ["黑格尔"], "concepts": ["辩证法"]},
        "evidence": [
            {
                "id": "E01", "chunk_id": "c1", "unit": "1-2", "unit_title": "二字头",
                "volume": "第一卷", "start": 10, "end": 40, "page": 3, "page_end": 4,
                "text": "原文段落。", "evidence_type": "literal", "score": 0.5,
            }
        ],
    }
    (entry,) = cit.citations_from_theme(res, "书名")
    assert set(entry) == set(cit._FIELDS) | {"n", "evidence_id"}
    assert entry["evidence_id"] == "E01"
    assert entry["citation"] == "书名 · 1-2 二字头 · 第 3–4 页 · literal"
    assert entry["char_span"] == "10-40"
    assert entry["philosophers"] == ["黑格尔"]
    assert entry["concepts"] == ["辩证法"]
    assert entry["score"] == 0.5


def test_group_citation_text_format():
    unit = {"code": "1-2", "title": "二字头", "volume": "第一卷"}
    group = {"page": 3, "page_end": 4, "start": 10, "end": 40}
    assert cit.group_citation("哲学大纲", unit, group) == (
        "《哲学大纲》 · 1-2 二字头 · 第一卷 · 第 3–4 页 · 字符 10-40"
    )
    assert cit.group_citation("", unit, group) == "1-2 二字头 · 第一卷 · 第 3–4 页 · 字符 10-40"
