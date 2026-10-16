"""问答主链路（philo_rag/answer.py + answer_theme.py）的端到端结构契约。

离线 template 后端跑真实检索，不联网；api 分支用 monkeypatch 替换后端函数，
只验证「提示词 → 模型输出 → 解析 → 渲染 → 引用」这段编排没被改坏。

每个用例的问题都带唯一后缀：答案有 LRU 缓存（(question, strategy) → 结果），
复用同一个问题串会让后面的用例直接命中缓存、绕过被测分支。
"""
from __future__ import annotations

import json

from philo_rag import answer as answer_mod
from philo_rag.answer import answer, answer_stream

JSON_OUT = json.dumps(
    {
        "sections": [
            {
                "heading": "字头",
                "bridge": "衔接语。",
                "paragraphs": [{"text": "原文段落。", "refs": [1]}],
            }
        ],
        "annotations": [{"term": "字头", "explanation": "坐标系中的一格。"}],
    },
    ensure_ascii=False,
)

MARKDOWN_OUT = (
    "### 字头\n"
    "衔接语。\n"
    "原文段落甲。[1]\n"
    "## 术语注解\n"
    "- **字头**：坐标系中的一格。\n"
)


def _meta_done(events):
    meta = [e for e in events if e["type"] == "meta"][0]
    done = [e for e in events if e["type"] == "done"][-1]
    return meta, done


# --------------------------------------------------------------------------- #
# 离线 template 后端
# --------------------------------------------------------------------------- #
def test_point_template_returns_sections_citations_annotations(store, lex, cfg):
    res = answer(store, lex, "什么是字头？【template-point】", cfg)
    assert res["strategy"] == "point"
    assert res["skipped"] is False
    assert len(res["answer"]) > 100
    assert res["citations"] and res["sections"]
    assert res["annotations"]
    assert [c["n"] for c in res["citations"]] == list(range(1, len(res["citations"]) + 1))
    # 离线稿的正文逐字来自原文，出处写在正文里
    assert "出处：" in res["answer"]


def test_theme_template_returns_theme_meta(store, lex, cfg):
    res = answer(store, lex, "马克思在体系中的位置【template-theme】", cfg, strategy="theme")
    assert res["strategy"] == "theme" and res["kind"] == "theme"
    assert res["theme"]["units"], "范围查询必须给出单元分布"
    assert res["theme"]["anchors"]["philosophers"] or res["theme"]["anchors"]["concepts"]
    assert res["citations"], "范围查询同样要能回跳原文"
    assert len(res["answer"]) > 500


def test_gate_short_circuits_before_retrieval(store, lex, cfg):
    res = answer(store, lex, "今天天气怎么样【template-gate】", cfg)
    assert res["skipped"] is True
    assert res["strategy"] == "gate"
    assert res["citations"] == []
    assert res["answer"]


def test_clarify_short_circuits_on_api_backend(store, lex, api_cfg):
    res = answer(store, lex, "谈谈黑格尔", api_cfg)
    assert res["strategy"] == "clarify"
    assert res["topic"] == "黑格尔"
    assert len(res["options"]) == 5
    assert res["citations"] == []


def test_point_stream_event_sequence(store, lex, cfg):
    events = list(answer_stream(store, lex, "什么是字头？【template-stream】", cfg))
    meta, done = _meta_done(events)
    assert [e["type"] for e in events] == ["meta", "delta", "done"]
    assert meta["citations"], "meta 事件必须先把引用发给前端"
    assert done["answer"] == "".join(e["text"] for e in events if e["type"] == "delta")


def test_theme_stream_carries_theme_meta(store, lex, cfg):
    events = list(
        answer_stream(store, lex, "精神分析在体系中的位置【template-theme-stream】", cfg)
    )
    meta, done = _meta_done(events)
    assert meta["strategy"] == "theme"
    assert meta["theme"]["counts"], "meta 要带聚合概览，前端据此渲染分布"
    assert meta["citations"], "范围查询也要先把引用发给前端"
    # template 后端的离线稿由代码分节，sections 只在 meta 里给（正文本身已是分好的 Markdown）
    assert meta["sections"] and done["answer"]


# --------------------------------------------------------------------------- #
# api 后端（monkeypatch，不联网）
# --------------------------------------------------------------------------- #
def test_point_api_json_output_is_parsed(store, lex, api_cfg, monkeypatch):
    seen: dict[str, str] = {}

    def fake_api(prompt: str, cfg: dict, strategy: str = "point") -> str:
        seen["strategy"] = strategy
        return JSON_OUT

    monkeypatch.setattr(answer_mod, "api_answer", fake_api)
    res = answer(store, lex, "什么是字头？【api-json】", api_cfg)
    assert seen["strategy"] == "point"
    assert res["sections"][0]["heading"] == "字头"
    assert res["sections"][0]["paragraphs"][0]["text"] == "原文段落。"
    assert res["annotations"] == [{"term": "字头", "explanation": "坐标系中的一格。"}]
    assert res["citations"]


def test_point_api_stream_renders_markdown_sections(store, lex, api_cfg, monkeypatch):
    def fake_stream(prompt: str, cfg: dict, strategy: str = "point"):
        yield from MARKDOWN_OUT.splitlines(True)

    monkeypatch.setattr(answer_mod, "api_answer_stream", fake_stream)
    events = list(answer_stream(store, lex, "什么是字头？【api-stream】", api_cfg))
    meta, done = _meta_done(events)
    assert meta["citations"]
    assert done["sections"][0]["heading"] == "字头"
    assert done["sections"][0]["bridge"] == "衔接语。"
    assert "原文段落甲。" in done["answer"]
    assert done["annotations"] == [{"term": "字头", "explanation": "坐标系中的一格。"}]


def test_api_stream_error_is_reported_not_raised(store, lex, api_cfg, monkeypatch):
    def broken_stream(prompt: str, cfg: dict, strategy: str = "point"):
        raise RuntimeError("模型调用失败：测试桩")
        yield  # pragma: no cover —— 让函数保持生成器语义

    monkeypatch.setattr(answer_mod, "api_answer_stream", broken_stream)
    events = list(answer_stream(store, lex, "什么是字头？【api-broken】", api_cfg))
    assert events[-1]["type"] == "error"
    assert "测试桩" in events[-1]["detail"]


def test_theme_api_json_output_is_parsed(store, lex, api_cfg, monkeypatch):
    from philo_rag import answer_theme

    seen: dict[str, str] = {}

    def fake_api(prompt: str, cfg: dict, strategy: str = "point") -> str:
        seen["strategy"] = strategy
        return JSON_OUT

    monkeypatch.setattr(answer_theme, "api_answer", fake_api)
    res = answer(store, lex, "精神分析在体系中的位置【api-theme-json】", api_cfg, strategy="theme")
    assert seen["strategy"] == "theme"
    assert res["sections"][0]["heading"] == "字头"
    assert res["citations"], "范围查询的引用来自 theme 证据，不依赖模型输出"
