"""生成层：引用溯源问答。

三种后端：
  template —— 离线抽取式，不调用任何模型，直接给出带引用的原文片段（默认，用于自检与降级）
  ollama   —— 本地模型（qwen2.5 / llama3 等），数据不出本机
  api      —— 任意 OpenAI 兼容 /chat/completions 接口

无论哪种后端，返回结构一致：answer + citations，前端可据 citations 跳转原文并高亮。
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

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


def answer(
    store: Store,
    lex: Lexicon,
    question: str,
    cfg: dict[str, Any],
    philosophers: list[str] | None = None,
    era: str | None = None,
    concept: str | None = None,
    school: str | None = None,
    unit: str | None = None,
    volume: str | None = None,
) -> dict[str, Any]:
    """问答主链路：混合检索 → 组装上下文 → 生成 → 附引用。"""
    filters = store.filter_ids(
        philosophers=philosophers, era=era, concept=concept,
        school=school, unit=unit, volume=volume,
    )
    backend = cfg["answer"].get("backend", "template")
    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    candidate_ctx = int(cfg["answer"].get("candidate_chunks", max(max_ctx, 16)))
    hits = hybrid_search(
        store, question, cfg, lex, filters=filters,
        top_k=candidate_ctx if backend == "template" else max_ctx,
    )
    doc_title = store.manifest.get("doc_title", "")

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
        "answer": text,
        "citations": citations,
        "filters": {
            "philosophers": philosophers, "era": era, "concept": concept,
            "school": school, "unit": unit, "volume": volume,
        },
    }
