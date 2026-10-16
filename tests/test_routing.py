"""提问路由（philo_rag/routing.py）：点查询 / 范围查询判定与宽泛主题澄清。"""
from __future__ import annotations

import pytest

from philo_rag.routing import (
    _clarify_bare_topic,
    _clarify_options,
    _core_topic,
    _has_direct_topic_match,
    _topic_anchored,
    clarify_broad_topic,
    classify_question,
    theme_topic,
)


@pytest.mark.parametrize(
    ("question", "expect"),
    [
        ("", "point"),
        ("什么是字头？", "point"),
        ("大他者是什么意思？", "point"),
        ("3-2 讲的是什么？", "point"),
        ("马克思", "theme"),
        ("精神分析", "theme"),
        ("辩证法", "theme"),
        ("谈谈黑格尔", "theme"),
        ("马克思在体系中的位置", "theme"),
        ("黑格尔的思想脉络", "theme"),
        ("四字头为什么强调辩证唯物主义的姿态？", "point"),
    ],
)
def test_classify_question(question, expect, lex):
    assert classify_question(question, lex) == expect


def test_core_topic_strips_question_phrasing():
    assert _core_topic("什么是字头？") == "字头"
    assert _core_topic("马克思在体系中的位置") == "马克思"


def test_theme_topic_prefers_lexicon_anchor(lex):
    assert theme_topic("马克思在体系中的位置", lex) == "马克思"
    assert theme_topic("谈谈精神分析", lex) == "精神分析"


def test_topic_anchored_requires_exact_match(lex):
    assert _topic_anchored("黑格尔", lex) == "黑格尔"
    assert _topic_anchored("黑格尔的辩证法", lex) == ""
    assert _topic_anchored("", lex) == ""


def test_clarify_bare_topic_shape():
    assert _clarify_bare_topic("谈谈黑格尔") == "黑格尔"
    assert _clarify_bare_topic("黑格尔") == "黑格尔"
    # 含限定字的不算裸主题
    assert _clarify_bare_topic("黑格尔和马克思") == ""
    assert _clarify_bare_topic("什么是黑格尔") == ""


def test_clarify_only_for_generative_backend(lex, cfg, api_cfg):
    """离线 template 后端不澄清（cli build 自检依赖 theme 结果）。"""
    assert clarify_broad_topic("谈谈黑格尔", "auto", cfg, lex, backend="template") is None
    assert clarify_broad_topic("谈谈黑格尔", "auto", api_cfg, lex, backend="api") == "黑格尔"
    # 显式指定策略时不澄清
    assert clarify_broad_topic("谈谈黑格尔", "theme", api_cfg, lex, backend="api") is None
    # 非裸主题不澄清
    assert clarify_broad_topic("黑格尔的思想脉络", "auto", api_cfg, lex, backend="api") is None


def test_clarify_options_are_five_with_dispatch_fields():
    options = _clarify_options("黑格尔")
    assert len(options) == 5
    assert {o["strategy"] for o in options} <= {"point", "theme"}
    assert all({"id", "label", "question", "strategy", "focus"} <= set(o) for o in options)
    assert any("黑格尔" in o["question"] for o in options)


def test_has_direct_topic_match(store):
    assert _has_direct_topic_match(store, "字头") is True
    assert _has_direct_topic_match(store, "量子引力波弦论") is False
    assert _has_direct_topic_match(store, "") is False
