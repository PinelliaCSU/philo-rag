"""术语表导出（retrieve.glossary_payload + output.render_glossary）。

术语表是「词典 × 索引」的对照视图：既给出词典里的定义与归属，也给出每个概念
在本索引中的落点（命中块 / 引文块 / 首见单元），因此它能直接回答两个运维问题——
词典里哪些词其实从未出现（`unused`）、某个概念第一次出现是在哪个单元。
"""
from __future__ import annotations

from philo_rag.output import FORMATS, render
from philo_rag.retrieve import glossary_payload


def test_glossary_covers_the_whole_lexicon(store, lex):
    res = glossary_payload(store, lex)
    assert res["count"] == len(lex.concepts)
    assert {e["name"] for e in res["entries"]} == set(lex.concepts)


def test_hit_counts_match_terms_index(store, lex):
    res = glossary_payload(store, lex)
    for entry in res["entries"][:30]:
        assert entry["hits"] == len(store.terms["concept"].get(entry["name"], []))


def test_used_entries_expose_first_location(store, lex):
    res = glossary_payload(store, lex)
    used = [e for e in res["entries"] if e["hits"] > 0]
    assert used, "索引里应当有术语命中"
    assert all(e["first_page"] >= 1 for e in used)
    # 编号单元必须给出标题；落在前言/总纲等无编号章节的条目给出章节路径末级
    assert all(e["first_unit_title"] for e in used if e["first_unit"])
    assert any(e["first_unit"] for e in used)
    assert any(e["first_unit_title"] for e in used)
    sample = used[0]
    assert sample["hits"] >= sample["quotes"]


def test_unused_entries_are_listed(store, lex):
    res = glossary_payload(store, lex)
    unused = [e["name"] for e in res["entries"] if e["hits"] == 0]
    assert res["unused"] == unused


def test_every_format_renders(store, lex):
    res = glossary_payload(store, lex)
    for fmt in FORMATS:
        assert render("glossary", res, fmt).strip()
