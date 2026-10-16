"""溯源回答的「范围查询」分支（theme 策略）。

点查询的提示词要求「3—5 段、不超过 700 字」——它是为**定位一句出处**设计的；
主题式提问要的是相反的东西：按体系结构铺开、覆盖多个单元、保留长引文。
因此这里单独一套链路与提示词，长度约束差一个量级。

三条出口共用一个返回结构（answer + citations，另带 theme 概览）：
  theme_answer         —— 非流式，`answer()` 判定为范围查询时调用
  _theme_answer_stream —— 流式，被 `answer_stream()` 调用
  render_theme         —— template 后端的离线可信基线编辑稿（原文完整段 + 坐标出处）
"""

from __future__ import annotations

import collections
from typing import Any

from .answer_evidence import _sentences, build_annotations, build_glossary
from .answer_prompt import (
    THEME_PROMPT_LEGACY,
    THEME_PROMPT_QUOTE_FIRST,
    THEME_PROMPT_QUOTE_FIRST_STREAM,
    bridge_max,
    focus_guide,
    prompt_style,
)
from .citations import citations_from_theme, group_citation
from .index import Store
from .lexicon import Lexicon
from .llm import api_answer, api_answer_stream, ollama_answer
from .parse import (
    clean_generated_answer,
    parse_structured_answer,
    parse_structured_markdown,
    render_structured_sections,
)

# --------------------------------------------------------------------------- #
# 范围查询策略（溯源回答的 theme 分支）
# --------------------------------------------------------------------------- #
# 点查询的提示词要求「3—5 段、不超过 700 字」——它是为**定位一句出处**设计的。
# 主题式提问要的是相反的东西：按体系结构铺开、覆盖多个单元、保留长引文。
# 因此单独一套提示词，长度约束差一个量级。


def _theme_sentences(text: str, terms: list[str], max_chars: int) -> str:
    """从段落群里挑出与主题最相关的句子，保留原文顺序与完整句。"""
    sents = _sentences(text) or [text]
    # 去重：分块重叠与跨段落群的重复会让同一句反复出现
    seen: set[str] = set()
    uniq: list[tuple[int, str]] = []
    for i, s in enumerate(sents):
        if s in seen:
            continue
        seen.add(s)
        uniq.append((i, s))

    scored: list[tuple[int, int, str]] = []
    for i, s in uniq:
        sc = sum(3 for t in terms if t in s)
        sc += sum(
            2 for m in ("即", "是指", "意味着", "所谓", "核心", "因为", "因此", "但是", "然而", "不是")
            if m in s
        )
        scored.append((sc, i, s))
    picked = [x for x in scored if x[0] > 0]
    picked = sorted(picked, key=lambda x: -x[0])[:8] or sorted(scored, key=lambda x: -len(x[2]))[:3]
    picked.sort(key=lambda x: x[1])
    out: list[str] = []
    used = 0
    for _, _, s in picked:
        if used + len(s) > max_chars and out:
            break
        out.append(s)
        used += len(s)
    return "".join(out) or text[:max_chars]


def _theme_insufficient_text(topic: str, direct_hits: int = 0) -> str:
    """主题证据不足时，返回可验证且不扩写的结果。"""
    if direct_hits:
        return (
            f"资料中只找到“{topic}”的零散提及（{direct_hits}处），"
            "不足以支持对它作全书性的体系分析。下面不把这些孤立提及拼接成"
            "历史因果、人物立场或理论谱系；如需继续核对，建议改用点查询查看原文片段。"
        )
    return (
        f"资料中没有直接出现“{topic}”，因此目前无法据此判断《哲学大纲》"
        "如何讨论这一主题。检索到的语义相近内容不能替代直接证据，"
        "也不能据此推断历史事件、人物立场或理论谱系。"
    )


def render_theme(
    res: dict[str, Any], lex: Lexicon, cfg: dict[str, Any]
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """离线（template 后端）范围查询：可信基线编辑稿。

    每节 = 原文完整段（逐字不改）+ 坐标出处；节标题、排序、分节由代码按
    单元坐标与密度决定，不依赖模型。
    返回 (text, citations, sections, annotations)。
    """
    t_cfg = cfg.get("theme", {}) or {}
    core_n = int(t_cfg.get("core_units", 6))
    ext_n = int(t_cfg.get("extended_units", 6))
    doc_title = "《" + str(cfg.get("doc", {}).get("title", "")) + "》"
    doc_title_plain = str(cfg.get("doc", {}).get("title", ""))

    a, n = res["anchors"], res["counts"]
    units = res["units"]
    core, ext = units[:core_n], units[core_n : core_n + ext_n]

    lines: list[str] = []
    sections: list[dict[str, Any]] = []
    if res["seed_mode"]:
        lines.append("> 该主题未登录词典，锚点由种子检索反推得到。")
        lines.append("")

    # ---- 一、体系定位 ----
    lines.append("### 一、体系定位")
    if a["philosophers"]:
        lines.append(f"- 锚定理论家：{'、'.join(a['philosophers'])}")
    if a["concepts"]:
        lines.append(f"- 锚定概念：{'、'.join(a['concepts'])}")
    if a["units"]:
        lines.append(f"- 锚定单元：{'、'.join(a['units'])}")
    dist = "、".join(f"`{u['code'] or '前言'}` {u['hits']} 块" for u in units[:8])
    lines.append(f"- 密度分布（前 8 单元）：{dist}")
    vols = collections.Counter(u["volume"] for u in units if u["volume"])
    if vols:
        lines.append("- 覆盖卷：" + "、".join(f"{v}（{c} 单元）" for v, c in vols.most_common()))
    lines.append("")

    def _emit_unit(u: dict[str, Any], heading_level: str) -> None:
        """把单个单元渲染为「原文完整段 + 坐标出处」一节。"""
        head = f"{u['code']} {u['title']}".strip() if u["code"] else u["title"]
        lines.append(f"{heading_level} {head}")
        lines.append(f"*{u['volume'] or '—'}｜命中 {u['hits']}/{u['total']} 块（密度 {u['density']}）*")
        lines.append("")
        groups = u.get("selected_groups") or u["groups"]
        paragraphs: list[dict[str, Any]] = []
        for g in groups:
            cite = group_citation(doc_title_plain, u, g)
            lines.append(f"> 出处：{cite}")
            lines.append("")
            lines.append(g["text"])
            lines.append("")
            paragraphs.append({"text": g["text"], "refs": []})
        qs = [q for g in groups for q in g["quotes"] if 10 <= len(q) <= 140]
        if qs:
            terms = [t for t in [res["topic"], *a["philosophers"], *a["concepts"]] if t]
            best = max(qs, key=lambda q: sum(1 for t in terms if t in q) * 100 + len(q))
            lines.append(f"> 「{best}」")
            lines.append("")
        sections.append({
            "heading": head,
            "bridge": "",
            "unit": u["code"],
            "unit_title": u["title"],
            "volume": u["volume"],
            "density": u["density"],
            "hits": u["hits"],
            "paragraphs": paragraphs,
        })

    # ---- 二、核心单元 ----
    lines.append(f"### 二、核心单元（按命中密度，前 {len(core)} 个）")
    for u in core:
        _emit_unit(u, "####")
    lines.append("")

    citations = citations_from_theme(res, doc_title)
    # ---- 三、衍生与谱系 ----
    if res["lineage"] or ext:
        lines.append("### 三、衍生与谱系")
        if res["lineage"]:
            lin = "、".join(f"{name}（{c}）" for name, c in res["lineage"][:12])
            lines.append(f"- 共现理论家（次数）：{lin}")
        if res["eras"]:
            lines.append("- 年代分布：" + "、".join(f"{e}（{c}）" for e, c in res["eras"]))
        for u in ext:
            groups = u.get("selected_groups") or u["groups"]
            if groups:
                _emit_unit(u, "####")
        lines.append("")

    # ---- 四、引用来源 ----
    lines.append("### 四、引用来源")
    for c in citations:
        lines.append(f"- **[{c['n']}]** {c['citation']} · 字符 {c['start']}-{c['end']}")
    lines.append("")
    lines.append(
        f"> 本回答由离线抽取式后端生成（`answer.backend=template`），共聚合 {n['direct']} 块证据、"
        f"上下文 {res['context_chars']} 字。原文段落逐字照录，未做改写。"
    )
    annotations = build_annotations(res["topic"], [res["context"]], lex)
    return "\n".join(lines), citations, sections, annotations


def _theme_generate(
    topic: str,
    res: dict[str, Any],
    doc_title: str,
    lex: Lexicon,
    cfg: dict[str, Any],
    backend: str,
    focus: str | None = None,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """范围查询的 LLM 生成：quote_first 走结构化 JSON，legacy 走自由文本。"""
    style = prompt_style(cfg)
    a_cfg = (cfg or {}).get("answer", {}) or {}
    glossary = build_glossary(topic, [res["context"]], lex)
    if style == "quote_first":
        prompt = THEME_PROMPT_QUOTE_FIRST.format(
            doc_title=doc_title,
            topic=topic,
            glossary=glossary,
            context=res["context"],
            bridge_max_chars=bridge_max(cfg),
            focus_guide=focus_guide(focus),
        )
    else:
        prompt = THEME_PROMPT_LEGACY.format(
            doc_title=doc_title,
            topic=topic,
            glossary=glossary,
            context=res["context"],
            min_chars=int(a_cfg.get("theme_min_chars", 1500)),
            max_chars=int(a_cfg.get("theme_max_chars", 4000)),
        )
    raw = ollama_answer(prompt, cfg) if backend == "ollama" else api_answer(prompt, cfg, strategy="theme")
    if style != "quote_first":
        return clean_generated_answer(raw), [], []
    data = parse_structured_answer(raw)
    if data:
        text = render_structured_sections(data, clean_generated_answer(raw))
        return text, (data.get("sections") or []), (data.get("annotations") or [])
    return clean_generated_answer(raw), [], []


def theme_answer(
    store: Store, lex: Lexicon, topic: str, cfg: dict[str, Any],
    focus: str | None = None,
) -> dict[str, Any]:
    """范围查询策略：主题聚合检索 → 结构化上下文 → 生成 → 附引用。

    这是 `answer()` 在判定为「范围查询」时调用的内部分支，返回结构与点查询一致
    （answer + citations），另带 `theme` 字段给出聚合概览（锚点、单元分布、谱系）。
    也可以直接用 `ask --strategy theme` 显式触发。
    """
    from .theme import theme_search

    res = theme_search(store, lex, topic, cfg)
    backend = cfg["answer"].get("backend", "template")
    doc_title = store.manifest.get("doc_title", "") or cfg.get("doc", {}).get("title", "")

    if not res["units"]:
        text = _theme_insufficient_text(topic, res["counts"]["direct"])
        return {
            "question": topic,
            "topic": topic,
            "kind": "theme",
            "backend": backend,
            "strategy": "theme",
            "skipped": False,
            "gate": None,
            "answer": text,
            "citations": [],
            "sections": [],
            "annotations": [],
            "theme": {
                "seed_mode": res["seed_mode"],
                "anchors": res["anchors"],
                "counts": res["counts"],
                "units": [],
                "lineage": [],
                "eras": [],
            },
        }

    if backend == "template":
        text, citations, sections, annotations = render_theme(res, lex, cfg)
    else:
        text, sections, annotations = _theme_generate(topic, res, doc_title, lex, cfg, backend, focus=focus)
        citations = citations_from_theme(res, doc_title)

    return {
        "question": topic,
        "topic": topic,
        "kind": "theme",
        "backend": backend,
        "strategy": "theme",
        "skipped": False,
        "gate": None,
        "answer": text,
        "citations": citations,
        "sections": sections,
        "annotations": annotations,
        "theme": {
            "seed_mode": res["seed_mode"],
            "anchors": res["anchors"],
            "counts": res["counts"],
            "units": [
                {
                    "code": u["code"],
                    "title": u["title"],
                    "volume": u["volume"],
                    "hits": u["hits"],
                    "total": u["total"],
                    "density": u["density"],
                }
                for u in res["units_all"]
            ],
            "lineage": res["lineage"],
            "eras": res["eras"],
        },
    }


def _theme_answer_stream(
    store: Store, lex: Lexicon, topic: str, cfg: dict[str, Any],
    question: str, gate: dict[str, Any],
    focus: str | None = None,
):
    """范围查询的流式生成，被 answer_stream 调用。"""
    from .theme import theme_search

    res = theme_search(store, lex, topic, cfg)
    backend = cfg["answer"].get("backend", "template")
    doc_title = store.manifest.get("doc_title", "") or cfg.get("doc", {}).get("title", "")

    if not res["units"]:
        text = _theme_insufficient_text(topic, res["counts"]["direct"])
        theme_meta = {
            "seed_mode": res["seed_mode"],
            "anchors": res["anchors"],
            "counts": res["counts"],
            "units": [],
            "lineage": [],
            "eras": [],
        }
        yield {
            "type": "meta",
            "strategy": "theme",
            "backend": backend,
            "gate": gate,
            "skipped": False,
            "citations": [],
            "sections": [],
            "annotations": [],
            "theme": theme_meta,
            "question": question,
        }
        yield {"type": "delta", "text": text}
        yield {"type": "done", "answer": text}
        return

    citations = citations_from_theme(res, doc_title)

    theme_meta = {
        "seed_mode": res["seed_mode"],
        "anchors": res["anchors"],
        "counts": res["counts"],
        "units": [
            {"code": u["code"], "title": u["title"], "volume": u["volume"],
             "hits": u["hits"], "total": u["total"], "density": u["density"]}
            for u in res["units_all"]
        ],
        "lineage": res["lineage"],
        "eras": res["eras"],
    }

    if backend == "template":
        text, citations, sections, annotations = render_theme(res, lex, cfg)
        yield {"type": "meta", "strategy": "theme", "backend": backend, "gate": gate,
               "skipped": False, "citations": citations, "theme": theme_meta,
               "sections": sections, "annotations": annotations,
               "question": question}
        yield {"type": "delta", "text": text}
        yield {"type": "done", "answer": text}
        return

    style = prompt_style(cfg)
    if style == "quote_first":
        prompt = THEME_PROMPT_QUOTE_FIRST_STREAM.format(
            doc_title=doc_title,
            topic=topic,
            glossary=build_glossary(topic, [res["context"]], lex),
            context=res["context"],
            bridge_max_chars=bridge_max(cfg),
            focus_guide=focus_guide(focus),
        )
        yield {"type": "meta", "strategy": "theme", "backend": backend, "gate": gate,
               "skipped": False, "citations": citations, "theme": theme_meta,
               "sections": [], "annotations": [],
               "question": question}

        if backend == "ollama":
            # Ollama 暂不支持流式（与 legacy 分支保持原行为）
            text = clean_generated_answer(ollama_answer(prompt, cfg))
            data = parse_structured_markdown(text)
            sections = (data or {}).get("sections") or []
            annotations = (data or {}).get("annotations") or []
            yield {"type": "delta", "text": text}
            yield {"type": "done", "answer": text, "sections": sections, "annotations": annotations}
            return

        full_text: list[str] = []
        try:
            for chunk in api_answer_stream(prompt, cfg, strategy="theme"):
                full_text.append(chunk)
                yield {"type": "delta", "text": chunk}
        except Exception as exc:
            yield {"type": "error", "detail": str(exc)}
            return
        cleaned = clean_generated_answer("".join(full_text))
        data = parse_structured_markdown(cleaned)
        if data:
            text = render_structured_sections(data, cleaned)
            sections = data.get("sections") or []
            annotations = data.get("annotations") or []
        else:
            text = cleaned
            sections, annotations = [], []
        yield {"type": "done", "answer": text, "sections": sections, "annotations": annotations}
        return

    a_cfg = cfg["answer"]
    prompt = THEME_PROMPT_LEGACY.format(
        doc_title=doc_title,
        topic=topic,
        glossary=build_glossary(topic, [res["context"]], lex),
        context=res["context"],
        min_chars=int(a_cfg.get("theme_min_chars", 1500)),
        max_chars=int(a_cfg.get("theme_max_chars", 4000)),
    )

    yield {"type": "meta", "strategy": "theme", "backend": backend, "gate": gate,
           "skipped": False, "citations": citations, "theme": theme_meta,
           "question": question}

    full_text: list[str] = []
    if backend == "ollama":
        text = ollama_answer(prompt, cfg)
        text = clean_generated_answer(text)
        yield {"type": "delta", "text": text}
        yield {"type": "done", "answer": text}
    else:
        try:
            for chunk in api_answer_stream(prompt, cfg, strategy="theme"):
                full_text.append(chunk)
                yield {"type": "delta", "text": chunk}
        except Exception as exc:
            yield {"type": "error", "detail": str(exc)}
            return
        text = clean_generated_answer("".join(full_text))
        yield {"type": "done", "answer": text}
