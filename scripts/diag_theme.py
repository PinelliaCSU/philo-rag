"""诊断：主题集中度与召回覆盖。

对一个「主题型问题」，量化当前问答链路的产出与语料中该主题的真实分布之差：
  1. top-k 命中块的单元/卷分布（主题集中度）
  2. 语料中该主题相关块的总量与分布（召回上限）
  3. top-k 对相关块的召回率（覆盖度）
  4. 证据句长度与信息量（提炼深度）
"""
from __future__ import annotations

import collections
import sys
from pathlib import Path

sys.path.insert(0, ".")

from philo_rag.answer_evidence import _topic_evidence, build_context
from philo_rag.cli import load_config, open_store
from philo_rag.retrieve import hybrid_search

CASES = [
    ("精神分析在书里是怎么被处理的？", ["精神分析"]),
    ("德国观念论在书里是怎么被处理的？", ["德国观念论"]),
    ("结构主义在书里是怎么被处理的？", ["结构主义"]),
    ("后结构主义在书里是怎么被处理的？", ["后结构主义"]),
    ("存在主义在书里是怎么被处理的？", ["存在主义"]),
    ("法兰克福学派在书里是怎么被处理的？", ["法兰克福学派"]),
    ("现象学在书里是怎么被处理的？", ["现象学"]),
    ("实用主义在书里是怎么被处理的？", ["实用主义"]),
    ("分析哲学在书里是怎么被处理的？", ["分析哲学"]),
]


def main() -> None:
    cfg = load_config(Path("config.yaml"))
    store, lex = open_store(cfg)
    print(f"语料总块数 {len(store.chunks)}  final_top_k={cfg['retrieval']['final_top_k']}\n")

    for question, keys in CASES:
        hits = hybrid_search(store, question, cfg, lex)
        doc_title = store.manifest.get("doc_title", "")

        # 语料中真正「相关」的块：元数据命中关键词 + 主题层锚点（流派/思潮级）
        anchor_phils: list[str] = []
        anchor_concs: list[str] = []
        anchor_units: list[str] = []
        for key in keys:
            tp, tc, tu = lex.theme_anchors(key)
            anchor_phils.extend(tp)
            anchor_concs.extend(tc)
            anchor_units.extend(tu)
        related_keys = list(dict.fromkeys([*keys, *anchor_phils, *anchor_concs]))
        related = [
            c for c in store.chunks
            if any(k in c.philosophers or k in c.concepts for k in related_keys)
            or (anchor_units and any(u in c.unit_codes() for u in anchor_units))
        ]

        print("=" * 78)
        print(f"Q: {question}")
        print(f"  语料相关块总数 {len(related)}   （占全库 {len(related)/len(store.chunks):.1%}）")
        if related:
            ru = collections.Counter(c.unit_code() for c in related)
            print(f"  相关块分布 top-8 单元: {ru.most_common(8)}")
            print(f"  相关块覆盖卷数: {len({c.volume() for c in related})}")

        units = [h["chunk"].unit_code() for h in hits]
        vols = [h["chunk"].volume() for h in hits]
        seqs = [h["chunk"].seq for h in hits]
        types = collections.Counter(h["chunk"].chunk_type for h in hits)
        print(f"  top-{len(hits)} 命中单元: {units}")
        print(f"  top-{len(hits)} 覆盖卷数: {len(set(vols))}  {sorted(set(vols))}")
        print(f"  top-{len(hits)} 块类型: {dict(types)}")
        print(f"  top-{len(hits)} 块序: {sorted(seqs)}   跨度 {max(seqs)-min(seqs)}")

        # 相邻性：命中块里有多少与另一个命中块在原文相邻（同一单元/序接近）
        adj = sum(
            1 for i, s in enumerate(sorted(seqs))
            if i and s - sorted(seqs)[i - 1] <= 3
        )
        print(f"  相邻命中块数（seq 差≤3）: {adj}/{len(seqs)}")

        # 证据句
        ev = _topic_evidence(question, hits, lex, limit=8)
        print(f"  证据句 {len(ev)} 条，角色分布 {dict(collections.Counter(e['role'] for e in ev))}")
        print(f"  证据句平均长度 {sum(len(e['evidence']) for e in ev)//max(len(ev),1)} 字")
        print(f"  上下文总长 {len(build_context(hits, doc_title))} 字")
        print()


if __name__ == "__main__":
    main()
