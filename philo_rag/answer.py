"""生成层：引用溯源问答（单入口，内部按问题类型分策略）。

三种后端（由 config.yaml 的 answer.backend 选择，默认 api）：
  api      —— 任意 OpenAI 兼容 /chat/completions 接口（默认；默认接阿里云百炼 DashScope）
  ollama   —— 本地模型（qwen2.5 / llama3 等），数据不出本机
  template —— 离线抽取式，不调用任何模型，直接给出带引用的原文片段（用于自检与降级）

无论哪种后端、哪种策略，返回结构一致：answer + citations，
前端可据 citations 跳转原文并高亮。对使用者而言只有一个「溯源回答」入口。

链路（两道前置关卡 + 类型判定 + 检索 + 生成）：

    问题 ─▶ ① 问题闸门 gate.check_question
              │ 不通过 → 直接返回 skipped，不触发任何检索
              ▼ 通过
            ①b 语义相关性格挡 gate.check_relevance（无锚点且与语料相似度过低 → skipped）
              ▼ 通过
            ② 类型判定 classify_question ──┬─ point ─▶ hybrid_search（top-k 少而准）
              │                            └─ theme ─▶ theme_search（高召回 + 按单元聚合）
              ▼
            ③ 证据筛选 / 上下文组装 ─▶ 生成 ─▶ answer + citations[]

**两条策略回答的是同一个「溯源回答」版块的问题**，不是两个并列版块：
  point —— 「什么是字头？」这类定位式提问：3—5 段、数百字，每条论断可回跳原文；
  theme —— 「马克思在体系中的位置」这类主题式提问：按体系结构分节、数千字，
           与离线时代的「专题提炼稿」同量级（召回数百块、覆盖数十个数值单元）。

② 刻意不做元数据筛选：早期版本允许 `--unit` / `--concept` 等条件先缩小候选池再检索，
结果是把「定义概念的段落」挡在池外——概念的定义句往往出现在前言、总纲或别的单元里，
一旦按单元/概念过滤，召回反而被截断。所以问答链路固定为**整篇检索**：
筛选只服务于浏览式检索（术语、引文、分面），不参与「问答要不要召回某块」的判断。

本模块现在只保留**编排**（闸门 → 类型判定 → 检索 → 生成 → 附引用），
其余职责已拆到同级模块，改动时按职责定位、不要再堆回本文件：
  llm.py            后端调用（api / ollama）
  routing.py        提问类型判定与宽泛主题澄清
  answer_theme.py   范围查询（theme 策略）分支
  answer_evidence.py  证据整备    answer_prompt.py  提示词
  citations.py      前端引用条目  parse.py          模型输出的解析与渲染
"""
from __future__ import annotations

import collections
from typing import Any

from .answer_evidence import (
    _topic_evidence,
    build_annotations,
    build_context,
    build_glossary,
    build_point_evidence,
    build_point_sections,
    render_point_quote_first,
)
from .answer_prompt import (
    PROMPT_TEMPLATE_LEGACY,
    PROMPT_TEMPLATE_QUOTE_FIRST,
    PROMPT_TEMPLATE_QUOTE_FIRST_STREAM,
    bridge_max,
    prompt_style,
)
from .answer_theme import _theme_answer_stream, theme_answer
from .citations import citations_from_groups, citations_from_hits
from .gate import check_question, check_relevance, skip_answer
from .index import Store
from .lexicon import Lexicon
from .llm import api_answer, api_answer_stream, ollama_answer
from .parse import (
    clean_generated_answer,
    parse_structured_answer,
    parse_structured_markdown,
    render_structured_sections,
)
from .retrieve import hybrid_search
from .routing import (
    _clarify_options,
    _has_direct_topic_match,
    clarify_broad_topic,
    classify_question,
    theme_topic,
)

# ---- 回答级 LRU 缓存 ----
# (question, strategy) → answer 结果。命中时跳过检索与 LLM 生成，直接返回。
# 对「卡片联动」场景（用户在术语卡之间跳转、反复查看相近问题）收益极大。
_ANSWER_CACHE: collections.OrderedDict[tuple[str, str], dict[str, Any]] = collections.OrderedDict()
_ANSWER_CACHE_MAX = 64


def _cache_put(key: tuple[str, str], result: dict[str, Any]) -> None:
    _ANSWER_CACHE[key] = result
    _ANSWER_CACHE.move_to_end(key)
    while len(_ANSWER_CACHE) > _ANSWER_CACHE_MAX:
        _ANSWER_CACHE.popitem(last=False)


def template_answer(
    question: str,
    hits: list[dict[str, Any]],
    doc_title: str,
    lex: Lexicon | None = None,
    store: Store | None = None,
    cfg: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """离线点查询：可信基线编辑稿（原文完整段 + 坐标出处），不调用大模型。

    返回 (text, evidence, sections, annotations)。evidence 保留
    unit / volume / char_span / citation 信息，供引用面板直接消费。
    """
    if store is not None and cfg is not None:
        a_cfg = (cfg or {}).get("answer", {}) or {}
        limit = min(int(a_cfg.get("max_context_chunks", 8)), len(hits))
        evidence = build_point_evidence(question, hits, store, lex, cfg, limit=limit)
        if not evidence:
            return "资料不足：索引中未找到与问题相关的内容。", [], [], []
        text = render_point_quote_first(question, evidence, doc_title, lex, cfg)
        sections = build_point_sections(question, evidence, lex)
        annotations = build_annotations(question, [e["text"] for e in evidence], lex)
        return text, evidence, sections, annotations

    # 无 store 的旧调用兼容：退回「每块取 1 句」的旧抽取式行为。
    evidence = _topic_evidence(question, hits, lex, limit=min(8, len(hits)))
    if not evidence:
        return "资料不足：索引中未找到与问题相关的内容。", [], [], []

    order = ("定义", "机制", "展开", "张力", "体系", "背景")
    labels = {
        "定义": "核心含义",
        "机制": "形成机制",
        "展开": "理论展开",
        "张力": "理论张力",
        "体系": "体系位置",
        "背景": "补充证据",
    }
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in evidence:
        grouped.setdefault(item["role"], []).append(item)
    ordered_evidence = [
        item
        for role in order
        for item in grouped.get(role, [])
    ]
    for number, item in enumerate(ordered_evidence, start=1):
        item["citation_number"] = number
    parts: list[str] = []
    for role in order:
        items = grouped.get(role, [])
        if not items:
            continue
        sentences: list[str] = []
        for item in items:
            sentences.append(f"{item['evidence']} [{item['citation_number']}]")
        parts.append(f"{labels[role]}：{' '.join(sentences)}")
    return "\n\n".join(parts), ordered_evidence, [], []


def _point_generate(
    question: str,
    hits: list[dict[str, Any]],
    doc_title: str,
    lex: Lexicon,
    cfg: dict[str, Any],
    backend: str,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """点查询的 LLM 生成：quote_first 走结构化 JSON，legacy 走自由文本。"""
    style = prompt_style(cfg)
    glossary = build_glossary(question, [h["chunk"].text for h in hits], lex)
    context = build_context(hits, doc_title)
    if style == "quote_first":
        prompt = PROMPT_TEMPLATE_QUOTE_FIRST.format(
            glossary=glossary,
            context=context,
            question=question,
            bridge_max_chars=bridge_max(cfg),
        )
    else:
        prompt = PROMPT_TEMPLATE_LEGACY.format(
            glossary=glossary,
            context=context,
            question=question,
            max_chars=int(((cfg or {}).get("answer", {}) or {}).get("max_answer_chars", 400)),
        )
    raw = ollama_answer(prompt, cfg) if backend == "ollama" else api_answer(prompt, cfg, strategy="point")
    if style != "quote_first":
        return clean_generated_answer(raw), [], []
    data = parse_structured_answer(raw)
    if data:
        text = render_structured_sections(data, clean_generated_answer(raw))
        return text, (data.get("sections") or []), (data.get("annotations") or [])
    return clean_generated_answer(raw), [], []


def answer(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str = "auto",
    focus: str | None = None,
) -> dict[str, Any]:
    """问答主链路：问题闸门 → 类型判定 → 检索 → 组装上下文 → 生成 → 附引用。

    这是「溯源回答」的**唯一入口**。`strategy` 决定内部走哪条召回策略：
      auto（默认）—— 由 classify_question 自动判定点查询 / 范围查询
      point        —— 强制点查询（top-k 少而准）
      theme        —— 强制范围查询（高召回 + 按单元聚合，输出与专题提炼同量级）

    回答结果进 LRU 缓存：(question, strategy) 命中时直接返回，跳过检索与 LLM 生成。

    注意：本链路**不接受元数据筛选**。筛选会先缩小候选池再检索，容易把承载
    「概念定义」的段落（常在前言 / 总纲 / 其他单元）排除在外，导致内容被截断。
    需要按单元 / 理论家 / 概念浏览时，请走 `term_lookup` / `quote_search` / 分面统计。
    """
    # ---- ⓪ LRU 缓存命中检查 ----
    q_norm = (question or "").strip()
    s_norm = (strategy or "auto").lower()
    cache_key = (q_norm, s_norm)
    cached = _ANSWER_CACHE.get(cache_key)
    if cached is not None:
        _ANSWER_CACHE.move_to_end(cache_key)
        return {**cached, "_cached": True}

    # ---- ① 问题闸门：不适合检索的问题在此终止，不进检索流程 ----
    gate = check_question(question, lex, cfg)
    if not gate["ok"]:
        result = {
            "question": question,
            "backend": "gate",
            "strategy": "gate",
            "skipped": True,
            "gate": gate,
            "answer": skip_answer(gate),
            "citations": [],
        }
        _cache_put(cache_key, result)
        return result

    # ---- ①b 语义相关性格挡：无锚点、又和语料相似度过低的问题也直接跳过 ----
    # 硬编码拦截模式（寒暄 / 实时信息 …）覆盖不了所有垃圾输入，这一层用
    # 「查询与全语料的最高余弦相似度」做兜底：与本书无关的问题在此终止，
    # 不需要跑检索，也不产生噪声结果。
    gate_cfg = cfg.get("gate", {}) if cfg else {}
    if gate_cfg.get("relevance", True) and gate.get("anchor") is False:
        rel_gate = check_relevance(store, question, cfg)
        direct_topic = theme_topic(question, lex)
        if not rel_gate["ok"] and not _has_direct_topic_match(store, direct_topic):
            result = {
                "question": question,
                "backend": "gate",
                "strategy": "gate",
                "skipped": True,
                "gate": rel_gate,
                "answer": skip_answer(rel_gate),
                "citations": [],
            }
            _ANSWER_CACHE[cache_key] = result
            _ANSWER_CACHE.move_to_end(cache_key)
            while len(_ANSWER_CACHE) > _ANSWER_CACHE_MAX:
                _ANSWER_CACHE.popitem(last=False)
            return result

    # ---- ①c 宽泛主题澄清：裸主题先选方向，短路在检索/生成之前 ----
    backend = cfg["answer"].get("backend", "template")
    clarify_topic = clarify_broad_topic(question, strategy, cfg, lex, backend=backend)
    if clarify_topic:
        result = {
            "strategy": "clarify",
            "topic": clarify_topic,
            "skipped": False,
            "citations": [],
            "options": _clarify_options(clarify_topic),
            "gate": gate,
        }
        _cache_put(cache_key, result)
        return result

    # ---- ② 类型判定：同一个入口，按问题诉求选择召回策略 ----
    strat = (strategy or "auto").lower()
    if strat not in ("point", "theme"):
        strat = classify_question(question, lex)

    if strat == "theme":
        res = theme_answer(store, lex, theme_topic(question, lex), cfg, focus=focus)
        res.update(question=question, strategy="theme", gate=gate, skipped=False)
        _cache_put(cache_key, res)
        return res

    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))

    # ---- ② 全文混合检索：整篇语料参与召回，不做任何元数据筛选 ----
    hits = hybrid_search(
        store, question, cfg, lex,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

    # ---- ③ 生成 ----
    sections: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    if backend == "template":
        text, citation_hits, sections, annotations = template_answer(
            question, hits, doc_title, lex, store, cfg
        )
        citations = citations_from_groups(citation_hits) if citation_hits else []
    else:
        text, sections, annotations = _point_generate(question, hits, doc_title, lex, cfg, backend)
        citation_hits = hits
        citations = citations_from_hits(citation_hits, doc_title, lex)

    if not citation_hits:
        citation_hits = hits
        citations = citations_from_hits(citation_hits, doc_title, lex)

    result = {
        "question": question,
        "backend": backend,
        "strategy": "point",
        "skipped": False,
        "gate": gate,
        "answer": text,
        "citations": citations,
        "sections": sections,
        "annotations": annotations,
    }
    _ANSWER_CACHE[cache_key] = result
    _ANSWER_CACHE.move_to_end(cache_key)
    while len(_ANSWER_CACHE) > _ANSWER_CACHE_MAX:
        _ANSWER_CACHE.popitem(last=False)
    return result


def answer_stream(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str = "auto",
    focus: str | None = None,
):
    """流式问答：先完成闸门 + 检索 + 引用组装（yield meta），再流式生成回答正文（yield delta）。

    yield 两种事件：
      {"type": "meta", ...}      —— 检索完成，包含 strategy / gate / citations 等元数据
      {"type": "delta", "text"}  —— LLM 生成的文本增量
      {"type": "done", ...}      —— 生成完成，包含最终 answer
      {"type": "error", "detail"}—— 出错

    前端收到 meta 后立即渲染引用面板和卡片框架，收到 delta 后逐字追加到回答区域。
    """
    # ---- ① 问题闸门 ----
    gate = check_question(question, lex, cfg)
    if not gate["ok"]:
        yield {"type": "meta", "strategy": "gate", "gate": gate, "skipped": True,
               "answer": skip_answer(gate), "citations": []}
        return

    # ---- ①b 语义相关性格挡 ----
    gate_cfg = cfg.get("gate", {}) if cfg else {}
    if gate_cfg.get("relevance", True) and gate.get("anchor") is False:
        rel_gate = check_relevance(store, question, cfg)
        direct_topic = theme_topic(question, lex)
        if not rel_gate["ok"] and not _has_direct_topic_match(store, direct_topic):
            yield {"type": "meta", "strategy": "gate", "gate": rel_gate, "skipped": True,
                   "answer": skip_answer(rel_gate), "citations": []}
            return

    # ---- ①c 宽泛主题澄清：裸主题先选方向，短路在检索/生成之前 ----
    backend = cfg["answer"].get("backend", "template")
    clarify_topic = clarify_broad_topic(question, strategy, cfg, lex, backend=backend)
    if clarify_topic:
        yield {"type": "meta", "strategy": "clarify", "topic": clarify_topic,
               "skipped": False, "citations": [],
               "options": _clarify_options(clarify_topic), "gate": gate}
        yield {"type": "done", "answer": ""}
        return

    # ---- ② 类型判定 ----
    strat = (strategy or "auto").lower()
    if strat not in ("point", "theme"):
        strat = classify_question(question, lex)

    if strat == "theme":
        yield from _theme_answer_stream(store, lex, theme_topic(question, lex), cfg, question, gate, focus=focus)
        return

    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))

    # ---- ② 检索 ----
    hits = hybrid_search(
        store, question, cfg, lex,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

    # ---- 组装引用（在生成之前发给前端）----
    citations = citations_from_hits(hits, doc_title, lex)

    # ---- ③ 生成 ----
    if backend == "template":
        text, citation_hits, sections, annotations = template_answer(
            question, hits, doc_title, lex, store, cfg
        )
        citations = citations_from_groups(citation_hits) if citation_hits else []
        yield {"type": "meta", "strategy": "point", "backend": backend, "gate": gate,
               "skipped": False, "citations": citations,
               "sections": sections, "annotations": annotations}
        yield {"type": "delta", "text": text}
        yield {"type": "done", "answer": text}
        return

    style = prompt_style(cfg)
    if style == "quote_first":
        prompt = PROMPT_TEMPLATE_QUOTE_FIRST_STREAM.format(
            glossary=build_glossary(question, [h["chunk"].text for h in hits], lex),
            context=build_context(hits, doc_title),
            question=question,
            bridge_max_chars=bridge_max(cfg),
        )
        yield {"type": "meta", "strategy": "point", "backend": backend, "gate": gate,
               "skipped": False, "citations": citations,
               "sections": [], "annotations": []}

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
            for chunk in api_answer_stream(prompt, cfg, strategy="point"):
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

    prompt = PROMPT_TEMPLATE_LEGACY.format(
        glossary=build_glossary(question, [h["chunk"].text for h in hits], lex),
        context=build_context(hits, doc_title),
        question=question,
        max_chars=int(cfg["answer"].get("max_answer_chars", 400)),
    )

    yield {"type": "meta", "strategy": "point", "backend": backend, "gate": gate,
           "skipped": False, "citations": citations}

    full_text: list[str] = []
    if backend == "ollama":
        # Ollama 暂不支持流式（保持原行为）
        text = ollama_answer(prompt, cfg)
        text = clean_generated_answer(text)
        yield {"type": "delta", "text": text}
        yield {"type": "done", "answer": text}
    else:
        try:
            for chunk in api_answer_stream(prompt, cfg, strategy="point"):
                full_text.append(chunk)
                yield {"type": "delta", "text": chunk}
        except Exception as exc:
            yield {"type": "error", "detail": str(exc)}
            return
        text = clean_generated_answer("".join(full_text))
        yield {"type": "done", "answer": text}
