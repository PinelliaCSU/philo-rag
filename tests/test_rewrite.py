"""追问改写（philo_rag/rewrite.py）：纯规则，不加载模型、不联网。

用例对应 temp.md §4 T1 的验收清单：改写发生在闸门之前，所以这里只断言「改成什么」，
闸门的放行与否由 tests/test_gate.py 保持原期望值。
"""
from __future__ import annotations

from philo_rag.conv import Turn
from philo_rag.rewrite import rewrite_followup


def _point_turn(**kw) -> Turn:
    base = {
        "question": "什么是字头？",
        "standalone": "什么是字头？",
        "strategy": "point",
        "focus": "definition",
        "digest": "字头是坐标系中的一格。",
    }
    return Turn(**{**base, **kw})


def _theme_turn(**kw) -> Turn:
    base = {
        "question": "黑格尔",
        "standalone": "黑格尔在体系中的位置",
        "strategy": "theme",
        "topic": "黑格尔",
        "focus": "position",
    }
    return Turn(**{**base, **kw})


def test_pure_followup_without_context_is_not_a_followup():
    """无上文时「继续」不得生效：仍让 gate 的 fragment 拦下，文案保持原样。"""
    rw = rewrite_followup("继续", [], None)
    assert rw.is_followup is False
    assert rw.standalone == "继续"


def test_pure_followup_inherits_last_standalone():
    """有上文（point + definition）时「继续」= 上一轮的独立问题 + 一句侧重。"""
    last = _point_turn()
    rw = rewrite_followup("继续", [last], None)
    assert rw.is_followup is True
    assert rw.standalone == last.standalone
    assert rw.hint
    assert rw.downgrade is False


def test_topic_switch_composes_full_question_from_theme_position():
    """「那黑格尔呢」+ 上文(theme+position) → 「黑格尔在体系中的位置」。"""
    rw = rewrite_followup("那黑格尔呢", [_theme_turn()], None)
    assert rw.standalone == "黑格尔在体系中的位置"
    assert rw.is_followup is True
    # 绝不允许输出裸词：裸词会再触发 routing 的裸主题澄清（死循环）
    assert rw.standalone.strip() != "黑格尔"


def test_compare_followup_carries_both_terms():
    """「和康德比呢」+ 上文(主题=大他者) → 同时含「大他者」与「康德」。"""
    last = Turn(
        question="大他者是什么？",
        standalone="大他者是什么？",
        strategy="point",
        topic="大他者",
    )
    rw = rewrite_followup("和康德比呢", [last], None)
    assert "大他者" in rw.standalone
    assert "康德" in rw.standalone
    assert rw.is_followup is True


def test_pure_followup_after_theme_downgrades_to_point():
    """上一轮 theme + 「详细点」→ downgrade=True（避免重跑数千字的范围查询）。"""
    rw = rewrite_followup("详细点", [_theme_turn()], None)
    assert rw.downgrade is True
    assert rw.is_followup is True


def test_independent_question_passes_through(lex):
    """完整独立问句原样返回：改写不能改动与上文无关的提问。"""
    rw = rewrite_followup("什么是字头？", [_point_turn()], lex)
    assert rw.is_followup is False
    assert rw.standalone == "什么是字头？"
    assert rw.downgrade is False


def test_unknown_topic_still_composed(lex):
    """词典未收录的话题也要合成完整问句，否则未登录主题永远接不上上文。"""
    rw = rewrite_followup("那阿赖耶识呢", [_point_turn()], lex)
    assert rw.is_followup is True
    assert "阿赖耶识" in rw.standalone
    assert rw.standalone != "阿赖耶识"


def test_topic_switch_without_context_keeps_bare_topic_only():
    """无上文时「那X呢」只剥出话题（交给系统自己路由 / 澄清）。"""
    rw = rewrite_followup("那黑格尔呢", [], None)
    assert rw.standalone == "黑格尔"
    assert rw.is_followup is False
