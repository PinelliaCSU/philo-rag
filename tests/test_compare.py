"""概念对比（retrieve.build_compare）：/api/compare 数据层契约。

对比模式是两栏概念卡的交并运算：每侧结构与概念卡同源（定义句、单元、理论家、
主题、相关概念、引文），再算共现交集、各自独有与共有单元。这里固定四件事：
字段集合与条数上限、共现按 sum 降序、某侧未收录不拖垮另一侧、连续调用逐字段相同。
"""
from __future__ import annotations

import json

from philo_rag import retrieve
from philo_rag.retrieve import build_compare

SIDE_KEYS = {"term", "found", "definition", "units", "philosophers", "themes", "related", "quotes"}


def test_compare_contract_and_shared_related_order(store, lex):
    result = build_compare(store, lex, "大他者", "象征界")
    assert set(result) == {"terms", "shared_related", "shared_units",
                           "a_only_related", "b_only_related"}
    a, b = result["terms"]
    assert (a["term"], b["term"]) == ("大他者", "象征界")
    assert a["found"] is True and b["found"] is True
    for side in (a, b):
        assert set(side) == SIDE_KEYS
        assert isinstance(side["definition"], str) and side["definition"].strip()
        assert len(side["quotes"]) <= 3
        assert all(q["chunk_id"] and q["citation"] for q in side["quotes"])
        assert side["units"] and side["philosophers"]

    rows = result["shared_related"]
    assert rows, "两侧都收词时应至少有一个共现概念"
    sums = [row["sum"] for row in rows]
    assert sums == sorted(sums, reverse=True)
    assert len(rows) <= 12
    assert all(row["sum"] == row["a"] + row["b"] for row in rows)
    # 同分按名称升序：稳定可复现的次级排序键
    assert rows == sorted(rows, key=lambda row: (-row["sum"], row["name"]))
    assert result["shared_units"], "两侧共享单元应非空"
    assert all(u["code"] and u["title"] and u["a"] >= 1 and u["b"] >= 1
               for u in result["shared_units"])


def test_compare_self_keeps_symmetric_counts(store, lex):
    result = build_compare(store, lex, "大他者", "大他者")
    a, b = result["terms"]
    assert a["related"] == b["related"]
    assert result["shared_related"]
    assert all(row["a"] == row["b"] for row in result["shared_related"])
    assert result["a_only_related"] == [] and result["b_only_related"] == []


def test_compare_missing_side_keeps_other_side(store, lex):
    result = build_compare(store, lex, "不存在的东西", "象征界")
    a, b = result["terms"]
    assert a["found"] is False
    assert a["term"] == "不存在的东西"
    assert a["definition"] is None
    assert a["units"] == [] and a["related"] == [] and a["quotes"] == []
    assert b["found"] is True and b["related"] and b["quotes"]
    assert result["shared_related"] == [] and result["a_only_related"] == []
    assert result["b_only_related"], "另一侧的独有概念仍应照常返回"


def test_compare_both_sides_missing_is_not_an_error(store, lex):
    result = build_compare(store, lex, "不存在的东西", "也不存在的东西")
    assert [side["found"] for side in result["terms"]] == [False, False]
    assert result["shared_related"] == result["shared_units"] == []
    assert result["a_only_related"] == result["b_only_related"] == []


def test_compare_is_reproducible(store, lex):
    first = build_compare(store, lex, "大他者", "象征界")
    second = build_compare(store, lex, "大他者", "象征界")
    assert first == second
    # 连字段顺序也比一遍：前端按序渲染，JSON 序列化必须逐字节相同
    assert json.dumps(first, ensure_ascii=False) == json.dumps(second, ensure_ascii=False)


def test_compare_uses_candidate_set_not_full_scan(store, lex, monkeypatch):
    """候选集机制：候选为空时共现统计即为空，说明没有对全库逐块扫正则。"""
    monkeypatch.setattr(retrieve, "_candidate_indices", lambda *a, **k: [])
    result = build_compare(store, lex, "大他者", "象征界")
    assert [side["found"] for side in result["terms"]] == [True, True]
    assert result["shared_related"] == [] and result["shared_units"] == []
    assert result["a_only_related"] == [] and result["b_only_related"] == []
