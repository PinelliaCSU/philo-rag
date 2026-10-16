"""引用核对层（philo_rag/verify.py）：逐句判定与正文/注解切分。

核对层的价值在于「逐字原文 = grounded、编造 = ungrounded」这条线不能松动，
所以正反例直接用真实语料构造，而不是用假语料。
"""
from __future__ import annotations

from philo_rag.verify import (
    CorpusVerifier,
    Thresholds,
    extract_body,
    extract_glossary,
    split_sentences,
)

MARKDOWN = """## 问题

什么是字头？

## 回答

这里是正文第一句，长度足够以通过切句下限。

## 术语注解

- **字头**：坐标系中的一格，由场域论、本体论、认识论、目的论四层坐标决定。

## 引用来源

- [1] 《哲学大纲》 · 1-1 前言 · 字符 0-100
"""


def test_extract_body_keeps_only_the_answer_section():
    body = extract_body(MARKDOWN)
    assert "正文第一句" in body
    assert "什么是字头" not in body           # ## 问题 不进正文
    assert "坐标系中的一格" not in body       # ## 术语注解 不进正文
    assert "引用来源" not in body


def test_extract_glossary_reads_annotation_section_only():
    glossary = extract_glossary(MARKDOWN)
    assert glossary and "坐标系中的一格" in glossary
    assert "正文第一句" not in glossary
    assert extract_glossary("## 回答\n\n没有术语注解节。") is None


def test_split_sentences_merges_short_tail():
    # 切句只按标点断开（标点本身不作为正文保留），过短的句子并入前一句
    sentences = split_sentences("这是一句足够长的句子。短。还有一句足够长的句子。")
    assert sentences == ["这是一句足够长的句子短", "还有一句足够长的句子"]


def test_thresholds_are_configurable():
    th = Thresholds(ngram_n=3)
    assert th.ngram_n == 3 and th.grounded_cover == 0.80


_VERIFIER: CorpusVerifier | None = None


def _verifier(cfg) -> CorpusVerifier:
    """整场只加载一次语料（全量 n-gram 集合构建较慢）。"""
    global _VERIFIER
    if _VERIFIER is None:
        _VERIFIER = CorpusVerifier(cfg["doc"]["source"])
    return _VERIFIER


def _corpus_sentence(cfg) -> str:
    """从语料里取一句长度适中的原文，作为 grounded 正例。"""
    for sentence in split_sentences(_verifier(cfg).text):
        if 20 <= len(sentence) <= 60:
            return sentence
    raise AssertionError("语料中找不到长度适中的句子")


def test_verbatim_corpus_sentence_is_grounded(cfg):
    rep = _verifier(cfg).verify_text(_corpus_sentence(cfg))
    assert [s.verdict for s in rep.sentences] == ["grounded"]
    assert rep.rates()["grounded"] == 1.0


def test_fabricated_sentence_is_ungrounded(cfg):
    fabricated = "这段话由模型凭空编造，用来检验核对层不会放过没有出处的断言。"
    rep = _verifier(cfg).verify_text(fabricated)
    assert [s.verdict for s in rep.sentences] == ["ungrounded"]
    assert rep.rates()["ungrounded"] == 1.0


def test_short_sentence_is_skipped_not_counted(cfg):
    rep = _verifier(cfg).verify_text("好。")
    assert rep.sentences and rep.counted == []
