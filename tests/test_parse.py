"""生成层输出解析（philo_rag/parse.py）：Markdown 分节、JSON 分节、确定性渲染与清洗。"""
from __future__ import annotations

from philo_rag.parse import (
    clean_generated_answer,
    parse_structured_answer,
    parse_structured_markdown,
    render_structured_sections,
)

MARKDOWN_OUT = """### 第一节 字头
一句衔接话。
原文段落甲。[1][2]
原文段落乙。[3]
## 术语注解
- **字头**：坐标系中的一格。
"""


def test_markdown_sections_paragraphs_and_annotations():
    data = parse_structured_markdown(MARKDOWN_OUT)
    assert data is not None
    (sec,) = data["sections"]
    assert sec["heading"] == "第一节 字头"
    assert sec["bridge"] == "一句衔接话。"
    assert [p["text"] for p in sec["paragraphs"]] == ["原文段落甲。", "原文段落乙。"]
    assert sec["paragraphs"][0]["refs"] == ["1", "2"]
    assert data["annotations"] == [{"term": "字头", "explanation": "坐标系中的一格。"}]


def test_markdown_strips_code_fence():
    data = parse_structured_markdown("```markdown\n" + MARKDOWN_OUT + "```\n")
    assert data is not None and len(data["sections"]) == 1


def test_markdown_without_sections_returns_none():
    assert parse_structured_markdown("没有节标题的一段话。") is None
    assert parse_structured_markdown("") is None


def test_short_unreferenced_prefix_becomes_bridge():
    md = "### 节\n短衔接语。\n原文段落甲。[1]\n"
    sec = parse_structured_markdown(md)["sections"][0]
    assert sec["bridge"] == "短衔接语。"
    assert [p["text"] for p in sec["paragraphs"]] == ["原文段落甲。"]


def test_long_unreferenced_prefix_stays_paragraph():
    """超过 120 字的无引用段落不能被当成衔接语吞掉。"""
    md = "### 节\n" + "没有引用编号的长句。" * 13 + "\n原文段落甲。[1]\n"
    sec = parse_structured_markdown(md)["sections"][0]
    assert sec["bridge"] == ""
    assert len(sec["paragraphs"]) == 2


def test_parse_structured_answer_extracts_json_from_fence():
    raw = '```json\n{"sections": [{"heading": "甲"}], "annotations": []}\n```'
    assert parse_structured_answer(raw)["sections"][0]["heading"] == "甲"
    assert parse_structured_answer("不是 JSON") is None
    assert parse_structured_answer("") is None


def test_render_structured_sections_is_deterministic():
    data = {
        "sections": [
            {"heading": "甲", "bridge": "衔接。", "paragraphs": [{"text": "原文", "refs": [1, 3]}]}
        ]
    }
    out = render_structured_sections(data, "fallback")
    assert out == "### 甲\n衔接。\n\n原文 [1][3]"
    assert render_structured_sections({}, "fallback") == "fallback"
    assert render_structured_sections({}, "") == "资料不足：索引中未找到与问题相关的内容。"


def test_clean_generated_answer_drops_source_lines():
    raw = "正文第一句。\n来源：某处\n出处：某处\n\n正文第二句。"
    assert clean_generated_answer(raw) == "正文第一句。\n\n正文第二句。"
