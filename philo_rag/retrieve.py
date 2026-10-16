"""检索层：稠密 + 稀疏 → RRF 融合 → 元数据过滤 → 可选重排。

对外提供三个入口，对应三类需求：
  hybrid_search()  引用溯源问答（问答主链路）
  term_lookup()    术语索引与语义检索
  quote_search()   按哲学家 / 概念 / 年代的引文检索
"""
from __future__ import annotations

import re
from typing import Any

import numpy as np

from .embed import get_embedder
from .index import Store, tokenize
from .lexicon import Lexicon
from .rerank import _rerank
from .schema import Chunk


# --------------------------------------------------------------------------- #
# 基础检索
# --------------------------------------------------------------------------- #
def _dense_rank(store: Store, qvec: np.ndarray) -> list[tuple[int, float]]:
    assert store.vectors is not None
    sims = store.vectors @ qvec
    order = np.argsort(-sims)
    return [(int(i), float(sims[i])) for i in order]


def _sparse_rank(store: Store, query: str) -> list[tuple[int, float]]:
    if store.bm25 is None:
        return []
    scores = np.maximum(store.bm25.get_scores(tokenize(query)), 0.0)
    order = np.argsort(-scores)
    return [(int(i), float(scores[i])) for i in order if scores[i] > 0]


def rrf_fuse(
    rankings: list[list[tuple[int, float]]],
    k: int = 60,
    weights: list[float] | None = None,
) -> dict[int, float]:
    """Reciprocal Rank Fusion：只用排名，不依赖两路分数量纲。

    weights 用于调节各路话语权：当稠密后端只是词法近似（如 hashing）时，
    应当下调其权重，避免它给 BM25 的正确排名注入噪声。
    """
    fused: dict[int, float] = {}
    ws = weights or [1.0] * len(rankings)
    for ranking, w in zip(rankings, ws):
        for rank, (idx, _score) in enumerate(ranking, start=1):
            fused[idx] = fused.get(idx, 0.0) + w / (k + rank)
    return fused


def _covered(q: Chunk, b: Chunk) -> float:
    """引文 q 的字符区间被正文块 b 覆盖的比例。"""
    ov = min(q.end, b.end) - max(q.start, b.start)
    return ov / max(q.end - q.start, 1)


def _dedupe(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """同一段文字同时以正文和引文出现时，只保留信息量更大的那个。

    两种重复都要处理：
      * 完全包含 —— 引文整段就在正文块里；
      * 部分覆盖 —— 引文跨了两个正文块，按「重叠最多的块」挂靠后，正文那一侧
        仍有半截重复。仅靠字符串包含判断会漏掉这一种，答案里就会出现两条近乎
        相同的引用。
    """
    out: list[dict[str, Any]] = []
    for r in results:
        c: Chunk = r["chunk"]
        drop = False
        for i, kept in enumerate(out):
            kc: Chunk = kept["chunk"]
            if kc.chunk_type == "quote" and c.chunk_type != "quote":
                if kc.text in c.text or _covered(kc, c) >= 0.5:
                    out[i] = r
                    drop = True
                    break
            elif c.chunk_type == "quote" and kc.chunk_type != "quote":
                if c.text in kc.text or _covered(c, kc) >= 0.5:
                    drop = True
                    break
        if not drop:
            out.append(r)
    return out


# --------------------------------------------------------------------------- #
# 定义句识别：术语类知识库的关键改进
# --------------------------------------------------------------------------- #
# 只有「什么是 X」这种**直接问定义**的问句才触发；「X 的核心主张是什么」不算。
RE_DEF_QUERY = (
    re.compile(r"什么是\s*([^\s，。、；：？！?]+)"),
    re.compile(r"何谓\s*([^\s，。、；：？！?]+)"),
    re.compile(r"何为\s*([^\s，。、；：？！?]+)"),
    re.compile(r"([^\s，。、；：？！?]+?)\s*(?:是什么意思|指的是什么|意指什么|是什么)"),
)
# X 的定义句式：「X即…」「X 是…」「X：…」「所谓"X"」
DEF_PATTERNS = ("即", "是", "指", "为", "：", ":", "——")


def _known_term(phrase: str, lex: Lexicon) -> str:
    """把问句片段归一到词典里的术语；找不到返回空串。

    支持前缀归属：「拉康的大他者」→「大他者」（取最长的已知术语后缀）。
    """
    phrase = phrase.strip(" 的")
    if not phrase:
        return ""
    if phrase in lex.concepts or phrase in lex.philosophers:
        return phrase
    if phrase in lex._unit_by_code:      # noqa: SLF001 - 同包内访问
        return phrase
    best = ""
    for alias, std in lex._concept_alias:
        if phrase.endswith(alias) and len(alias) > len(best):
            best = std
    for alias, std in lex._phil_alias:
        if phrase.endswith(alias) and len(alias) > len(best):
            best = std
    return best


def _definition_terms(query: str, lex: Lexicon | None) -> list[str]:
    """从「什么是 X」这类问句里抽出被问的术语（必须命中词典，否则不触发）。"""
    if not lex:
        return []
    out: list[str] = []
    for pat in RE_DEF_QUERY:
        for m in pat.finditer(query):
            term = _known_term(m.group(1), lex)
            if term and term not in out:
                out.append(term)
    return out


def _definition_score(text: str, terms: list[str]) -> int:
    """块内出现了多少个「术语的定义句式」，每个记 1 分。"""
    hits = 0
    for t in terms:
        if re.search(rf"所谓[\"“]?{re.escape(t)}[\"”]?", text):
            hits += 1
            continue
        for pat in DEF_PATTERNS:
            if re.search(rf"{re.escape(t)}\s*{re.escape(pat)}", text):
                hits += 1
                break
    return hits


# --------------------------------------------------------------------------- #
# 入口一：混合检索（问答主链路）
# --------------------------------------------------------------------------- #
def hybrid_search(
    store: Store,
    query: str,
    cfg: dict[str, Any],
    lex: Lexicon | None = None,
    filters: set[str] | None = None,
    top_k: int | None = None,
) -> list[dict[str, Any]]:
    """混合检索：查询扩展 → 稠密 + 稀疏 → RRF 融合 → 实体/定义加权 → 去重 → 可选重排。

    `filters` 是**可选的浏览式过滤**（限定到某组 chunk_id 再检索）。溯源问答链路
    **不使用**它：筛选会先缩小候选池，容易把承载概念定义的段落排除在外导致内容被截断，
    因此问答固定整篇检索。这个参数留给「限定范围浏览」这类显式需求使用。
    """
    r_cfg = cfg["retrieval"]
    dense_k = int(r_cfg["dense_top_k"])
    sparse_k = int(r_cfg["sparse_top_k"])

    expanded = query
    if r_cfg.get("expand_query") and lex:
        extra = lex.expand_query(query)
        if extra:
            expanded = query + " " + " ".join(extra)

    embedder = get_embedder(cfg["embedding"], cfg.get("_root"))

    # 嵌入模型维度必须与索引一致：换模型后忘重建索引，向量点积会静默算错，
    # 这里提前给出可读错误而不是让 matmul 抛晦涩异常。
    if embedder.dim and store.vectors is not None and embedder.dim != store.vectors.shape[1]:
        raise RuntimeError(
            f"嵌入模型与索引维度不一致：模型 {embedder.dim}D，索引 {store.vectors.shape[1]}D。"
            f"更换 embedding.model 后请先运行 `python -m philo_rag.cli build` 重建索引。"
        )
    qvec = embedder.encode([expanded])[0]

    dense = _dense_rank(store, qvec)
    sparse = _sparse_rank(store, expanded)

    if filters is not None:
        dense = [(i, s) for i, s in dense if store.chunks[i].chunk_id in filters]
        sparse = [(i, s) for i, s in sparse if store.chunks[i].chunk_id in filters]

    dense = dense[:dense_k]
    sparse = sparse[:sparse_k]

    # 查询实体（哲学家 / 概念）：既用于元数据通道，也用于实体加权与「命中注解」
    q_phil = set(lex.match_philosophers(query)) if lex else set()
    q_conc = set(lex.match_concepts(query)) if lex else set()

    # 元数据通道：把「查询实体 ∩ 块注解」做成一路**排名**（而不是固定加成），
    # 与稠密 / 稀疏一起进 RRF。权重 meta_weight=0 时该通道整体关闭，
    # 检索行为与旧版完全一致（便于冻结评测基线做 A/B）。
    rankings: list[list[tuple[int, float]]] = [dense, sparse]
    weights: list[float] = [
        float(r_cfg.get("dense_weight", 1.0)),
        float(r_cfg.get("sparse_weight", 1.0)),
    ]
    meta_weight = float(r_cfg.get("meta_weight", 0.0))
    meta_pos: dict[int, int] = {}
    if meta_weight and (q_phil or q_conc):
        meta_k = int(r_cfg.get("meta_top_k", 40))
        # 章节级注解是推断层：算半分，避免「兄弟块提到过」压过「本块精确命中」
        section_half = float(r_cfg.get("meta_section_weight", 0.5))
        meta_scored: list[tuple[float, int]] = []
        for idx, c in enumerate(store.chunks):
            exact = len(q_phil & set(c.philosophers)) + len(q_conc & set(c.concepts))
            section = len(q_phil & set(c.section_philosophers)) \
                + len(q_conc & set(c.section_concepts))
            score = exact + section_half * section
            if score > 0:
                meta_scored.append((score, idx))
        meta_scored.sort(key=lambda x: (-x[0], x[1]))
        meta = [(idx, sc) for sc, idx in meta_scored[:meta_k]]
        if meta:
            rankings.append(meta)
            weights.append(meta_weight)
            meta_pos = {idx: r for r, (idx, _) in enumerate(meta, start=1)}

    fused = rrf_fuse(rankings, int(r_cfg.get("rrf_k", 60)), weights)
    dense_pos = {i: r for r, (i, _) in enumerate(dense, start=1)}
    sparse_pos = {i: r for r, (i, _) in enumerate(sparse, start=1)}

    # 实体加权：查询中出现的哲学家/概念，若被块标注命中，给予小幅加分。
    # 这一步是「元数据即信号」——它把词典层已经算好的结构化信息用起来，
    # 同时为 RRF 的平票提供有意义的确定性排序依据。
    boost = float(r_cfg.get("entity_boost", 0.003))

    # 定义句加权：问「什么是 X」时，真正**定义** X 的块应当压过只是**用到** X 的块。
    # 术语类知识库里，这是最常见的 top-1 误排来源。
    def_terms = _definition_terms(query, lex)
    def_boost = float(r_cfg.get("definition_boost", 0.02)) if def_terms else 0.0

    scored: list[tuple[float, int, int]] = []
    for idx, score in fused.items():
        c = store.chunks[idx]
        if boost and (q_phil or q_conc):
            hits = len(q_phil & set(c.philosophers)) + len(q_conc & set(c.concepts))
            score += boost * hits
        if def_boost:
            score += def_boost * _definition_score(c.text, def_terms)
        best_rank = min(
            dense_pos.get(idx, 10**6),
            sparse_pos.get(idx, 10**6),
            meta_pos.get(idx, 10**6),
        )
        scored.append((score, best_rank, idx))

    # 排序键：(融合分降序, 最好名次升序, 块序升序) —— 消除平票的任意性
    scored.sort(key=lambda x: (-x[0], x[1], x[2]))

    results: list[dict[str, Any]] = []
    for score, _best, idx in scored:
        c = store.chunks[idx]
        results.append(
            {
                "chunk": c,
                "score": score,
                "dense_rank": dense_pos.get(idx),
                "sparse_rank": sparse_pos.get(idx),
                "meta_rank": meta_pos.get(idx),
                # 命中的注解 = 查询实体 ∩ 块注解（不是块的全部注解）：
                # 前端据此区分「这次答案用到的标签」与「块的背景标签」
                "matched_concepts": sorted(q_conc & set(c.concepts)),
                "matched_philosophers": sorted(q_phil & set(c.philosophers)),
            }
        )

    results = _dedupe(results)

    if r_cfg.get("rerank"):
        # 只重排融合后的前 window 个候选，而不是全部 ~80 个：
        # 最终只取 top_k=8，重排前 12 个已留足提升余量（见 _rerank 的耗时说明）。
        window = int(r_cfg.get("rerank_top_k", 12))
        results = _rerank(results, query, cfg, window=window)

    return results[: (top_k or int(r_cfg["final_top_k"]))]




# --------------------------------------------------------------------------- #
# 入口二：术语索引与语义检索
# --------------------------------------------------------------------------- #
def term_lookup(
    store: Store,
    lex: Lexicon,
    term: str,
    cfg: dict[str, Any],
    top_k: int = 8,
) -> dict[str, Any]:
    """先查术语词典（精确、可解释），再补语义检索（兜底）。"""
    card = lex.concept_card(term)
    names = {term}
    if card:
        names.add(card["name"])
        names.update(card.get("aliases", []))

    ids: set[str] = set()
    for name in names:
        ids |= set(store.terms["concept"].get(name, []))
        ids |= set(store.terms["philosopher"].get(name, []))
        ids |= set(store.terms["unit"].get(name, []))

    exact = [c for c in store.chunks if c.chunk_id in ids]
    # 排序：正文优先 → 含定义句优先 → 术语密度高优先 → 文档序。
    # 只按文档序排会把「顺便提到」的块排到「定义它」的块前面。
    main = card["name"] if card else term

    def _rank(c: Chunk) -> tuple:
        n = c.text.count(main)
        density = n / max(len(c.text), 1)
        defn = 1 if re.search(
            rf"(所谓[\"“]?{re.escape(main)}|{re.escape(main)}\s*[即为指：])", c.text) else 0
        return (c.chunk_type != "body", -defn, -density, c.seq)

    exact.sort(key=_rank)

    semantic = hybrid_search(store, term, cfg, lex, top_k=top_k)
    seen = {c.chunk_id for c in exact}
    semantic = [r for r in semantic if r["chunk"].chunk_id not in seen]

    return {
        "term": term,
        "card": card,
        "exact_hits": exact[:top_k],
        "exact_total": len(ids),
        "semantic_hits": semantic[:top_k],
    }


# --------------------------------------------------------------------------- #
# 入口三：按哲学家 / 概念 / 年代的引文检索
# --------------------------------------------------------------------------- #
def _birth(lex: Lexicon, chunk: Chunk) -> int:
    years = []
    for p in chunk.philosophers:
        b = lex.philosophers.get(p, {}).get("birth")
        if b is not None:
            years.append(int(b))
    return min(years) if years else 10**9


def _as_list(v: str | list[str] | None) -> list[str] | None:
    """兼容「单个字符串」与「列表」两种传参（CLI 的 --philosopher 是 append 型）。"""
    if v is None:
        return None
    return list(v) if isinstance(v, (list, tuple)) else [v]


def quote_search(
    store: Store,
    lex: Lexicon,
    philosopher: str | list[str] | None = None,
    concept: str | None = None,
    era: str | None = None,
    school: str | None = None,
    unit: str | None = None,
    volume: str | None = None,
    axis: str | None = None,
    speaker: str | list[str] | None = None,
    keyword: str | None = None,
    top_k: int = 20,
) -> list[Chunk]:
    """引文检索走「元数据倒排 + 精确过滤」，不做向量近似，保证结果可枚举、可核对。

    两个理论家维度，语义不同，不要混用：
      * `philosopher` —— **相关理论家**（含语境）：引文所在段落讨论到该人即命中，
        召回高，适合「找出书中所有谈拉康的引文」；
      * `speaker` —— **说话人**：只认有引述标记的归因（见 ingest.find_speaker），
        精度高但覆盖低，适合「拉康原话」。
    `axis` 是四层坐标过滤（如 场域论=2），来自 chunk.coords，依赖新版注解索引。
    结果按「与查询理论家的关系远近」分档排序：说话人 → 引文正文提及 → 语境相关。
    """
    plist = _as_list(philosopher)
    allowed = store.filter_ids(
        philosophers=plist,
        era=era,
        concept=concept,
        school=school,
        unit=unit,
        volume=volume,
        axis=axis,
        chunk_type="quote",
    )
    slist = _as_list(speaker)
    if slist:
        s_ids = {c.chunk_id for c in store.quotes() if c.speaker in slist}
        allowed = s_ids if allowed is None else (allowed & s_ids)

    out: list[Chunk] = []
    for c in store.quotes():
        if allowed is not None and c.chunk_id not in allowed:
            continue
        if keyword and keyword not in c.text:
            continue
        out.append(c)

    pset = set(plist or [])

    def tier(c: Chunk) -> int:
        """与查询理论家的关系档位：0 说话人 / 1 引文正文提及 / 2 语境相关。"""
        if not pset:
            return 0
        if c.speaker in pset:
            return 0
        if pset & set(lex.match_philosophers(c.text)):
            return 1
        return 2

    out.sort(key=lambda c: (tier(c), _birth(lex, c), c.seq))
    return out[:top_k]


def quote_payload(store: Store, lex: Lexicon, **kw) -> dict[str, Any]:
    """引文检索的结构化结果（供 CLI / Web / 批处理统一渲染）。"""
    quotes = quote_search(store, lex, **kw)
    doc_title = store.manifest.get("doc_title", "")
    return {
        "filters": {k: v for k, v in kw.items() if k != "top_k" and v},
        "count": len(quotes),
        "quotes": [
            {
                "chunk_id": c.chunk_id,
                "text": c.text,
                "speaker": c.speaker,
                "philosophers": c.philosophers,
                "concepts": c.concepts,
                "eras": c.eras,
                "unit": c.unit_code(),
                "unit_title": lex.unit_title(c.unit_code()),
                "volume": c.volume(),
                "chapter_path": c.chapter_path,
                "citation": c.citation(doc_title),
                "page": c.page,
                "start": c.start,
                "end": c.end,
            }
            for c in quotes
        ],
    }


def facet_summary(store: Store, lex: Lexicon) -> dict[str, list[tuple[str, int]]]:
    """分面统计：给检索界面提供可点击的筛选维度。"""

    def top(d: dict[str, list[str]], n: int = 40) -> list[tuple[str, int]]:
        return sorted(((k, len(v)) for k, v in d.items()), key=lambda x: -x[1])[:n]

    # 说话人是引文专有维度：只统计有引述标记的归因，供「拉康原话」这类精确检索
    speakers: dict[str, list[str]] = {}
    for c in store.chunks:
        if c.chunk_type == "quote" and c.speaker:
            speakers.setdefault(c.speaker, []).append(c.chunk_id)

    return {
        "philosopher": top(store.terms["philosopher"]),
        "concept": top(store.terms["concept"]),
        "era": top(store.terms["era"]),
        "school": top(store.terms["school"]),
        "volume": top(store.terms["volume"], 10),
        "unit": top(store.terms["unit"], 60),
        "speaker": top(speakers),
    }


# --------------------------------------------------------------------------- #
# 概念卡构建：/api/concept 数据源
# --------------------------------------------------------------------------- #
def build_concept_card(store: Store, lex: Lexicon, term: str, limit: int = 8) -> dict[str, Any]:
    """术语概念卡：定义句与出处 + 单元分布 + 共现理论家 + 相关引文。

    只读 store 与 lex，不走向量检索。定义句来自正文块（含「X 是/即/意味着」
    定义句式），单元/理论家统计来自块元数据与正文命中，引文来自 quote 块。
    """
    limit = max(0, min(int(limit), 20))
    card = lex.concept_card(term)
    if card is None:
        return {
            "term": term,
            "aliases": [],
            "found": False,
            "definition": None,
            "units": [],
            "philosophers": [],
            "quotes": [],
        }

    std = card["name"]
    aliases = list(card.get("aliases") or [])
    names = [std, *aliases]

    def text_has(text: str, name: str) -> bool:
        if name in text:
            return True
        if any(ch.isascii() and ch.isalpha() for ch in name):
            return name.lower() in text.lower()
        return False

    def chunk_hits(c: Chunk) -> bool:
        return std in c.concepts or any(text_has(c.text, n) for n in names)

    # definition：正文中「X 是/即/意味着」的定义句式块。排序键优先正文块、
    # 优先标准名句式、优先与词典定义重合度高的块、优先术语密度高的块。
    defn_pat_std = re.compile(rf"{re.escape(std)}\s*(?:是|即|意味着)")
    defn_pats = [defn_pat_std] + [
        re.compile(rf"{re.escape(n)}\s*(?:是|即|意味着)") for n in aliases
    ]
    lex_tokens = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+", card.get("definition") or "")
    type_rank = {"body": 0, "footnote": 1, "quote": 2}
    defn: Chunk | None = None
    defn_key: tuple | None = None
    for c in store.chunks:
        if not chunk_hits(c):
            continue
        if not any(p.search(c.text) for p in defn_pats):
            continue
        canon = 1 if defn_pat_std.search(c.text) else 0
        density = sum(c.text.count(n) for n in names) / max(len(c.text), 1)
        overlap = sum(1 for tok in lex_tokens if tok in c.text)
        key = (type_rank.get(c.chunk_type, 3), -canon, -overlap, -density, c.seq)
        if defn_key is None or key < defn_key:
            defn_key = key
            defn = c

    doc_title = store.manifest.get("doc_title", "")

    def cite(code: str, title: str, page: int) -> str:
        parts: list[str] = []
        if doc_title:
            parts.append(f"《{doc_title}》")
        if code:
            parts.append(f"{code} {title}".strip() if title else code)
        if page:
            parts.append(f"第 {page} 页")
        return " · ".join(parts)

    definition = None
    if defn is not None:
        code = defn.unit_code()
        title = lex.unit_title(code)
        definition = {
            "text": defn.text,
            "unit": code,
            "unit_title": title,
            "page": int(defn.page or 0),
            "char_span": f"{defn.start}-{defn.end}",
            "citation": cite(code, title, int(defn.page or 0)),
        }

    unit_hits: dict[str, int] = {}
    phil_hits: dict[str, int] = {}
    for c in store.chunks:
        if not chunk_hits(c):
            continue
        code = c.unit_code()
        if code:
            unit_hits[code] = unit_hits.get(code, 0) + 1
        for p in c.philosophers:
            phil_hits[p] = phil_hits.get(p, 0) + 1

    units = [
        {"code": code, "title": lex.unit_title(code), "hits": int(hits)}
        for code, hits in sorted(unit_hits.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    ]
    philosophers = [
        {"name": name, "count": int(count)}
        for name, count in sorted(phil_hits.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    ]

    quote_chunks = [
        c for c in store.quotes() if any(text_has(c.text, n) for n in names)
    ]
    quote_chunks.sort(key=lambda c: c.seq)
    quotes = [
        {
            "text": c.text,
            "speaker": c.speaker or "未署名",
            "unit": c.unit_code(),
            "citation": cite(c.unit_code(), lex.unit_title(c.unit_code()), int(c.page or 0)),
        }
        for c in quote_chunks[:limit]
    ]

    return {
        "term": term,
        "aliases": aliases,
        "found": True,
        "definition": definition,
        "units": units,
        "philosophers": philosophers,
        "quotes": quotes,
    }
