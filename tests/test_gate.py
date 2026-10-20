"""问题闸门（philo_rag/gate.py）：放行 / 拦截用例。"""
from __future__ import annotations

import pytest

from philo_rag.gate import check_question, check_relevance, skip_answer

# (问题, 期望是否放行)
CASES: list[tuple[str, bool]] = [
    # ---- 应当放行：指向本书内容的提问 ----
    ("什么是字头？", True),
    ("场域论、本体论、认识论、目的论这四层分别规定什么？", True),
    ("大他者怎么理解？", True),
    ("谢林和黑格尔的分歧在哪？", True),
    ("3-2 讲的是什么？", True),
    ("存在者整体是什么意思？", True),
    ("字头", True),
    ("辩证法", True),
    ("拉康", True),
    ("什么是幸福？", True),
    ("为什么说不可能是乌托邦的基本规定？", True),
    ("阿赖耶识", True),
    # ---- 应当拦截：不适合检索的问题 ----
    ("你好", False),
    ("谢谢你！", False),
    ("ok", False),
    ("你是谁", False),
    ("这个知识库怎么用", False),
    ("介绍一下你自己", False),
    ("今天天气怎么样", False),
    ("股票涨了吗", False),
    ("写一首诗", False),
    ("继续", False),
    ("然后呢", False),
    ("详细点", False),
    ("什么是", False),
    ("?", False),
]

# 语义相关性格挡用例：硬编码模式覆盖不到的垃圾输入应当被 `irrelevant` 兜底，
# 而无锚点但确实指向哲学内容的提问应当放行。
RELEVANCE_CASES: list[tuple[str, bool]] = [
    # ---- 无锚点、但与语料相关，应当放行 ----
    ("什么是幸福", True),
    ("阿赖耶识", True),
    ("禅宗怎么看空性", True),
    ("德里达的延异", True),
    ("现象学还原是什么意思", True),
    # ---- 无锚点、且与语料无关，应当被语义相关性拦截 ----
    ("红烧肉怎么做", False),
    ("阿巴阿巴阿巴", False),
    ("qwertyuiop", False),
    ("如何修复家里的水管漏水", False),
    ("推荐几部好看的电影", False),
    ("明天去北京坐哪趟高铁", False),
    ("如何减肥", False),
    ("王者荣耀怎么上分", False),
    ("买房首付多少", False),
]

# 语义相关性用例要逐条跑一次检索，抽一部分代表用例即可
RELEVANCE_SAMPLE = RELEVANCE_CASES[:3] + RELEVANCE_CASES[-4:]


def combined_gate(store, lex, cfg, question: str) -> dict:
    """与 `answer()` 一致的闸门组合：规则闸门 → 语义相关性兜底。"""
    gate = check_question(question, lex, cfg)
    if not gate["ok"]:
        return gate
    if cfg.get("gate", {}).get("relevance", True) and gate.get("anchor") is False:
        return check_relevance(store, question, cfg)
    return gate


@pytest.mark.parametrize(("question", "expect"), CASES)
def test_rule_gate(question, expect, lex, cfg):
    gate = check_question(question, lex, cfg)
    assert gate["ok"] is expect, f"{question} → {gate['category']} / {gate['reason']}"


@pytest.mark.parametrize(("question", "expect"), RELEVANCE_SAMPLE)
def test_gate_with_relevance_fallback(question, expect, lex, cfg, store):
    """规则闸门 + 语义相关性兜底，与 answer() 里的组合保持一致。"""
    gate = combined_gate(store, lex, cfg, question)
    assert gate["ok"] is expect, f"{question} → {gate['category']} / {gate['reason']}"


@pytest.mark.parametrize("question", ["你好", "今天天气怎么样", "什么是"])
def test_gate_returns_reason_category_and_skip_answer(question, lex, cfg):
    gate = check_question(question, lex, cfg)
    assert gate["ok"] is False
    assert gate["category"] and gate["reason"]
    assert skip_answer(gate), "被拦截时也要给出可读的答复文案"
