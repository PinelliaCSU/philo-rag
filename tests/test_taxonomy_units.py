"""体系目录的同码单元（philo_rag/lexicon.py）：编号不是主键，必须显式暴露并消歧。

语料里同一编号会有多个条目（各卷的「复习课」与所属单元共用编号，如 1-1）。
旧实现用 `setdefault` 静默保留首个条目，标题可能张冠李戴；这里固定新契约。
"""
from __future__ import annotations

import collections

import pytest


def test_units_by_code_covers_every_entry(lex):
    assert sum(len(v) for v in lex.units_by_code.values()) == len(lex.units)
    assert set(lex.units_by_code) == {u["code"] for u in lex.units}


def test_duplicate_codes_are_reported_exactly(lex):
    counts = collections.Counter(u["code"] for u in lex.units)
    expected = {code for code, n in counts.items() if n > 1}
    dup = lex.duplicate_unit_codes()
    assert set(dup) == expected
    assert all(len(titles) == counts[code] for code, titles in dup.items())


def test_title_disambiguates_by_chapter_path(lex):
    dup = {
        code: titles
        for code, titles in lex.duplicate_unit_codes().items()
        if len(set(titles)) > 1
    }
    if not dup:
        pytest.skip("词典中没有标题不同的同码单元")
    code, titles = next(iter(dup.items()))
    primary = titles[0]
    other = next(t for t in titles if t != primary)
    assert lex.unit_title(code) == primary
    assert lex.unit_title(code, [f"{code} {primary}"]) == primary
    assert lex.unit_title(code, [f"{code} {other}"]) == other


def test_unknown_code_has_empty_title(lex):
    assert lex.unit_title("99-99") == ""
    assert lex.unit_title("") == ""
