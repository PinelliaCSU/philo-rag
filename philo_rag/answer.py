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
from .retrieve import hybrid_search
from .schema import Chunk

PROMPT_TEMPLATE = """你是一位严谨的哲学文献助手，正在为读者讲解《哲学大纲》一书。

要求：
1. 只使用下面「资料」中的内容作答，不要引入资料之外的知识；
2. 每个论断后面用 [编号] 标注来源，例如 [1][3]；
3. 如果资料不足以回答，请直接说明「资料不足」，绝不编造；
4. 涉及哲学大纲体系时，使用其术语（字头、场域论、本体论、认识论、目的论、四话语等）；
5. 用中文回答，条理清晰，不超过 {max_chars} 字。

资料：
{context}

问题：{question}

回答："""

RE_SENT = re.compile(r"[^。！？；\n]+[。！？；]?")


def build_context(hits: list[dict[str, Any]], doc_title: str) -> str:
    parts: list[str] = []
    for n, h in enumerate(hits, start=1):
        c: Chunk = h["chunk"]
        parts.append(f"[{n}] 出处：{c.citation(doc_title)}\n{c.text}")
    return "\n\n".join(parts)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in RE_SENT.findall(text) if len(s.strip()) >= 8]


def _query_terms(question: str) -> set[str]:
    """查询词：用与索引一致的分词器，避免把整句当成一个词。"""
    from .index import tokenize

    return {t for t in tokenize(question) if len(t) >= 2}


def template_answer(question: str, hits: list[dict[str, Any]], doc_title: str) -> str:
    """抽取式：在每个命中块内挑出与问题词重合最多的句子，拼成要点并附引用编号。"""
    if not hits:
        return "资料不足：索引中未找到与问题相关的内容。"

    q_terms = _query_terms(question)
    lines = ["（离线抽取模式：未调用大模型，以下要点均来自检索到的原文）", ""]
    for n, h in enumerate(hits, start=1):
        c: Chunk = h["chunk"]
        sents = _sentences(c.text) or [c.text]
        best_i = max(range(len(sents)), key=lambda i: sum(1 for t in q_terms if t in sents[i]))
        snippet = sents[best_i]
        if len(snippet) < 40 and best_i + 1 < len(sents):
            snippet += sents[best_i + 1]
        if len(snippet) > 140:
            snippet = snippet[:140] + "…"
        lines.append(f"[{n}] {snippet}")
        lines.append(f"     出处：{c.citation(doc_title)}")
    return "\n".join(lines)


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
    max_ctx = int(cfg["answer"].get("max_context_chunks", 6))
    hits = hybrid_search(store, question, cfg, lex, filters=filters, top_k=max_ctx)
    doc_title = store.manifest.get("doc_title", "")

    backend = cfg["answer"].get("backend", "template")
    if backend == "template":
        text = template_answer(question, hits, doc_title)
    else:
        prompt = PROMPT_TEMPLATE.format(
            context=build_context(hits, doc_title),
            question=question,
            max_chars=int(cfg["answer"].get("max_answer_chars", 400)),
        )
        text = ollama_answer(prompt, cfg) if backend == "ollama" else api_answer(prompt, cfg)

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
        for n, h in enumerate(hits, start=1)
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
