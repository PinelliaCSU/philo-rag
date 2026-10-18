"""问题闸门（philo_rag/gate.py）：放行 / 拦截用例，复用 tests/gate_cases.py 的用例表。"""
from __future__ import annotations

import pytest

from philo_rag.gate import check_question, skip_answer
from gate_cases import CASES, RELEVANCE_CASES, combined_gate

# 语义相关性用例要逐条跑一次检索，抽一部分代表用例即可（全量见 tests/gate_cases.py）
RELEVANCE_SAMPLE = RELEVANCE_CASES[:3] + RELEVANCE_CASES[-4:]


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
