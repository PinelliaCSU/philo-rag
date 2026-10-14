"""生成层：引用溯源问答（单入口，内部按问题类型分策略）。

三种后端：
  template —— 离线抽取式，不调用任何模型，直接给出带引用的原文片段（默认，用于自检与降级）
  ollama   —— 本地模型（qwen2.5 / llama3 等），数据不出本机
  api      —— 任意 OpenAI 兼容 /chat/completions 接口

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
"""
from __future__ import annotations

import collections
import json
import re
import urllib.request
from typing import Any

from .gate import check_question, check_relevance, skip_answer
from .index import Store
from .lexicon import Lexicon
from .retrieve import _definition_terms, hybrid_search
from .schema import Chunk

PROMPT_TEMPLATE = """你是一位严谨的哲学文献助手，正在为读者讲解《哲学大纲》一书。

要求：
1. 只使用下面「资料」中的内容作答，不要引入资料之外的知识；
2. 每个论断后面用 [编号] 标注来源，例如 [1][3]；只输出融贯的回答正文，不要输出“出处：”或来源列表；
3. 如果资料不足以回答，请直接说明「资料不足」，绝不编造；
4. 涉及哲学大纲体系时，使用其术语（字头、场域论、本体论、认识论、目的论、四话语等）；
5. 用中文回答，条理清晰，分成 3—5 个自然段，依次说明：核心定义、形成机制或论证路径、不同理论位置的张力，最后给出一句总结；不超过 {max_chars} 字。

资料：
{context}

问题：{question}

回答："""

RE_SENT = re.compile(r"[^。！？；\n]+[。！？；]?")


def build_context(hits: list[dict[str, Any]], doc_title: str) -> str:
    parts: list[str] = []
    for n, h in enumerate(hits, start=1):
        c: Chunk = h["chunk"]
        parts.append(f"[{n}] {c.text}")
    return "\n\n".join(parts)


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
    """从候选块提取少量完整证据，按原文顺序恢复论证链。"""
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

    # 先保留检索分数高的证据，再按原文顺序组织，避免跨卷乱跳。
    candidates.sort(key=lambda x: (-x["evidence_score"], -x["score"]))
    selected = candidates[:limit]
    selected.sort(key=lambda x: x["chunk"].seq)
    return selected


def template_answer(
    question: str,
    hits: list[dict[str, Any]],
    doc_title: str,
    lex: Lexicon | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """离线主题回答：证据筛选 + 论证分组，不调用大模型。"""
    evidence = _topic_evidence(question, hits, lex, limit=min(8, len(hits)))
    if not evidence:
        return "资料不足：索引中未找到与问题相关的内容。", []

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
    return "\n\n".join(parts), ordered_evidence


def _clean_generated_answer(text: str) -> str:
    """移除模型重复输出的来源行，来源统一由下方 citations 区域展示。"""
    lines = []
    for line in text.strip().splitlines():
        if re.match(r"^\s*(?:出处|来源|引用来源)\s*[:：]", line):
            continue
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


def _post(url: str, payload: dict, headers: dict[str, str] | None = None, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ollama_answer(prompt: str, cfg: dict[str, Any]) -> str:
    a_cfg = cfg["answer"]
    data = _post(
        f"{a_cfg.get('ollama_base', 'http://localhost:11434').rstrip('/')}/api/generate",
        {
            "model": a_cfg.get("model", "qwen2.5:7b"),
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": float(a_cfg.get("temperature", 0.2))},
        },
    )
    return data.get("response", "").strip()


def api_answer(prompt: str, cfg: dict[str, Any]) -> str:
    a_cfg = cfg["answer"]
    base = a_cfg.get("api_base", "").rstrip("/")
    if not base:
        raise ValueError("answer.api_base 未配置")
    data = _post(
        f"{base}/chat/completions",
        {
            "model": a_cfg.get("model", "qwen2.5:7b"),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": float(a_cfg.get("temperature", 0.2)),
        },
        headers={"Authorization": f"Bearer {a_cfg.get('api_key', '')}"},
    )
    return data["choices"][0]["message"]["content"].strip()


# --------------------------------------------------------------------------- #
# 提问类型判定：点查询 vs 范围查询
# --------------------------------------------------------------------------- #
# 「溯源回答」是一个版块，但用户的问题有两类诉求，需要不同的召回规模与组织方式：
#
#   点查询    「什么是字头？」「大他者是什么意思？」「3-2 讲什么？」
#             → 少而准（top-k 8），每条论断可回跳原文；回答 3—5 段、数百字。
#   范围查询  「马克思在体系中的位置」「谈谈精神分析」「黑格尔的思想脉络」
#             → 高召回（数百块），按数值单元聚合、恢复连续段落群；
#             回答按体系结构分节、数千字，与离线时代的「专题提炼稿」同量级。
#
# 两者共用同一索引与同一返回结构（answer + citations），对用户是同一个入口，
# 差别只体现在回答的深度与覆盖面。`ask --strategy auto|point|theme` 可显式指定。
RE_THEME_QUERY = re.compile(
    r"(思想|学说|理论体系|主题|脉络|谱系|全貌|综述|概览|概况|面貌|总体|整体|"
    r"位置|地位|角色|分布|梳理|评述|论述|专题|系统地|全面地|"
    r"谈谈|讲讲|说说|介绍一下|介绍下|展开说|展开讲)"
)
RE_POINT_QUERY = re.compile(
    r"(什么是|何谓|何为|是什么意思|指的是什么|意指什么|是什么|指什么|"
    r"在哪|哪里|何处|第几|哪一卷|哪个单元|谁|为什么|为何|如何|怎么)"
)
RE_UNIT_ONLY = re.compile(r"^\d+(?:-\d+){1,3}$")

# 从提问里剥掉「提问句式 + 主题修饰词」，剩下的就是主题词本身
RE_TOPIC_NOISE = re.compile(
    r"(什么是|何谓|何为|是什么意思|指的是什么|意指什么|是什么|指什么|"
    r"在[^，。？；]{0,10}?(?:中|里|内)的?(?:位置|地位|角色|分布)|"
    r"思想|学说|理论体系|主题|脉络|谱系|全貌|综述|概览|概况|面貌|总体|整体|"
    r"位置|地位|角色|分布|梳理|评述|论述|专题|系统地|全面地|"
    r"谈谈|讲讲|说说|介绍一下|介绍下|介绍|展开说|展开讲|展开|"
    r"如何|怎么|怎样|为什么|为何|哪些|什么|请|请问|的|了|吗|呢|吧)"
)
_TRIM = " \u3000?？。！!，,、：:；;…~～·-—"


def _core_topic(question: str) -> str:
    """剥掉提问句式与主题修饰词，留下核心实词短语。"""
    return RE_TOPIC_NOISE.sub("", question or "").strip(_TRIM)


def classify_question(question: str, lex: Lexicon | None = None) -> str:
    """判定问题属于「点查询」还是「范围查询」。

    顺序即优先级：先看有没有「主题式」措辞（思想 / 脉络 / 体系中的位置 / 谈谈 …），
    再看是不是一个**裸主题词**（「马克思」「精神分析」——词典能锚定、又不含提问句式），
    最后才落到点查询。定义式提问（「什么是 X」）始终走点查询，保证精确。
    """
    q = (question or "").strip()
    if not q:
        return "point"
    if RE_THEME_QUERY.search(q):
        return "theme"
    core = _core_topic(q)
    stripped = q.strip(_TRIM)
    if core and core == stripped and not RE_POINT_QUERY.search(q):
        # 整句就是一个主题词（无提问句式），例如「马克思」「精神分析」「辩证法」
        if RE_UNIT_ONLY.match(core):
            return "point"
        if lex is not None and (lex.match_philosophers(core) or lex.match_concepts(core)):
            return "theme"
        if 2 <= len(core) <= 12:
            return "theme"
    return "point"


def theme_topic(question: str, lex: Lexicon | None) -> str:
    """从提问里抽出用于聚合的主题词。

    优先取词典锚点（第一个出现的理论家 / 概念），这样「马克思在体系中的位置」
    会被归一成「马克思」而不是整句；词典没有锚点时才退回「剥掉提问句式后的实词短语」。
    """
    if lex is not None:
        phils = sorted(lex.iter_philosophers(question), key=lambda x: x[0])
        if phils:
            return phils[0][2]
        concs = sorted(lex.iter_concepts(question), key=lambda x: x[0])
        if concs:
            return concs[0][2]
    return _core_topic(question) or (question or "").strip()


def answer(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    strategy: str = "auto",
) -> dict[str, Any]:
    """问答主链路：问题闸门 → 类型判定 → 检索 → 组装上下文 → 生成 → 附引用。

    这是「溯源回答」的**唯一入口**。`strategy` 决定内部走哪条召回策略：
      auto（默认）—— 由 classify_question 自动判定点查询 / 范围查询
      point        —— 强制点查询（top-k 少而准）
      theme        —— 强制范围查询（高召回 + 按单元聚合，输出与专题提炼同量级）

    注意：本链路**不接受元数据筛选**。筛选会先缩小候选池再检索，容易把承载
    「概念定义」的段落（常在前言 / 总纲 / 其他单元）排除在外，导致内容被截断。
    需要按单元 / 理论家 / 概念浏览时，请走 `term_lookup` / `quote_search` / 分面统计。
    """
    # ---- ① 问题闸门：不适合检索的问题在此终止，不进检索流程 ----
    gate = check_question(question, lex, cfg)
    if not gate["ok"]:
        return {
            "question": question,
            "backend": "gate",
            "strategy": "gate",
            "skipped": True,
            "gate": gate,
            "answer": skip_answer(gate),
            "citations": [],
        }

    # ---- ①b 语义相关性格挡：无锚点、又和语料相似度过低的问题也直接跳过 ----
    # 硬编码拦截模式（寒暄 / 实时信息 …）覆盖不了所有垃圾输入，这一层用
    # 「查询与全语料的最高余弦相似度」做兜底：与本书无关的问题在此终止，
    # 不需要跑检索，也不产生噪声结果。
    gate_cfg = cfg.get("gate", {}) if cfg else {}
    if gate_cfg.get("relevance", True) and gate.get("anchor") is False:
        rel_gate = check_relevance(store, question, cfg)
        if not rel_gate["ok"]:
            return {
                "question": question,
                "backend": "gate",
                "strategy": "gate",
                "skipped": True,
                "gate": rel_gate,
                "answer": skip_answer(rel_gate),
                "citations": [],
            }

    # ---- ② 类型判定：同一个入口，按问题诉求选择召回策略 ----
    strat = (strategy or "auto").lower()
    if strat not in ("point", "theme"):
        strat = classify_question(question, lex)

    if strat == "theme":
        res = theme_answer(store, lex, theme_topic(question, lex), cfg)
        res.update(question=question, strategy="theme", gate=gate, skipped=False)
        return res

    backend = cfg["answer"].get("backend", "template")
    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))

    # ---- ② 全文混合检索：整篇语料参与召回，不做任何元数据筛选 ----
    hits = hybrid_search(
        store, question, cfg, lex,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

    # ---- ③ 生成 ----
    if backend == "template":
        text, citation_hits = template_answer(question, hits, doc_title, lex)
    else:
        prompt = PROMPT_TEMPLATE.format(
            context=build_context(hits, doc_title),
            question=question,
            max_chars=int(cfg["answer"].get("max_answer_chars", 400)),
        )
        text = ollama_answer(prompt, cfg) if backend == "ollama" else api_answer(prompt, cfg)
        text = _clean_generated_answer(text)
        citation_hits = hits

    if not citation_hits:
        citation_hits = hits

    citations = [
        {
            "n": n,
            "chunk_id": h["chunk"].chunk_id,
            "citation": h["chunk"].citation(doc_title),
            "chapter_path": h["chunk"].chapter_path,
            "unit": h["chunk"].unit_code(),
            "unit_title": lex.unit_title(h["chunk"].unit_code()),
            "volume": h["chunk"].volume(),
            "start": h["chunk"].start,
            "end": h["chunk"].end,
            "page": h["chunk"].page,
            "chunk_type": h["chunk"].chunk_type,
            "philosophers": h["chunk"].philosophers,
            "concepts": h["chunk"].concepts,
            "eras": h["chunk"].eras,
            "text": h["chunk"].text,
            "score": round(h["score"], 6),
        }
        for n, h in enumerate(citation_hits, start=1)
    ]

    return {
        "question": question,
        "backend": backend,
        "strategy": "point",
        "skipped": False,
        "gate": gate,
        "answer": text,
        "citations": citations,
    }


# --------------------------------------------------------------------------- #
# 范围查询策略（溯源回答的 theme 分支）
# --------------------------------------------------------------------------- #
# 点查询的提示词要求「3—5 段、不超过 700 字」——它是为**定位一句出处**设计的。
# 主题式提问要的是相反的东西：按体系结构铺开、覆盖多个单元、保留长引文。
# 因此单独一套提示词，长度约束差一个量级。
THEME_PROMPT = """你是一位严谨的哲学文献研究员，正在为《{doc_title}》回答一个**主题式提问**。

提问：{topic}

请依据下面**已按数值单元聚合好**的资料作答——不要只回答一句话，而要给出该主题在全书中完整的思想面貌。

写作要求：
1. 只使用「资料」中的内容，不引入资料之外的知识；每个论断后用 [单元编号] 或（p页码）标注来源；
2. **必须按体系结构组织**，而不是按资料出现顺序罗列。固定四节：
   ① 体系定位——该主题在全书各卷、各数值单元中的分布与位置，最密集处在哪里；
   ② 核心单元的思想骨架——主题最密集的单元分别讲了什么：核心定义、形成机制、论证路径；
   ③ 衍生与谱系——与主题并置、由主题派生的其他理论家与单元，说明其关系（上游/同代/后继/反对）；
   ④ 张力与批判——书中对该主题的保留意见、内部矛盾、未决问题；
3. 每个核心单元至少给出 2—3 句有实质内容的论述，**不要只摘一句就换下一个单元**；
4. 保留原文的关键术语与引文（用「」标出），不要改写成通俗解释，也不要合并不同单元的表述；
5. 用中文，篇幅约 {min_chars}—{max_chars} 字，宁可详实不要空泛。

资料（已按单元聚合；标题行给出单元编号、标题、命中块数）：
{context}

主题：{topic}

回答："""


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


def render_theme(res: dict[str, Any], lex: Lexicon, cfg: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """离线（template 后端）范围查询：按单元分节，每节给主题句群 + 关键引文。

    与点查询的 `template_answer` 的区别：那里每块只取 1 句、最多 8 句；
    这里每个核心单元取一整段「主题句群」（约 300 字），并按体系结构分节，
    产出的是有骨架的短篇论述，而不是 8 条孤立摘录。
    """
    t_cfg = cfg.get("theme", {}) or {}
    per_unit = int(t_cfg.get("answer_chars_per_unit", 340))
    core_n = int(t_cfg.get("core_units", 6))
    ext_n = int(t_cfg.get("extended_units", 6))
    doc_title = "《" + str(cfg.get("doc", {}).get("title", "")) + "》"

    a, n = res["anchors"], res["counts"]
    terms = [t for t in [res["topic"], *a["philosophers"], *a["concepts"]] if t]
    units = res["units"]
    core, ext = units[:core_n], units[core_n : core_n + ext_n]

    # 概览（命中块数 / 覆盖单元 / 语义补充）由输出层统一渲染（`render_answer` 的
    # 「聚合概览」一节），正文里不再重复，直接从结构分节开始。
    lines: list[str] = []
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

    # ---- 二、核心单元 ----
    citations: list[dict[str, Any]] = []
    lines.append(f"### 二、核心单元（按命中密度，前 {len(core)} 个）")
    for u in core:
        head = f"#### {u['code']} {u['title']}" if u["code"] else f"#### {u['title']}"
        lines.append(head)
        lines.append(f"*{u['volume'] or '—'}｜命中 {u['hits']}/{u['total']} 块（密度 {u['density']}）*")
        lines.append("")
        body = _theme_sentences(u["groups"][0]["text"] if u["groups"] else "", terms, per_unit)
        lines.append(body)
        # 该单元内若有引文块，补一条关键引文（专题稿的「金句」来源）。
        # 优先挑长度适中（10–140 字）且主题词密度高的，避免选出被切碎的残句。
        qs = [q for g in u["groups"] for q in g["quotes"] if 10 <= len(q) <= 140]
        if qs:
            best = max(qs, key=lambda q: sum(1 for t in terms if t in q) * 100 + len(q))
            lines.append(f"> 「{best}」")
        g0 = u["groups"][0] if u["groups"] else None
        if g0:
            citations.append(
                {
                    "n": len(citations) + 1,
                    "chunk_id": g0["chunk_ids"][0],
                    "citation": f"{doc_title} · {u['code']} {u['title']} · 第 {g0['page']} 页",
                    "chapter_path": [u["volume"], f"{u['code']} {u['title']}"],
                    "unit": u["code"],
                    "unit_title": u["title"],
                    "volume": u["volume"],
                    "start": g0["start"],
                    "end": g0["end"],
                    "page": g0["page"],
                    "chunk_type": "body",
                    "philosophers": a["philosophers"],
                    "concepts": a["concepts"],
                    "eras": [],
                    "text": g0["text"][:600],
                    "score": u["density"],
                }
            )
        lines.append("")

    # ---- 三、衍生与谱系 ----
    if res["lineage"] or ext:
        lines.append("### 三、衍生与谱系")
        if res["lineage"]:
            lin = "、".join(f"{name}（{c}）" for name, c in res["lineage"][:12])
            lines.append(f"- 共现理论家（次数）：{lin}")
        if res["eras"]:
            lines.append("- 年代分布：" + "、".join(f"{e}（{c}）" for e, c in res["eras"]))
        for u in ext:
            if u["groups"]:
                snippet = _theme_sentences(u["groups"][0]["text"], terms, per_unit // 2)
                lines.append(f"- **{u['code']} {u['title']}**（{u['hits']} 块）：{snippet}")
        lines.append("")

    # ---- 四、引用来源 ----
    lines.append("### 四、引用来源")
    for c in citations:
        lines.append(f"- **[{c['n']}]** {c['citation']} · 字符 {c['start']}-{c['end']}")
    lines.append("")
    lines.append(
        f"> 本回答由离线抽取式后端生成（`answer.backend=template`），共聚合 {n['direct']} 块证据、"
        f"上下文 {res['context_chars']} 字。接入本地模型（`backend: ollama`）可获得连贯的成篇论述。"
    )
    return "\n".join(lines), citations


def theme_answer(
    store: Store, lex: Lexicon, topic: str, cfg: dict[str, Any]
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

    if backend == "template":
        text, citations = render_theme(res, lex, cfg)
    else:
        a_cfg = cfg["answer"]
        prompt = THEME_PROMPT.format(
            doc_title=doc_title,
            topic=topic,
            context=res["context"],
            min_chars=int(a_cfg.get("theme_min_chars", 1500)),
            max_chars=int(a_cfg.get("theme_max_chars", 4000)),
        )
        text = ollama_answer(prompt, cfg) if backend == "ollama" else api_answer(prompt, cfg)
        text = _clean_generated_answer(text)
        citations = [
            {
                "n": i,
                "chunk_id": u["groups"][0]["chunk_ids"][0] if u["groups"] else "",
                "citation": f"{doc_title} · {u['code']} {u['title']}",
                "unit": u["code"],
                "unit_title": u["title"],
                "volume": u["volume"],
                "page": u["groups"][0]["page"] if u["groups"] else 0,
                "start": u["groups"][0]["start"] if u["groups"] else 0,
                "end": u["groups"][0]["end"] if u["groups"] else 0,
                "chunk_type": "body",
                "philosophers": res["anchors"]["philosophers"],
                "concepts": res["anchors"]["concepts"],
                "eras": [],
                "text": u["groups"][0]["text"][:600] if u["groups"] else "",
                "score": u["density"],
            }
            for i, u in enumerate(res["units"], start=1)
        ]

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
