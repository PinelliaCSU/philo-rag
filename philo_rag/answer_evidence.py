"""生成层证据整备：把检索命中块整理成可溯源的原文证据，并做确定性渲染。

拆分自 `answer.py`：这里只做「证据怎么取、怎么组织、怎么渲染成可信编辑稿」，
不碰提示词与后端调用。核心变化：
  * point 路径不再「每块只取 1 句」，改为取完整段落，并按数值单元把相邻块
    合并为段落群（复用 `theme._aggregate_by_unit`，不重写聚合逻辑）；
  * template 后端渲染为「可信基线编辑稿」：每节 = 原文完整段（逐字不改）+
    坐标出处；节标题、排序、分节由代码按单元坐标与密度决定；
  * 术语解释作为 annotations 数组随 payload 输出，不进正文。
"""
from __future__ import annotations

import collections
import re
from typing import Any

from .citations import group_citation
from .index import Store
from .lexicon import Lexicon
from .retrieve import _definition_terms
from .schema import Chunk

RE_SENT = re.compile(r"[^。！？；\n]+[。！？；]?")

GLOSSARY_MAX_TERMS = 18


# --------------------------------------------------------------------------- #
# 基础工具（原 answer.py 迁入）
# --------------------------------------------------------------------------- #
def _sentences(text: str) -> list[str]:
    return [s.strip() for s in RE_SENT.findall(text) if len(s.strip()) >= 8]


def _query_terms(question: str) -> set[str]:
    """查询词：用与索引一致的分词器，避免把整句当成一个词。"""
    from .index import tokenize

    return {t for t in tokenize(question) if len(t) >= 2}


def _sentence_score(sentence: str, q_terms: set[str], topic_terms: list[str]) -> int:
    score = sum(2 for term in q_terms if term in sentence)
    score += sum(10 for term in topic_terms if term in sentence)
    score += sum(
        8 for term in topic_terms
        if re.search(
            rf"{re.escape(term)}.{{0,40}}(?:即|是指|意味着|定义为|指的是|不是|包含|意味着)",
            sentence,
        )
    )
    score += sum(
        1 for marker in ("因为", "因此", "但是", "然而", "即", "指", "意味着", "核心")
        if marker in sentence
    )
    return score


def _role(sentence: str, topic_terms: list[str]) -> str:
    definition = any(
        re.search(
            rf"{re.escape(term)}.{{0,40}}(?:即|是指|意味着|定义为|指的是|不是|包含)",
            sentence,
        )
        for term in topic_terms
    )
    if definition:
        return "定义"
    if any(marker in sentence for marker in ("场域论", "本体论", "认识论", "目的论", "体系", "字头")):
        return "体系"
    if any(marker in sentence for marker in ("因为", "由于", "通过", "联结", "联想", "反复", "预料", "产生", "形成")):
        return "机制"
    if any(marker in sentence for marker in ("但", "然而", "不能", "消解", "问题", "缺陷", "只是", "第一推动", "局域", "普遍")):
        return "张力"
    if any(term in sentence for term in topic_terms):
        return "展开"
    return "背景"


def _topic_evidence(
    question: str,
    hits: list[dict[str, Any]],
    lex: Lexicon | None,
    limit: int,
) -> list[dict[str, Any]]:
    """旧版「每块只取 1 句」的抽取式证据（保留兼容；新链路请用 build_point_evidence）。"""
    if not hits:
        return []

    q_terms = _query_terms(question)
    topic_terms = _definition_terms(question, lex) if lex else []
    if not topic_terms:
        topic_terms = [
            term for term in q_terms
            if term not in {"什么", "为何", "为什么", "如何", "怎么", "意思", "分别"}
        ]
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for h in hits:
        c: Chunk = h["chunk"]
        sents = _sentences(c.text) or [c.text]
        best_i = max(range(len(sents)), key=lambda i: _sentence_score(sents[i], q_terms, topic_terms))
        selected = sents[best_i]
        # 短句通常是论证的前半句，保留其后的一个句子，避免断章取义。
        if len(selected) < 65 and best_i + 1 < len(sents):
            selected += sents[best_i + 1]
        selected = selected.strip()
        if len(selected) > 260:
            selected = selected[:260].rstrip("，、； ") + "……"
        if selected and selected not in seen:
            candidates.append({
                **h,
                "evidence": selected,
                "role": _role(selected, topic_terms),
                "evidence_score": _sentence_score(selected, q_terms, topic_terms),
            })
            seen.add(selected)

    candidates.sort(key=lambda x: (-x["evidence_score"], -x["score"]))
    selected = candidates[:limit]
    selected.sort(key=lambda x: x["chunk"].seq)
    return selected


# --------------------------------------------------------------------------- #
# 新链路：完整段证据 + 相邻块合并（复用 theme._aggregate_by_unit）
# --------------------------------------------------------------------------- #
def build_point_evidence(
    question: str,
    hits: list[dict[str, Any]],
    store: Store,
    lex: Lexicon,
    cfg: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    """point 证据整备：完整段 + 相邻块按单元合并，保留 unit/vol/char_span/citation。

    与旧版 `_topic_evidence` 的区别：不再「每块只取 1 句」，而是把命中块的
    完整文本交给 `theme._aggregate_by_unit` 按数值单元分桶、桶内合并相邻块为
    段落群，因此证据是**逐字原文**，只被分块切碎、不被人为截句。
    """
    if not hits:
        return []

    from .theme import _aggregate_by_unit

    # 命中块去重（同一 chunk 不会重复出现，但保持稳健）
    blocks: list[Chunk] = []
    score_by_id: dict[str, float] = {}
    seen: set[str] = set()
    for h in hits:
        c: Chunk = h["chunk"]
        if c.chunk_id in seen:
            continue
        seen.add(c.chunk_id)
        blocks.append(c)
        score_by_id[c.chunk_id] = float(h.get("score", 0.0))

    group_gap = int(((cfg or {}).get("theme", {}) or {}).get("group_gap", 3))
    units = _aggregate_by_unit(store, lex, blocks, group_gap)

    q_terms = _query_terms(question)
    topic_terms = _definition_terms(question, lex) if lex else []
    if not topic_terms:
        topic_terms = [
            term for term in q_terms
            if term not in {"什么", "为何", "为什么", "如何", "怎么", "意思", "分别"}
        ]
    doc_title = store.manifest.get("doc_title", "")

    evidence: list[dict[str, Any]] = []
    for u in units:
        for g in u["groups"]:
            text = str(g.get("text", "") or "").strip()
            if not text:
                continue
            best_score = max(
                (score_by_id.get(cid, 0.0) for cid in g.get("chunk_ids", [])),
                default=0.0,
            )
            evidence.append({
                "text": text,
                "unit": u.get("code", ""),
                "unit_title": u.get("title", ""),
                "volume": u.get("volume", ""),
                "hits": u.get("hits", len(g.get("chunk_ids", []))),
                "density": u.get("density", 0.0),
                "char_span": f"{g['start']}-{g['end']}",
                "start": g["start"],
                "end": g["end"],
                "page": g["page"],
                "page_end": g["page_end"],
                "chunk_id": g["chunk_ids"][0] if g["chunk_ids"] else "",
                "chunk_ids": g["chunk_ids"],
                "citation": group_citation(doc_title, u, g),
                "score": best_score,
                "role": _role(text, topic_terms),
                "evidence_score": _sentence_score(text, q_terms, topic_terms),
            })

    # 单元顺序已按命中数/密度排好，组内按段长降序；截断后按原文顺序组织。
    evidence = evidence[:limit]
    evidence.sort(key=lambda x: (x["start"], -x["evidence_score"]))
    return evidence


def _group_evidence_by_unit(evidence: list[dict[str, Any]]) -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """把证据按单元分组；节顺序由单元密度/命中数决定（密度高者在前）。"""
    buckets: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    meta: dict[str, dict[str, Any]] = {}
    for item in evidence:
        key = item["unit"] or "（前言·体例·总纲）"
        buckets[key].append(item)
        if key not in meta:
            meta[key] = {
                "code": item["unit"],
                "title": item["unit_title"],
                "volume": item["volume"],
                "hits": item.get("hits", 1),
                "density": item.get("density", 0.0),
            }
    ordered = sorted(
        buckets.items(),
        key=lambda kv: (
            -meta[kv[0]]["density"],
            -meta[kv[0]]["hits"],
            meta[kv[0]]["code"],
        ),
    )
    return [(meta[k], v) for k, v in ordered]


def build_point_sections(
    question: str,
    evidence: list[dict[str, Any]],
    lex: Lexicon | None,
) -> list[dict[str, Any]]:
    """point 结构化分节：节标题、排序、分节全部由代码按单元坐标与密度决定。"""
    sections: list[dict[str, Any]] = []
    for meta, items in _group_evidence_by_unit(evidence):
        heading = f"{meta['code']} {meta['title']}".strip() if meta["code"] else (meta["title"] or "证据")
        paragraphs = [{"text": item["text"], "refs": []} for item in items]
        sections.append({
            "heading": heading,
            "bridge": "",
            "unit": meta["code"],
            "unit_title": meta["title"],
            "volume": meta["volume"],
            "density": meta["density"],
            "hits": meta["hits"],
            "paragraphs": paragraphs,
        })
    return sections


def render_point_quote_first(
    question: str,
    evidence: list[dict[str, Any]],
    doc_title: str,
    lex: Lexicon | None,
    cfg: dict[str, Any] | None = None,
) -> str:
    """template 后端（点查询）可信基线编辑稿：原文完整段 + 坐标出处。"""
    if not evidence:
        return "资料不足：索引中未找到与问题相关的内容。"

    lines: list[str] = []
    for n, (meta, items) in enumerate(_group_evidence_by_unit(evidence), start=1):
        heading = f"{meta['code']} {meta['title']}".strip() if meta["code"] else (meta["title"] or f"第{n}节")
        sub = meta["volume"] or "—"
        lines.append(f"## {n}、{heading}（{sub}｜密度 {meta['density']}）")
        lines.append("")
        for item in items:
            lines.append(f"> 出处：{item['citation']}")
            lines.append("")
            lines.append(item["text"])
            lines.append("")
    return "\n".join(lines).strip()


# --------------------------------------------------------------------------- #
# 上下文组装与术语速查（原 answer.py 迁入）
# --------------------------------------------------------------------------- #
def build_context(hits: list[dict[str, Any]], doc_title: str) -> str:
    parts: list[str] = []
    for n, h in enumerate(hits, start=1):
        c: Chunk = h["chunk"]
        parts.append(f"[{n}] {c.text}")
    return "\n\n".join(parts)


def build_glossary(question: str, context_texts: list[str], lex: Lexicon,
                   max_terms: int = GLOSSARY_MAX_TERMS) -> str:
    """挑出本次回答会用到的术语，连同词典里已有的一句话定义注入提示词。

    《哲学大纲》正文通篇是本书自造或挪用的术语，模型照抄资料就晦涩难懂。而
    `lexicon/concepts.yaml` 给每个术语都写好了白话定义——这里把它们喂给模型，
    让「术语首次出现时解释一句」有据可依；否则模型要么不解释，要么自己编一个说法。

    选取顺序：问题里出现的术语优先（那才是读者真正在问的），其余按在资料中出现的
    次数排序——在资料里反复出现的，正是模型接下来会写进回答的那批术语。
    """
    if not lex or not lex.concepts:
        return "（本次没有可用的术语定义；遇到术语请用资料中的说法简要说明。）"

    q_counts = _term_counts(question, lex)
    ctx_counts = _term_counts("\n".join(context_texts), lex)

    ranked = sorted(
        set(q_counts) | set(ctx_counts),
        key=lambda name: (
            0 if name in q_counts else 1,
            -(3 * q_counts.get(name, 0) + ctx_counts.get(name, 0)),
            name,
        ),
    )

    lines: list[str] = []
    for name in ranked:
        if len(lines) >= max_terms:
            break
        definition = str(lex.concepts[name].get("definition", "") or "").strip()
        if definition:
            lines.append(f"- {name}：{definition}")
    if not lines:
        return "（本次没有可用的术语定义；遇到术语请用资料中的说法简要说明。）"
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 术语注解（正文之外，随 payload/渲染输出）
# --------------------------------------------------------------------------- #
def _term_counts(text: str, lex: Lexicon) -> dict[str, int]:
    """按词典匹配统计术语出现次数。

    与注解共用同一套别名守卫（`Lexicon.iter_concepts`），避免「道德」里的「道」——
    否则术语注解会挑出根本没在这段资料里出现的词。
    """
    counts: dict[str, int] = {}
    for _start, _end, name in lex.iter_concepts(text):
        counts[name] = counts.get(name, 0) + 1
    return counts


def build_annotations(
    question: str,
    context_texts: list[str],
    lex: Lexicon | None,
    max_terms: int = GLOSSARY_MAX_TERMS,
) -> list[dict[str, str]]:
    """术语注解数组：词典原定义，供前端侧栏/输出层消费，不进正文。"""
    if not lex or not lex.concepts:
        return []

    q_counts = _term_counts(question, lex)
    ctx_counts = _term_counts("\n".join(context_texts), lex)
    ranked = sorted(
        set(q_counts) | set(ctx_counts),
        key=lambda name: (
            0 if name in q_counts else 1,
            -(3 * q_counts.get(name, 0) + ctx_counts.get(name, 0)),
            name,
        ),
    )
    out: list[dict[str, str]] = []
    for name in ranked:
        if len(out) >= max_terms:
            break
        definition = str(lex.concepts[name].get("definition", "") or "").strip()
        if definition:
            out.append({"term": name, "explanation": definition})
    return out
