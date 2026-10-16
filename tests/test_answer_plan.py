"""问答决策层（philo_rag/answer.py 的 `_plan`）：非流式与流式必须做出同一套决策。

历史实现里 `answer()` 与 `answer_stream()` 各写一遍「闸门 → 语义相关性 → 澄清 →
策略判定」，加一类拦截要改两处、行为容易漂移；本用例把「同题同判」固定成契约。
"""
from __future__ import annotations

from philo_rag.answer import answer, answer_stream

CASES = [
    ("什么是字头？【plan-point】", "point"),
    ("马克思在体系中的位置【plan-theme】", "theme"),
    ("今天天气怎么样【plan-gate】", "gate"),
]


def _stream_meta(events):
    return next(e for e in events if e["type"] == "meta")


def test_answer_and_stream_agree_on_strategy(store, lex, cfg):
    for question, expect in CASES:
        res = answer(store, lex, question, cfg)
        meta = _stream_meta(list(answer_stream(store, lex, question, cfg)))
        assert res["strategy"] == expect, question
        assert meta["strategy"] == expect, question
        assert res["skipped"] == meta["skipped"], question


def test_point_result_carries_route_reason(store, lex, cfg):
    res = answer(store, lex, "什么是字头？【plan-reason】", cfg)
    assert res["strategy"] == "point"
    assert res["route_reason"]


def test_stream_meta_carries_route_reason(store, lex, cfg):
    meta = _stream_meta(list(answer_stream(store, lex, "什么是字头？【plan-stream】", cfg)))
    assert meta["route_reason"]


def test_theme_result_carries_route_reason(store, lex, cfg):
    res = answer(store, lex, "马克思在体系中的位置【plan-theme-reason】", cfg, strategy="theme")
    assert res["strategy"] == "theme"
    assert res["route_reason"] == "显式指定 strategy=theme"
