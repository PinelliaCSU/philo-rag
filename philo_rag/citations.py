"""前端引用条目：把三种来源统一成同一种结构。

溯源回答的引用来自三条不同链路，前端只应该处理一种结构：

  citations_from_hits   点查询的 hybrid_search 命中块（取 Chunk 自带元数据）
  citations_from_groups template 后端的段落群证据（point 路径）
  citations_from_theme  范围查询送入生成器的证据（theme 路径，额外带 evidence_id）

三种来源的字段名、截断与兜底原本各写一遍，容易漏字段（前端不得不对每个字段做 `|| 默认`）。
这里的约定是：**所有字段恒在**，缺省值为空串 / 空数组 / 0，由 `_entry()` 统一补齐；
来源之间的差异只保留在 `citation` 文案、`text` 截断与额外的 `evidence_id` 上。
"""
from __future__ import annotations

from typing import Any

from .lexicon import Lexicon
from .schema import Chunk

# 送入前端的引用正文上限（避免整段长文撑爆卡片）
TEXT_MAX = 1200

# 前端引用面板读取的全部字段；缺省值集中在一处，任何来源都不会漏字段
_FIELDS: dict[str, Any] = {
    "chunk_id": "",
    "citation": "",
    "chapter_path": [],
    "unit": "",
    "unit_title": "",
    "volume": "",
    "char_span": "",
    "start": 0,
    "end": 0,
    "page": 0,
    "chunk_type": "body",
    "philosophers": [],
    "concepts": [],
    "eras": [],
    "coords": [],
    "section_concepts": [],
    "section_philosophers": [],
    "matched_concepts": [],
    "matched_philosophers": [],
    "text": "",
    "score": 0.0,
}


def _entry(n: int, **fields: Any) -> dict[str, Any]:
    """统一的引用条目：`n` + 全部字段（未提供的取缺省值），额外字段原样带出。"""
    entry: dict[str, Any] = {
        k: (list(v) if isinstance(v, list) else v) for k, v in _FIELDS.items()
    }
    entry.update(fields)
    entry["n"] = n
    return entry


def group_citation(doc_title: str, unit: dict[str, Any], group: dict[str, Any]) -> str:
    """段落群的坐标出处：书名 · 单元 · 卷 · 页码 · 字符区间。"""
    parts: list[str] = []
    if doc_title:
        parts.append(f"《{doc_title}》")
    loc = f"{unit['code']} {unit['title']}".strip() if unit.get("code") else unit.get("title", "")
    if loc:
        parts.append(loc)
    if unit.get("volume"):
        parts.append(unit["volume"])
    if group.get("page"):
        parts.append(f"第 {group['page']}–{group['page_end']} 页")
    parts.append(f"字符 {group['start']}-{group['end']}")
    return " · ".join(parts)


def citations_from_hits(
    hits: list[dict[str, Any]], doc_title: str, lex: Lexicon
) -> list[dict[str, Any]]:
    """hybrid_search 的命中块 → 引用（含 char_span，供前端跳转原文并高亮）。

    matched_* 取命中记录里的「查询实体 ∩ 块注解」；块的全部注解仍在 concepts /
    philosophers 里，两者语义不同，前端可以据此区分背景标签与本次命中。
    """
    citations: list[dict[str, Any]] = []
    for n, h in enumerate(hits, start=1):
        c: Chunk = h["chunk"]
        citations.append(
            _entry(
                n,
                chunk_id=c.chunk_id,
                citation=c.citation(doc_title),
                chapter_path=c.chapter_path,
                unit=c.unit_code(),
                unit_title=lex.unit_title(c.unit_code()),
                volume=c.volume(),
                char_span=f"{c.start}-{c.end}",
                start=c.start,
                end=c.end,
                page=c.page,
                chunk_type=c.chunk_type,
                philosophers=c.philosophers,
                concepts=c.concepts,
                eras=c.eras,
                coords=c.coords,
                section_concepts=c.section_concepts,
                section_philosophers=c.section_philosophers,
                matched_concepts=h.get("matched_concepts", []),
                matched_philosophers=h.get("matched_philosophers", []),
                text=c.text,
                score=round(float(h.get("score", 0.0)), 6),
            )
        )
    return citations


def citations_from_groups(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """段落群证据（template 后端的 point 路径）→ 引用。证据自带 citation 文案。"""
    citations: list[dict[str, Any]] = []
    for n, e in enumerate(evidence, start=1):
        citations.append(
            _entry(
                n,
                chunk_id=e.get("chunk_id", ""),
                citation=e.get("citation", ""),
                unit=e.get("unit", ""),
                unit_title=e.get("unit_title", ""),
                volume=e.get("volume", ""),
                char_span=e.get("char_span", ""),
                start=e.get("start", 0),
                end=e.get("end", 0),
                page=e.get("page", 0),
                text=str(e.get("text", ""))[:TEXT_MAX],
                score=round(float(e.get("score", 0.0) or 0.0), 6),
            )
        )
    return citations


def citations_from_theme(res: dict[str, Any], doc_title: str) -> list[dict[str, Any]]:
    """范围查询证据 → 引用（带 evidence_id，与送入生成器的证据逐条对应）。"""
    anchors = res["anchors"]
    citations: list[dict[str, Any]] = []
    for n, evidence in enumerate(res.get("evidence", []), start=1):
        citations.append(
            _entry(
                n,
                evidence_id=evidence["id"],
                chunk_id=evidence["chunk_id"],
                citation=(
                    f"{doc_title} · {evidence['unit']} {evidence['unit_title']} · "
                    f"第 {evidence['page']}–{evidence['page_end']} 页 · {evidence['evidence_type']}"
                ),
                unit=evidence["unit"],
                unit_title=evidence["unit_title"],
                volume=evidence["volume"],
                char_span=f"{evidence['start']}-{evidence['end']}",
                start=evidence["start"],
                end=evidence["end"],
                page=evidence["page"],
                philosophers=anchors["philosophers"],
                concepts=anchors["concepts"],
                text=str(evidence["text"])[:TEXT_MAX],
                score=evidence["score"],
            )
        )
    return citations
