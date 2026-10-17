"""生成层：引用溯源问答（单入口，内部按问题类型分策略）。

三种后端（由 config.yaml 的 answer.backend 选择，默认 api）：
  api      —— 任意 OpenAI 兼容 /chat/completions 接口（默认；默认接阿里云百炼 DashScope）
  ollama   —— 本地模型（qwen2.5 / llama3 等），数据不出本机
  template —— 离线抽取式，不调用任何模型，直接给出带引用的原文片段（用于自检与降级）

无论哪种后端、哪种策略，返回结构一致：answer + citations，
前端可据 citations 跳转原文并高亮。对使用者而言只有一个「溯源回答」入口。

链路（两道前置关卡 + 类型判定 + 检索 + 生成）：

    问题 ─▶ ⓪ 追问改写 rewrite.rewrite_followup（有上文时把「继续 / 那X呢」变成独立问题）
              ▼
            ① 问题闸门 gate.check_question
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
  conv.py           会话状态（conversation_id → 最近几轮 Turn，TTL + 容量）
  rewrite.py        追问改写（继续 / 详细点 / 那X呢 / 和Y比）—— 必须在闸门之前
  llm.py            后端调用（api / ollama）
  routing.py        提问类型判定与宽泛主题澄清
  answer_theme.py   范围查询（theme 策略）分支
  answer_evidence.py  证据整备    answer_prompt.py  提示词
  citations.py      前端引用条目  parse.py          模型输出的解析与渲染
"""
from __future__ import annotations

from typing import Any

from . import conv
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
from .conv import ConversationStore, Turn, make_digest
from .gate import RE_FRAGMENT, check_question, check_relevance, normalize, skip_answer
from .index import Store
from .lexicon import Lexicon
from .llm import api_answer, api_answer_stream, ollama_answer
from .lru import LruCache
from .parse import (
    clean_generated_answer,
    parse_structured_answer,
    parse_structured_markdown,
    render_structured_sections,
)
from .retrieve import hybrid_search
from .rewrite import Rewrite, rewrite_followup
from .routing import (
    _clarify_options,
    _has_direct_topic_match,
    clarify_broad_topic,
    route_question,
    theme_topic,
)

# ---- 回答级 LRU 缓存 ----
# (standalone, strategy, focus, S|F) → answer 结果。命中时跳过检索与 LLM 生成，直接返回。
# 键里必须带 focus（focus 会改变主题写作侧重）与 S|F（追问注入了上一轮摘要，
# 同一句话在「首次提问」与「追问」下答案本就不同）。
# 对「卡片联动」场景（用户在术语卡之间跳转、反复查看相近问题）收益极大。
# 用带锁的 LruCache 而非裸 OrderedDict：服务端同步端点跑在线程池里。
_ANSWER_CACHE = LruCache(64)


def _cache_put(key: tuple[str, str, str, str], result: dict[str, Any]) -> None:
    _ANSWER_CACHE.put(key, result)


def _cache_get(key: tuple[str, str, str, str]) -> dict[str, Any] | None:
    return _ANSWER_CACHE.get(key)


def _conversation(
    cfg: dict[str, Any], conversation_id: str | None
) -> tuple[ConversationStore | None, str | None, list[Turn]]:
    """取本轮会话上下文：(会话存储或 None, conversation_id, 此前各轮)。

    未传 id 时开一个新会话并把新 id 带回响应，前端下次原样回传——会话状态只在
    回答层读写，server 只做转发。
    """
    conf = conv.settings(cfg)
    if not conf["enabled"]:
        return None, None, []
    conv_store = conv.get_store(cfg)
    cid = (conversation_id or "").strip() or conv_store.new_id()
    return conv_store, cid, conv_store.get(cid)


def _remember(
    conv_store: ConversationStore | None,
    cid: str | None,
    question: str,
    rw: Rewrite,
    result: dict[str, Any],
    focus: str | None,
    digest_chars: int,
) -> None:
    """成功作答（或命中缓存）后记一轮。

    gate / clarify 分支只记 topic + standalone、不记要点摘要：那一轮没有可复用的结论，
    摘要反而是噪声。缓存命中也照记——否则同一句追问重复一次就把上下文断了。
    """
    if conv_store is None or not cid:
        return
    strategy = str(result.get("strategy") or "")
    conv_store.append(cid, Turn(
        question=question,
        standalone=str(result.get("standalone") or rw.standalone),
        strategy=strategy,
        topic=str(result.get("topic") or ""),
        focus=focus,
        digest=make_digest(result, digest_chars) if strategy in ("point", "theme") else "",
    ))


def _expired_gate(
    result: dict[str, Any], question: str, cid: str | None, ttl_sec: int
) -> dict[str, Any]:
    """会话过期 / 尚未建立时再追问碎片：把提示换成「请重新完整描述」。

    只换文案，不改拦截逻辑：fragment 该拦还是要拦（tests/test_gate.py 的期望值不变）。
    """
    if not cid or not RE_FRAGMENT.match(normalize(question)):
        return result
    minutes = max(1, int(ttl_sec) // 60)
    gate = {
        **(result.get("gate") or {}),
        "hint": f"对话已过期（{minutes} 分钟无操作），请把问题重新完整描述一次",
    }
    return {**result, "gate": gate, "answer": skip_answer(gate)}


def _replay_cached(
    cached: dict[str, Any], question: str, cid: str | None, turns: list[Turn], ttl_sec: int
):
    """命中缓存时按原事件顺序重放：meta → delta… → done（顺序是前端契约）。"""
    body = {**cached, "conversation_id": cid}
    strategy = str(body.get("strategy") or "")
    meta_keys = ("strategy", "backend", "gate", "skipped", "citations", "route_reason",
                 "sections", "annotations", "theme", "topic", "options")
    if strategy == "gate" and not turns:
        body = _expired_gate(body, question, cid, ttl_sec)
    meta = {"type": "meta", **{k: body[k] for k in meta_keys if k in body},
            "conversation_id": cid, "standalone": body.get("standalone", ""),
            "is_followup": body.get("is_followup", False)}
    if strategy == "gate":
        yield {**meta, "answer": body.get("answer", "")}
        return
    yield meta
    if strategy == "clarify":
        yield {"type": "done", "answer": ""}
        return
    text = str(body.get("answer") or "")
    yield {"type": "delta", "text": text}
    yield {"type": "done", "answer": text,
           "sections": body.get("sections") or [],
           "annotations": body.get("annotations") or []}


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
    prior: str = "",
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """点查询的 LLM 生成：quote_first 走结构化 JSON，legacy 走自由文本。

    `prior` 是上一轮要点 + 本轮侧重，**拼进 context 前置块**而不是新增模板占位符：
    模板在 6 处被 .format 调用，加占位符必然漏改一处并抛 KeyError。
    """
    style = prompt_style(cfg)
    glossary = build_glossary(question, [h["chunk"].text for h in hits], lex)
    context = conv.with_prior(prior, build_context(hits, doc_title))
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


def _plan(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str,
    rw: Rewrite | None = None,
) -> tuple[str, dict[str, Any]]:
    """问答链路的公共前置决策：闸门 → 语义相关性 → 澄清 → 点/范围判定。

    非流式的 `answer()` 与流式的 `answer_stream()` 消费同一份决策结果。此前两条路径
    各写一遍这套判断，新增一类拦截或调整判定顺序必须两处同改，行为容易悄悄漂移。

    返回 (kind, data)：
      ("gate",    {"gate", "answer"})            —— 不适合检索，直接跳过
      ("clarify", {"topic", "gate", "options"})  —— 裸主题，先让用户选方向
      ("theme",   {"topic", "gate"})             —— 范围查询
       ("point",   {"gate"})                      —— 点查询

    `question` 必须是**改写后**的独立问题：调用方在算缓存键之前就完成改写，
    闸门 / 相关性 / 澄清 / 路由一律作用于它，于是「继续 / 那X呢」不再命中 fragment，
    gate.py 的判定逻辑无需改动。`rw` 只带降级信号，不做二次判断。
    """
    # ---- ① 问题闸门：不适合检索的问题在此终止，不进检索流程 ----
    gate = check_question(question, lex, cfg)
    if not gate["ok"]:
        return "gate", {"gate": gate, "answer": skip_answer(gate), "rw": rw}

    # ---- ①b 语义相关性格挡：无锚点、又和语料相似度过低的问题也直接跳过 ----
    # 硬编码拦截模式（寒暄 / 实时信息 …）覆盖不了所有垃圾输入，这一层用
    # 「查询与全语料的最高余弦相似度」做兜底：与本书无关的问题在此终止，
    # 不需要跑检索，也不产生噪声结果。
    gate_cfg = (cfg or {}).get("gate", {}) or {}
    if gate_cfg.get("relevance", True) and gate.get("anchor") is False:
        rel_gate = check_relevance(store, question, cfg)
        if not rel_gate["ok"] and not _has_direct_topic_match(store, theme_topic(question, lex)):
            return "gate", {"gate": rel_gate, "answer": skip_answer(rel_gate)}

    # ---- ①c 宽泛主题澄清：裸主题先选方向，短路在检索 / 生成之前 ----
    backend = cfg["answer"].get("backend", "template")
    clarify_topic = clarify_broad_topic(question, strategy, cfg, lex, backend=backend)
    if clarify_topic:
        return "clarify", {
            "topic": clarify_topic,
            "gate": gate,
            "options": _clarify_options(clarify_topic),
            "rw": rw,
        }

    # ---- ② 类型判定：同一个入口，按问题诉求选择召回策略 ----
    strat = (strategy or "auto").lower()
    if strat in ("point", "theme"):
        reason = f"显式指定 strategy={strat}"
    else:
        strat, reason = route_question(question, lex)
    if rw is not None and rw.downgrade:
        # 上一轮的纯延续：重跑一遍主题聚合要召回数百块、生成数千字，既慢又难读
        strat, reason = "point", "追问纯延续：避免重跑范围查询"
    if strat == "theme":
        return "theme", {"topic": theme_topic(question, lex), "gate": gate,
                         "route_reason": reason, "rw": rw}
    return "point", {"gate": gate, "route_reason": reason, "rw": rw}


def answer(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str = "auto",
    focus: str | None = None,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """问答主链路：追问改写 → 闸门 → 类型判定 → 检索 → 组装上下文 → 生成 → 附引用。

    这是「溯源回答」的**唯一入口**。`strategy` 决定内部走哪条召回策略：
      auto（默认）—— 由 classify_question 自动判定点查询 / 范围查询
      point        —— 强制点查询（top-k 少而准）
      theme        —— 强制范围查询（高召回 + 按单元聚合，输出与专题提炼同量级）

    `conversation_id`：同一会话里「继续 / 详细点 / 那X呢」按上文改写成独立问题；
    传 None 时开一个新会话（响应带回新 id，前端下次原样回传）。会话读写只在本层，
    server 只做转发。

    回答结果进 LRU 缓存：(standalone, strategy, focus, S|F) 命中时直接返回，
    跳过检索与 LLM 生成。

    注意：本链路**不接受元数据筛选**。筛选会先缩小候选池再检索，容易把承载
    「概念定义」的段落（常在前言 / 总纲 / 其他单元）排除在外，导致内容被截断。
    需要按单元 / 理论家 / 概念浏览时，请走 `term_lookup` / `quote_search` / 分面统计。
    """
    conv_conf = conv.settings(cfg)
    conv_store, cid, turns = _conversation(cfg, conversation_id)

    # ---- ⓪ 追问改写：必须早于缓存键与闸门（改写后的句子才是检索与缓存的对象）----
    rw = rewrite_followup(question, turns, lex)
    standalone = rw.standalone
    cache_key = (standalone, (strategy or "auto").lower(), focus or "",
                 "F" if rw.is_followup else "S")
    cached = _cache_get(cache_key)
    if cached is not None:
        _remember(conv_store, cid, question, rw, cached, focus, conv_conf["digest_chars"])
        out = {**cached, "conversation_id": cid, "_cached": True}
        if cached.get("strategy") == "gate" and not turns:
            out = _expired_gate(out, question, cid, conv_conf["ttl_sec"])
        return out

    # ---- ① 前置决策（与流式路径共用同一份判断，见 _plan）----
    kind, data = _plan(store, lex, standalone, cfg, strategy, rw=rw)
    if kind == "gate":
        result = {
            "question": question,
            "backend": "gate",
            "strategy": "gate",
            "skipped": True,
            "gate": data["gate"],
            "answer": data["answer"],
            "citations": [],
            "standalone": standalone,
            "is_followup": rw.is_followup,
        }
        _cache_put(cache_key, result)
        _remember(conv_store, cid, question, rw, result, focus, conv_conf["digest_chars"])
        out = {**result, "conversation_id": cid}
        if not turns:
            out = _expired_gate(out, question, cid, conv_conf["ttl_sec"])
        return out

    if kind == "clarify":
        result = {
            "strategy": "clarify",
            "topic": data["topic"],
            "skipped": False,
            "citations": [],
            "options": data["options"],
            "gate": data["gate"],
            "standalone": standalone,
            "is_followup": rw.is_followup,
        }
        _cache_put(cache_key, result)
        _remember(conv_store, cid, question, rw, result, focus, conv_conf["digest_chars"])
        return {**result, "conversation_id": cid}

    gate = data["gate"]
    backend = cfg["answer"].get("backend", "template")
    prior = conv.prior_block(turns[-1].digest if turns else "", rw.hint)

    if kind == "theme":
        res = theme_answer(store, lex, data["topic"], cfg, focus=focus, prior=prior)
        res.update(question=question, standalone=standalone, is_followup=rw.is_followup,
                   strategy="theme", gate=gate, skipped=False,
                   route_reason=data.get("route_reason", ""))
        _cache_put(cache_key, res)
        _remember(conv_store, cid, question, rw, res, focus, conv_conf["digest_chars"])
        return {**res, "conversation_id": cid}

    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))

    # ---- ② 全文混合检索：整篇语料参与召回，不做任何元数据筛选 ----
    hits = hybrid_search(
        store, standalone, cfg, lex,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

    # ---- ③ 生成 ----
    sections: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    if backend == "template":
        text, citation_hits, sections, annotations = template_answer(
            standalone, hits, doc_title, lex, store, cfg
        )
        citations = citations_from_groups(citation_hits) if citation_hits else []
    else:
        text, sections, annotations = _point_generate(
            standalone, hits, doc_title, lex, cfg, backend, prior=prior
        )
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
        "route_reason": data.get("route_reason", ""),
        "answer": text,
        "citations": citations,
        "sections": sections,
        "annotations": annotations,
        "standalone": standalone,
        "is_followup": rw.is_followup,
    }
    _cache_put(cache_key, result)
    _remember(conv_store, cid, question, rw, result, focus, conv_conf["digest_chars"])
    return {**result, "conversation_id": cid}


def answer_stream(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str = "auto",
    focus: str | None = None,
    conversation_id: str | None = None,
):
    """流式问答：先完成追问改写 + 闸门 + 检索 + 引用组装（yield meta），再流式生成正文。

    yield 四种事件（顺序固定 meta → delta… → done，前端与用例都依赖它）：
      {"type": "meta", ...}      —— 检索完成，含 strategy / gate / citations /
                                    conversation_id / standalone / is_followup
      {"type": "delta", "text"}  —— LLM 生成的文本增量
      {"type": "done", ...}      —— 生成完成，包含最终 answer
      {"type": "error", "detail"}—— 出错

    与非流式 `answer()` **共用同一份缓存键与同一读写位置**：前端主路径就是本函数，
    只给 answer() 补缓存等于没补（旧实现这里完全不查缓存）。

    前端收到 meta 后立即渲染引用面板和卡片框架，收到 delta 后逐字追加到回答区域。
    """
    conv_conf = conv.settings(cfg)
    conv_store, cid, turns = _conversation(cfg, conversation_id)

    # ---- ⓪ 追问改写 + 缓存：与非流式同一顺序、同一键 ----
    rw = rewrite_followup(question, turns, lex)
    standalone = rw.standalone
    cache_key = (standalone, (strategy or "auto").lower(), focus or "",
                 "F" if rw.is_followup else "S")
    cached = _cache_get(cache_key)
    if cached is not None:
        _remember(conv_store, cid, question, rw, cached, focus, conv_conf["digest_chars"])
        yield from _replay_cached(cached, question, cid, turns, conv_conf["ttl_sec"])
        return

    # ---- ① 前置决策（与非流式路径共用同一份判断，见 _plan）----
    kind, data = _plan(store, lex, standalone, cfg, strategy, rw=rw)
    conv_meta = {"conversation_id": cid, "standalone": standalone,
                 "is_followup": rw.is_followup}
    digest_chars = conv_conf["digest_chars"]

    if kind == "gate":
        payload = {
            "question": question,
            "backend": "gate",
            "strategy": "gate",
            "skipped": True,
            "gate": data["gate"],
            "answer": data["answer"],
            "citations": [],
            "standalone": standalone,
            "is_followup": rw.is_followup,
        }
        _cache_put(cache_key, payload)
        _remember(conv_store, cid, question, rw, payload, focus, digest_chars)
        shown = payload if turns else _expired_gate(payload, question, cid,
                                                   conv_conf["ttl_sec"])
        yield {"type": "meta", "strategy": "gate", "gate": shown["gate"], "skipped": True,
               "answer": shown["answer"], "citations": [], **conv_meta}
        return

    if kind == "clarify":
        payload = {
            "strategy": "clarify",
            "topic": data["topic"],
            "skipped": False,
            "citations": [],
            "options": data["options"],
            "gate": data["gate"],
            "standalone": standalone,
            "is_followup": rw.is_followup,
        }
        _cache_put(cache_key, payload)
        _remember(conv_store, cid, question, rw, payload, focus, digest_chars)
        yield {"type": "meta", "strategy": "clarify", "topic": data["topic"],
               "skipped": False, "citations": [], "options": data["options"],
               "gate": data["gate"], **conv_meta}
        yield {"type": "done", "answer": ""}
        return

    gate = data["gate"]
    backend = cfg["answer"].get("backend", "template")
    prior = conv.prior_block(turns[-1].digest if turns else "", rw.hint)

    if kind == "theme":
        payload = {"strategy": "theme", "skipped": False, "question": question, **conv_meta}
        failed = False
        for event in _theme_answer_stream(
            store, lex, data["topic"], cfg, standalone, gate,
            focus=focus, route_reason=data.get("route_reason", ""), prior=prior,
        ):
            etype = event.get("type")
            if etype == "meta":
                payload.update({k: v for k, v in event.items() if k != "type"})
                payload.update(conv_meta)
                event = {**event, **conv_meta}
            elif etype == "done":
                payload["answer"] = event.get("answer", "")
            elif etype == "error":
                failed = True
            yield event
        # 生成失败的一轮既不进缓存也不进会话：下一轮追问不该继承半截答案
        if not failed:
            _cache_put(cache_key, payload)
            _remember(conv_store, cid, question, rw, payload, focus, digest_chars)
        return

    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))

    # ---- ② 检索 ----
    hits = hybrid_search(
        store, standalone, cfg, lex,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

    # ---- 组装引用（在生成之前发给前端）----
    citations = citations_from_hits(hits, doc_title, lex)
    route_reason = data.get("route_reason", "")

    def _finish(text: str, sections: list[dict[str, Any]],
                annotations: list[dict[str, Any]]) -> None:
        """done 之前把这一轮写进缓存与会话（error 分支不调用）。"""
        payload = {
            "question": question, "backend": backend, "strategy": "point",
            "skipped": False, "gate": gate, "route_reason": route_reason,
            "answer": text, "citations": citations, "sections": sections,
            "annotations": annotations, "standalone": standalone,
            "is_followup": rw.is_followup,
        }
        _cache_put(cache_key, payload)
        _remember(conv_store, cid, question, rw, payload, focus, digest_chars)

    point_meta = {"strategy": "point", "backend": backend, "gate": gate,
                  "skipped": False, "route_reason": route_reason, **conv_meta}

    # ---- ③ 生成 ----
    if backend == "template":
        text, citation_hits, sections, annotations = template_answer(
            standalone, hits, doc_title, lex, store, cfg
        )
        citations = citations_from_groups(citation_hits) if citation_hits else []
        yield {**point_meta, "type": "meta", "citations": citations,
               "sections": sections, "annotations": annotations}
        yield {"type": "delta", "text": text}
        _finish(text, sections, annotations)
        yield {"type": "done", "answer": text}
        return

    style = prompt_style(cfg)
    if style == "quote_first":
        prompt = PROMPT_TEMPLATE_QUOTE_FIRST_STREAM.format(
            glossary=build_glossary(standalone, [h["chunk"].text for h in hits], lex),
            context=conv.with_prior(prior, build_context(hits, doc_title)),
            question=standalone,
            bridge_max_chars=bridge_max(cfg),
        )
        yield {**point_meta, "type": "meta", "citations": citations,
               "sections": [], "annotations": []}

        if backend == "ollama":
            # Ollama 暂不支持流式（与 legacy 分支保持原行为）
            text = clean_generated_answer(ollama_answer(prompt, cfg))
            parsed = parse_structured_markdown(text)
            sections = (parsed or {}).get("sections") or []
            annotations = (parsed or {}).get("annotations") or []
            yield {"type": "delta", "text": text}
            _finish(text, sections, annotations)
            yield {"type": "done", "answer": text, "sections": sections,
                   "annotations": annotations}
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
        parsed = parse_structured_markdown(cleaned)
        if parsed:
            text = render_structured_sections(parsed, cleaned)
            sections = parsed.get("sections") or []
            annotations = parsed.get("annotations") or []
        else:
            text = cleaned
            sections, annotations = [], []
        _finish(text, sections, annotations)
        yield {"type": "done", "answer": text, "sections": sections,
               "annotations": annotations}
        return

    prompt = PROMPT_TEMPLATE_LEGACY.format(
        glossary=build_glossary(standalone, [h["chunk"].text for h in hits], lex),
        context=conv.with_prior(prior, build_context(hits, doc_title)),
        question=standalone,
        max_chars=int(cfg["answer"].get("max_answer_chars", 400)),
    )

    yield {**point_meta, "type": "meta", "citations": citations}

    full_text = []
    if backend == "ollama":
        # Ollama 暂不支持流式（保持原行为）
        text = clean_generated_answer(ollama_answer(prompt, cfg))
        yield {"type": "delta", "text": text}
        _finish(text, [], [])
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
        _finish(text, [], [])
        yield {"type": "done", "answer": text}
