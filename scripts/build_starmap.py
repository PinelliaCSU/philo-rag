# -*- coding: utf-8 -*-
"""星图布局构建（维护脚本，不是用户 CLI）。

星图不是「把概念全画出来」，而是一张**稀疏的记忆图**：节点 183 个概念，
边只保留块级共现里最强的那几条。原因见设计文档 §11.1：全量共现图 6316 条边、
平均度 69，四个轴概念度 172–178，一次查询就会点亮半张图。

流程：
    1. 读 store/chunks.jsonl 的块级 concepts（不用 section_concepts：那是推断注解）；
    2. 统计共现，按 PPMI 折算成边权（压掉高频轴概念的普遍共现）；
    3. 排除自环；轴概念（场域论/本体论/认识论/目的论）边权乘 0.4；
    4. 每个节点保留 top-3 强边，度不足 3 的补到至少 1 条，保证图连通可走；
    5. spring_layout（固定 seed=20261018，边权参与），归一化到 [-1,1]；
    6. 写 philo_rag/web/data/starmap.json，带词典指纹与生成时间。

用法：
    python scripts/build_starmap.py
    python scripts/build_starmap.py --config my.yaml --out some.json
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.bootstrap import get_lexicon, load_config  # noqa: E402

SEED = 20261018
TOP_K = 3            # 每个节点保留的强边数
AXIS_DAMPING = 0.4   # 轴概念的边权折扣：它们与几乎所有概念共现，不压就会占满每个节点的 top-3


def _edge_weight(count: int, df_a: int, df_b: int, pairs: int) -> float:
    """PPMI：log( p(a,b) / p(a)p(b) )，负值截零。

    共现次数本身奖励高频概念；PPMI 把「只是因为两边都常见」的那部分减掉，
    留下的是「出现在同一块里」这件事真正异常的组合。
    """
    if count <= 0 or df_a <= 0 or df_b <= 0 or pairs <= 0:
        return 0.0
    pmi = math.log((count / pairs) / ((df_a / pairs) * (df_b / pairs)))
    return max(0.0, pmi)


def _load_chunks(store_dir: Path) -> list[dict[str, Any]]:
    path = store_dir / "chunks.jsonl"
    if not path.exists():
        raise SystemExit(f"索引不存在：{path}\n请先运行：python scripts/build_index.py")
    out: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def _co_occurrence(chunks: list[dict[str, Any]]) -> tuple[Counter, Counter, int]:
    """块级共现统计：df（概念出现在多少块里）与 pairs（概念对出现在多少块里）。"""
    df: Counter = Counter()
    pairs: Counter = Counter()
    for c in chunks:
        names = list(dict.fromkeys(c.get("concepts") or []))
        for n in names:
            df[n] += 1
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                if a != b:                      # 排除自环
                    pairs[(a, b) if a < b else (b, a)] += 1
    return df, pairs, sum(pairs.values())


def _prune(weights: Counter, df: Counter, axes: set[str], keep: int) -> list[dict[str, Any]]:
    """每个节点保留 top-`keep` 强边（无向，按两侧各自的 top-k 取并集）。"""
    adj: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (a, b), w in weights.items():
        if w <= 0:
            continue
        adj[a].append((b, w))
        adj[b].append((a, w))

    kept: dict[tuple[str, str], float] = {}
    for node, neis in adj.items():
        neis.sort(key=lambda kv: (-kv[1], kv[0]))
        for other, w in neis[:keep]:
            key = (node, other) if node < other else (other, node)
            kept[key] = max(kept.get(key, 0.0), w)

    # 孤立/近孤立的节点至少接一条最弱的边，避免星图里出现永远点不亮的漂浮点
    for node in df:
        if any(node in key for key in kept):
            continue
        cands = sorted(adj.get(node, []), key=lambda kv: (-kv[1], kv[0]))
        if cands:
            other, w = cands[0]
            key = (node, other) if node < other else (other, node)
            kept[key] = max(kept.get(key, 0.0), w)

    if not kept:
        return []
    top = max(kept.values()) or 1.0
    return [
        {"source": a, "target": b, "weight": round(w / top, 4)}
        for (a, b), w in sorted(kept.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def _layout(nodes: list[str], edges: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
    """spring 布局（固定 seed）。networkx 缺席时退化为 numpy 版 Fruchterman–Reingold。"""
    try:
        import networkx as nx

        g = nx.Graph()
        g.add_nodes_from(nodes)
        for e in edges:
            g.add_edge(e["source"], e["target"], weight=max(float(e["weight"]), 1e-3))
        pos = nx.spring_layout(g, seed=SEED, weight="weight", iterations=300)
        return {n: (float(xy[0]), float(xy[1])) for n, xy in pos.items()}
    except ImportError:  # pragma: no cover - 本仓库依赖里 networkx 可选
        return _fr_layout(nodes, edges)


def _fr_layout(nodes: list[str], edges: list[dict[str, Any]], iterations: int = 300
               ) -> dict[str, tuple[float, float]]:
    """固定 seed 的 Fruchterman–Reingold：不引网络分析库也能出图。"""
    import numpy as np

    rng = np.random.default_rng(SEED)
    n = len(nodes)
    index = {name: i for i, name in enumerate(nodes)}
    pos = rng.uniform(-1.0, 1.0, size=(n, 2))
    k = math.sqrt(1.0 / max(n, 1))
    pairs = [(index[e["source"]], index[e["target"]], float(e["weight"])) for e in edges]
    temp = 0.1
    for _ in range(iterations):
        disp = np.zeros_like(pos)
        for i in range(n):
            delta = pos[i] - pos
            dist = np.linalg.norm(delta, axis=1) + 1e-9
            force = (k * k / dist) - (dist * dist) / k
            np.fill_diagonal(force, 0.0)
            disp[i] += (delta * (force / dist)[:, None]).sum(axis=0)
        for i, j, w in pairs:
            delta = pos[i] - pos[j]
            dist = np.linalg.norm(delta) + 1e-9
            force = (dist * dist) / k * w
            step = delta / dist * force
            disp[i] -= step
            disp[j] += step
        length = np.linalg.norm(disp, axis=1)[:, None] + 1e-9
        pos += disp / length * np.minimum(length, temp)
        temp *= 0.99
    return {name: (float(pos[i][0]), float(pos[i][1])) for name, i in index.items()}


def _normalize(pos: dict[str, tuple[float, float]]) -> dict[str, tuple[float, float]]:
    """把坐标压进 [-1,1]，保持长宽比（不把星图拉成正方形）。"""
    if not pos:
        return {}
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    span = max(x1 - x0, y1 - y0, 1e-9)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return {n: (round((x - cx) / span * 2, 4), round((y - cy) / span * 2, 4))
            for n, (x, y) in pos.items()}


def build(cfg: dict, out_path: Path) -> dict[str, Any]:
    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    chunks = _load_chunks(store_dir)

    df, pairs, total_pairs = _co_occurrence(chunks)
    axis_names = [str(x.get("name", "")) for x in lex.axes.get("四层", [])]
    axes = set(axis_names)

    weights: Counter = Counter()
    for (a, b), count in pairs.items():
        w = _edge_weight(count, df[a], df[b], total_pairs)
        if a in axes or b in axes:
            w *= AXIS_DAMPING
        if w > 0:
            weights[(a, b)] = w

    edges = _prune(weights, df, axes, TOP_K)
    node_names = sorted(df)
    pos = _normalize(_layout(node_names, edges))

    # 每个概念的年代：它命中块里最常见的 era（概念的年代归属比单个理论家更稳）
    era_votes: dict[str, Counter] = defaultdict(Counter)
    for c in chunks:
        eras = c.get("eras") or []
        if not eras:
            continue
        for n in dict.fromkeys(c.get("concepts") or []):
            era_votes[n].update(eras)

    manifest = json.loads((store_dir / "manifest.json").read_text(encoding="utf-8"))
    hashes = manifest.get("lexicon_hashes") or {}

    nodes = []
    for name in node_names:
        info = lex.concepts.get(name, {})
        school = lex.school_of(str(info.get("philosopher", "")))
        era = era_votes[name].most_common(1)[0][0] if era_votes[name] else ""
        x, y = pos.get(name, (0.0, 0.0))
        nodes.append({
            "id": name,
            "x": x,
            "y": y,
            "hits": int(df[name]),
            "school": school,
            "era": era,
            "aliases": list(info.get("aliases") or []),
        })

    payload = {
        "version": 1,
        "generated_at": datetime.now().replace(microsecond=0).isoformat(),
        "layout": "spring",
        "seed": SEED,
        "lexicon_hashes": {
            "concepts": hashes.get("concepts", ""),
            "philosophers": hashes.get("philosophers", ""),
        },
        "nodes": nodes,
        "edges": edges,
        "axes": axis_names,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return payload


def main() -> None:
    ap = argparse.ArgumentParser(description="生成星图布局 JSON")
    ap.add_argument("--config", default=str(ROOT / "config.yaml"))
    ap.add_argument("--out", default=str(ROOT / "philo_rag" / "web" / "data" / "starmap.json"))
    args = ap.parse_args()

    payload = build(load_config(Path(args.config)), Path(args.out))
    degree = 2 * len(payload["edges"]) / max(len(payload["nodes"]), 1)
    print(f"节点 {len(payload['nodes'])}　边 {len(payload['edges'])}　平均度 {degree:.2f}")
    print(f"已写入 {args.out}")


if __name__ == "__main__":
    main()
