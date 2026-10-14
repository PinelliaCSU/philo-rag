"""本地链路与生成时延基准测试。

分别测量各环节耗时：
  - 闸门 (check_question + check_relevance)
  - 嵌入编码 (embedder.encode)
  - 稠密检索 (_dense_rank)
  - 稀疏检索 (_sparse_rank)
  - RRF 融合 + 加权 + 去重
  - 重排 (_rerank)
  - 上下文组装
  - LLM 生成 (api_answer)
  - 整体 answer()

用法：
  python -m scripts.bench_latency "什么是字头？"           # 点查询
  python -m scripts.bench_latency "马克思在体系中的位置"    # 范围查询
  python -m scripts.bench_latency --both                    # 两种都测
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# 确保能导入 philo_rag
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from philo_rag.cli import get_lexicon, load_config
from philo_rag.gate import check_question, check_relevance
from philo_rag.index import Store
from philo_rag.retrieve import (
    _dense_rank,
    _dedupe,
    _load_reranker,
    _rerank,
    _sparse_rank,
    hybrid_search,
    rrf_fuse,
)
from philo_rag.answer import answer, classify_question
from philo_rag.embed import get_embedder
from philo_rag.lexicon import Lexicon


def _fmt(ms: float) -> str:
    return f"{ms:7.0f} ms"


def bench_point(question: str, store: Store, lex: Lexicon, cfg: dict) -> None:
    print(f"\n{'='*60}")
    print(f"点查询基准测试：{question!r}")
    print(f"{'='*60}")

    timings: list[tuple[str, float]] = []

    # ① 闸门 check_question
    t0 = time.perf_counter()
    gate = check_question(question, lex, cfg)
    t1 = time.perf_counter()
    timings.append(("① 闸门 check_question", (t1 - t0) * 1000))

    # ①b 语义相关性格挡（如果有锚点则跳过）
    gate_cfg = cfg.get("gate", {})
    if gate_cfg.get("relevance", True) and gate.get("anchor") is False:
        t0 = time.perf_counter()
        rel_gate = check_relevance(store, question, cfg)
        t1 = time.perf_counter()
        timings.append(("①b 语义相关性别挡", (t1 - t0) * 1000))
    else:
        timings.append(("①b 语义相关性别挡", 0.0))

    # ② 嵌入编码
    r_cfg = cfg["retrieval"]
    embedder = get_embedder(cfg["embedding"], cfg.get("_root"))
    expanded = question
    if r_cfg.get("expand_query") and lex:
        extra = lex.expand_query(question)
        if extra:
            expanded = question + " " + " ".join(extra)
    t0 = time.perf_counter()
    qvec = embedder.encode([expanded])[0]
    t1 = time.perf_counter()
    timings.append(("② 嵌入编码", (t1 - t0) * 1000))

    # ③ 稠密检索
    t0 = time.perf_counter()
    dense = _dense_rank(store, qvec)
    t1 = time.perf_counter()
    timings.append(("③ 稠密检索 _dense_rank", (t1 - t0) * 1000))

    # ④ 稀疏检索
    from philo_rag.index import tokenize
    t0 = time.perf_counter()
    sparse = _sparse_rank(store, expanded)
    t1 = time.perf_counter()
    timings.append(("④ 稀疏检索 _sparse_rank", (t1 - t0) * 1000))

    # ⑤ RRF 融合 + 加权
    dense_k = int(r_cfg["dense_top_k"])
    sparse_k = int(r_cfg["sparse_top_k"])
    dense = dense[:dense_k]
    sparse = sparse[:sparse_k]
    t0 = time.perf_counter()
    fused = rrf_fuse(
        [dense, sparse],
        int(r_cfg.get("rrf_k", 60)),
        [float(r_cfg.get("dense_weight", 1.0)), float(r_cfg.get("sparse_weight", 1.0))],
    )
    t1 = time.perf_counter()
    timings.append(("⑤ RRF 融合", (t1 - t0) * 1000))

    # ⑥ 去重
    # 先构造 results（简化版，不含完整加权逻辑）
    from philo_rag.schema import Chunk
    scored: list[tuple[float, int, int]] = []
    dense_pos = {i: r for r, (i, _) in enumerate(dense, start=1)}
    sparse_pos = {i: r for r, (i, _) in enumerate(sparse, start=1)}
    for idx, score in fused.items():
        best_rank = min(dense_pos.get(idx, 10**6), sparse_pos.get(idx, 10**6))
        scored.append((score, best_rank, idx))
    scored.sort(key=lambda x: (-x[0], x[1], x[2]))
    results: list[dict] = []
    for score, _best, idx in scored:
        c = store.chunks[idx]
        results.append({
            "chunk": c, "score": score,
            "dense_rank": dense_pos.get(idx), "sparse_rank": sparse_pos.get(idx),
            "matched_concepts": c.concepts, "matched_philosophers": c.philosophers,
        })
    t0 = time.perf_counter()
    results = _dedupe(results)
    t1 = time.perf_counter()
    timings.append(("⑥ 去重 _dedupe", (t1 - t0) * 1000))

    # ⑦ 重排
    if r_cfg.get("rerank"):
        window = int(r_cfg.get("rerank_top_k", 12))
        t0 = time.perf_counter()
        results = _rerank(results, question, cfg, window=window)
        t1 = time.perf_counter()
        timings.append(("⑦ 重排 _rerank", (t1 - t0) * 1000))
    else:
        timings.append(("⑦ 重排 _rerank", 0.0))

    # ⑧ 上下文组装
    from philo_rag.answer import build_context
    top_k = int(r_cfg["final_top_k"])
    results = results[:top_k]
    t0 = time.perf_counter()
    ctx = build_context(results, store.manifest.get("doc_title", ""))
    t1 = time.perf_counter()
    timings.append(("⑧ 上下文组装", (t1 - t0) * 1000))

    # 汇总
    total = sum(ms for _, ms in timings)
    print(f"\n各环节耗时：")
    for name, ms in timings:
        bar = "█" * max(1, int(ms / max(total, 1) * 40))
        print(f"  {name:30s} {_fmt(ms)}  {bar}")
    print(f"  {'本地检索总计':30s} {_fmt(total)}")

    # ⑨ 整体 answer()
    t0 = time.perf_counter()
    res = answer(store, lex, question, cfg, strategy="point")
    t1 = time.perf_counter()
    total_answer = (t1 - t0) * 1000
    print(f"\n  {'整体 answer()':30s} {_fmt(total_answer)}")
    llm_time = total_answer - total
    print(f"  {'  其中 LLM 生成（估算）':30s} {_fmt(llm_time)}")
    print(f"\n  回答前100字：{res['answer'][:100]}...")
    return total, total_answer


def bench_theme(question: str, store: Store, lex: Lexicon, cfg: dict) -> None:
    print(f"\n{'='*60}")
    print(f"范围查询基准测试：{question!r}")
    print(f"{'='*60}")

    from philo_rag.theme import theme_search, _anchor, _seed_anchor, _collect, _aggregate_by_unit
    from philo_rag.answer import theme_answer

    timings: list[tuple[str, float]] = []
    topic = question

    # ① 主题锚定
    t0 = time.perf_counter()
    phils, concs, units = _anchor(lex, topic)
    seed_mode = not (phils or concs or units)
    t1 = time.perf_counter()
    timings.append(("① 主题锚定 _anchor", (t1 - t0) * 1000))

    # ② 种子锚定（如果未登录主题）
    t_cfg = cfg.get("theme", {})
    if seed_mode:
        seed_k = int(t_cfg.get("seed_top_k", 60))
        t0 = time.perf_counter()
        phils, concs, units = _seed_anchor(store, lex, topic, cfg, seed_k)
        t1 = time.perf_counter()
        timings.append(("② 种子锚定 _seed_anchor", (t1 - t0) * 1000))
    else:
        timings.append(("② 种子锚定 _seed_anchor", 0.0))

    # ③ 三层召回 _collect
    t0 = time.perf_counter()
    collected = _collect(store, lex, topic, phils, concs, units)
    t1 = time.perf_counter()
    timings.append(("③ 三层召回 _collect", (t1 - t0) * 1000))

    direct = collected["meta"] + collected["literal"]
    direct_ids = {c.chunk_id for c in direct}

    # ④ 语义补充 hybrid_search（已在 theme_search 中移除，这里测量空操作）
    timings.append(("④ 语义补充 hybrid_search", 0.0))

    # ⑤ 单元聚合
    group_gap = int(t_cfg.get("group_gap", 3))
    t0 = time.perf_counter()
    units_agg = _aggregate_by_unit(store, lex, direct, group_gap)
    t1 = time.perf_counter()
    timings.append(("⑤ 单元聚合 _aggregate_by_unit", (t1 - t0) * 1000))

    # ⑥ 上下文组装（在 theme_search 内部，这里单独测）
    max_units = int(t_cfg.get("max_units", 12))
    max_group_chars = int(t_cfg.get("max_group_chars", 1500))
    groups_per_unit = int(t_cfg.get("groups_per_unit", 3))
    kept = units_agg[:max_units]
    t0 = time.perf_counter()
    context_parts: list[str] = []
    used = 0
    for u in kept:
        head = f"### 单元 {u['code']} {u['title']}｜{u['volume']}｜命中 {u['hits']} 块"
        context_parts.append(head)
        used += len(head)
        for g in u["groups"][:groups_per_unit]:
            text = g["text"]
            if len(text) > max_group_chars:
                text = text[:max_group_chars].rstrip() + "……"
            context_parts.append(f"（p{g['page']}）{text}")
            used += len(text)
            if used > int(t_cfg.get("context_budget", 24000)):
                break
        if used > int(t_cfg.get("context_budget", 24000)):
            break
    t1 = time.perf_counter()
    timings.append(("⑥ 上下文组装", (t1 - t0) * 1000))

    # 汇总
    total = sum(ms for _, ms in timings)
    print(f"\n各环节耗时：")
    for name, ms in timings:
        bar = "█" * max(1, int(ms / max(total, 1) * 40))
        print(f"  {name:30s} {_fmt(ms)}  {bar}")
    print(f"  {'本地检索总计':30s} {_fmt(total)}")

    # ⑦ 整体 theme_answer()
    t0 = time.perf_counter()
    res = theme_answer(store, lex, topic, cfg)
    t1 = time.perf_counter()
    total_answer = (t1 - t0) * 1000
    print(f"\n  {'整体 theme_answer()':30s} {_fmt(total_answer)}")
    llm_time = total_answer - total
    print(f"  {'  其中 LLM 生成（估算）':30s} {_fmt(llm_time)}")
    print(f"\n  回答前100字：{res['answer'][:100]}...")
    return total, total_answer


def main():
    import argparse

    parser = argparse.ArgumentParser(description="本地链路与生成时延基准测试")
    parser.add_argument("question", nargs="?", default=None, help="测试问题")
    parser.add_argument("--both", action="store_true", help="同时测试点查询和范围查询")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径")
    args = parser.parse_args()

    cfg = load_config(Path(args.config))
    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    store = Store.load(store_dir, lex)
    print(f"索引已载入：{len(store.chunks)} 块")

    if args.both:
        bench_point("什么是字头？", store, lex, cfg)
        bench_theme("马克思在体系中的位置", store, lex, cfg)
    elif args.question:
        strat = classify_question(args.question, lex)
        print(f"问题类型判定：{strat}")
        if strat == "theme":
            bench_theme(args.question, store, lex, cfg)
        else:
            bench_point(args.question, store, lex, cfg)
    else:
        bench_point("什么是字头？", store, lex, cfg)
        bench_theme("马克思在体系中的位置", store, lex, cfg)


if __name__ == "__main__":
    main()
