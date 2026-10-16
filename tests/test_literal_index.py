"""字面命中候选（字符倒排）与全库扫描必须逐块等价。

「理性」可能出现在「合理性」里、「无」可能只是更大词的一部分——若按 jieba 词元
建索引就会静默漏召回。所以实现用字符倒排取超集、再逐块 `in` 复核，本用例把
「候选集过滤后的结果 == 全库扫描结果」这条等价性质固定下来。
"""
from __future__ import annotations

import pytest

TERMS = [
    "字头",
    "理性",
    "合理性",
    "大他者",
    "无",
    "精神分析",
    "存在者整体",
    "主义主义",
    "量子引力波弦论",
]


@pytest.mark.parametrize("term", TERMS)
def test_candidate_verification_equals_full_scan(store, term):
    via_candidates = {i for i in store.literal_candidates([term]) if term in store.chunks[i].text}
    brute = {i for i, c in enumerate(store.chunks) if term in c.text}
    assert via_candidates == brute


def test_empty_terms_yield_no_candidates(store):
    assert store.literal_candidates([]) == set()
    assert store.literal_candidates([""]) == set()


def test_type_inverted_matches_filter_and_manifest(store):
    quotes = {c.chunk_id for c in store.quotes()}
    assert quotes == store.filter_ids(chunk_type="quote")
    assert len(quotes) == store.manifest["quote_count"]


def test_index_of_and_by_id_agree(store):
    chosen = store.chunks[1234]
    assert store.index_of(chosen.chunk_id) == 1234
    assert store.by_id(chosen.chunk_id) is chosen
    assert store.by_id("不存在#c00000") is None
