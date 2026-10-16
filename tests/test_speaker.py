"""引文说话人归因（philo_rag/ingest.py）：宁可置空也不误配。

归因走「人名紧邻引文 + 同句内有引述标记」的严格规则，覆盖率天然偏低（约 2%）：
语料里绝大多数引文是举例、假想对话或整理者旁述。这里守住两端——
该认的认（合成用例），不该认的不认（覆盖率不许异常膨胀）。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from philo_rag.ingest import extract_quotes, find_speaker, load_segments

SPEAKER_SENTENCE = "黑格尔说：「这一句话是我说的。」这句话常被引用。"


def test_quote_extraction_spans_inner_text():
    quotes = extract_quotes(SPEAKER_SENTENCE, min_chars=6)
    assert quotes, "「…」成对标记必须能被抽出"
    inner, start, end = quotes[0]
    assert SPEAKER_SENTENCE[start:end] == inner


def test_name_before_quote_with_verb_is_attributed(lex):
    inner, start, end = extract_quotes(SPEAKER_SENTENCE, min_chars=6)[0]
    assert find_speaker(SPEAKER_SENTENCE, start, end, lex) == "黑格尔"


def test_quote_without_speaker_marker_stays_empty(lex):
    text = "「这一句话没有出现任何人名，也没有引述动词。」"
    inner, start, end = extract_quotes(text, min_chars=6)[0]
    assert find_speaker(text, start, end, lex) == ""


def test_mention_in_previous_sentence_is_not_attributed(lex):
    """跨句提及只是语境，不能算说话人。"""
    text = "黑格尔写过很多书。这里引用的是：「这一句话是我说的。」"
    inner, start, end = extract_quotes(text, min_chars=6)[0]
    assert find_speaker(text, start, end, lex) == ""


def test_corpus_attribution_coverage_stays_low_but_positive(cfg, lex):
    """全量语料回归：归因数不能为 0（规则失效），也不能异常膨胀（误配）。"""
    segments = load_segments(Path(cfg["doc"]["source"]))
    full = "\n".join(text for _, text in segments)
    quotes = extract_quotes(full, min_chars=12)
    assert len(quotes) > 100
    named = sum(1 for _, s, e in quotes if find_speaker(full, s, e, lex))
    ratio = named / len(quotes)
    assert named > 0, "说话人归因一条都没命中，规则可能已失效"
    assert ratio < 0.10, f"归因覆盖率 {ratio:.2%} 异常偏高，疑似误配放宽"


@pytest.mark.parametrize("pages", [1, 3])
def test_load_segments_splits_by_page_marker(tmp_path, pages):
    text = "第1页内容" + "".join(
        f"\n<<<PAGE {i}>>>\n第{i}页内容" for i in range(2, pages + 1)
    )
    path = tmp_path / "pages.txt"
    path.write_text(text, encoding="utf-8")
    segments = load_segments(path)
    assert [n for n, _ in segments] == list(range(1, pages + 1))
