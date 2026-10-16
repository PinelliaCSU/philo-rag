"""生成层输出解析：模型返回文本的清洗、结构化提取与确定性渲染。

模型（无论走 api 还是 ollama）返回的都是自由文本，这里负责把它变成可信结构：
  clean_generated_answer     —— 剥掉模型重复输出的「来源」行（来源由 citations 区域统一展示）
  parse_structured_markdown  —— 解析 *_QUOTE_FIRST_STREAM 约定的 Markdown 分节输出
  parse_structured_answer    —— 解析 quote_first（非流式）约定的 JSON 输出
  render_structured_sections —— 把 sections 确定性渲染为 Markdown，排版不交给模型

解析一律 best-effort：格式不合约定时返回 None，调用方回退到原始文本，不因格式丢内容。
"""

from __future__ import annotations

import json
import re
from typing import Any


def clean_generated_answer(text: str) -> str:
    """移除模型重复输出的来源行，来源统一由下方 citations 区域展示。"""
    lines = []
    for line in text.strip().splitlines():
        if re.match(r"^\s*(?:出处|来源|引用来源)\s*[:：]", line):
            continue
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


_RE_ANNOTATION = re.compile(r"^-\s*\**(.+?)\**\s*[:：]\s*(.+?)\s*$")
_RE_TRAILING_REFS = re.compile(r"\s*(\[(?:E)?\d+\](?:\s*\[(?:E)?\d+\])*)\s*$")


def _split_trailing_refs(line: str) -> tuple[str, list[str]]:
    """把行尾的 [1][3] / [E01] 引用编号拆成 (正文, refs)。"""
    m = _RE_TRAILING_REFS.search(line)
    if not m:
        return line.strip(), []
    refs = re.findall(r"\[(E?\d+)\]", m.group(1))
    return line[: m.start()].strip(), refs


def _flush_markdown_paragraph(
    cur: dict[str, Any] | None,
    buffer: list[str],
    *,
    as_final: bool,
) -> None:
    """把累积的无引用编号行冲刷为 bridge 或 paragraph。"""
    if cur is None or not buffer:
        buffer.clear()
        return
    text = "".join(buffer).strip()
    buffer.clear()
    if not text:
        return
    if (
        not as_final
        and not cur["paragraphs"]
        and not cur["bridge"]
        and len(text) <= 120
    ):
        # 节标题后、首个带引用编号段落之前出现的短句 → 衔接语
        cur["bridge"] = text
    else:
        cur["paragraphs"].append({"text": text, "refs": []})


def parse_structured_markdown(raw: str) -> dict[str, Any] | None:
    """从流式 quote_first 的 Markdown 输出提取 sections 与 annotations（best-effort）。

    预期格式（由 *_QUOTE_FIRST_STREAM 提示词固定）：
        ### 节标题
        （可选一句衔接语）
        原文段落 [1][3]
        ## 术语注解
        - **术语**：不超过25字白话解释

    解析失败（没有任何 ### 节）返回 None。先剥掉可能的 ``` 代码块围栏。
    """
    if not raw:
        return None
    text = raw.strip()
    fence = re.search(r"```(?:markdown|md)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()

    sections: list[dict[str, Any]] = []
    annotations: list[dict[str, str]] = []
    cur: dict[str, Any] | None = None
    buffer: list[str] = []
    in_annotations = False

    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("## "):
            _flush_markdown_paragraph(cur, buffer, as_final=True)
            in_annotations = "术语注解" in s
            cur = None
            continue
        if in_annotations:
            m = _RE_ANNOTATION.match(s)
            if m:
                term = m.group(1).strip().strip("*").strip()
                explanation = m.group(2).strip()
                if term:
                    annotations.append({"term": term, "explanation": explanation})
            continue
        if s.startswith("### "):
            _flush_markdown_paragraph(cur, buffer, as_final=True)
            cur = {"heading": s[4:].strip(), "bridge": "", "paragraphs": []}
            sections.append(cur)
            continue
        if cur is None:
            continue
        body, refs = _split_trailing_refs(s)
        if refs:
            _flush_markdown_paragraph(cur, buffer, as_final=False)
            if body:
                cur["paragraphs"].append({"text": body, "refs": refs})
        else:
            buffer.append(s)

    _flush_markdown_paragraph(cur, buffer, as_final=True)

    if not sections:
        return None
    return {"sections": sections, "annotations": annotations}


def parse_structured_answer(raw: str) -> dict[str, Any] | None:
    """从 LLM 输出中宽松提取 JSON（容忍 ```json 代码块与前后缀）。"""
    if not raw:
        return None
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def render_structured_sections(data: dict[str, Any], fallback: str = "") -> str:
    """把 LLM 输出的 sections 确定性渲染为 Markdown（模型不负责排版）。"""
    sections = (data or {}).get("sections") or []
    if not sections:
        return fallback or "资料不足：索引中未找到与问题相关的内容。"
    lines: list[str] = []
    for i, sec in enumerate(sections, start=1):
        if not isinstance(sec, dict):
            continue
        heading = str(sec.get("heading") or f"第{i}节").strip()
        lines.append(f"### {heading}")
        bridge = str(sec.get("bridge") or "").strip()
        if bridge:
            lines.append(bridge)
            lines.append("")
        for p in sec.get("paragraphs") or []:
            if not isinstance(p, dict):
                continue
            text = str(p.get("text") or "").strip()
            if not text:
                continue
            refs = p.get("refs") or []
            suffix = "".join(f"[{r}]" for r in refs)
            lines.append(f"{text} {suffix}".strip())
            lines.append("")
    return "\n".join(lines).strip()
