"""对比：点式问答（ask）vs 专题综合（theme）vs 专题提炼稿（人工全量）。

输出一张可直接写进报告的指标表。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, ".")

from philo_rag.answer import answer as ask_fn
from philo_rag.answer_evidence import _topic_evidence, build_context
from philo_rag.answer_theme import theme_answer
from philo_rag.cli import load_config, open_store
from philo_rag.retrieve import hybrid_search

CASES = ["马克思", "黑格尔", "精神分析", "拉康", "辩证法"]


def main() -> None:
    cfg = load_config(Path("config.yaml"))
    store, lex = open_store(cfg)
    doc_title = store.manifest.get("doc_title", "")
    n_all = len(store.chunks)
    print(f"语料 {n_all} 块\n")

    hdr = f"{'主题':<8}{'ask召回':>8}{'ask单元':>8}{'ask卷':>6}{'ask相邻':>8}{'ask上下文':>10}  |{'theme召回':>10}{'theme单元':>10}{'theme卷':>8}{'theme上下文':>12}{'theme输出':>10}"
    print(hdr)
    print("-" * len(hdr))

    for topic in CASES:
        # ---- ask ----
        a = ask_fn(store, lex, f"{topic}在书里是怎么论述的？", cfg)
        hits = hybrid_search(store, f"{topic}在书里是怎么论述的？", cfg, lex,
                             top_k=int(cfg["answer"].get("candidate_chunks", 20)))
        ev = _topic_evidence(f"{topic}在书里是怎么论述的？", hits, lex, limit=8)
        units_a = {h["chunk"].unit_code() for h in hits}
        vols_a = {h["chunk"].volume() for h in hits}
        seqs = sorted(h["chunk"].seq for h in hits)
        adj = sum(1 for i, s in enumerate(seqs) if i and s - seqs[i - 1] <= 3)
        ctx_a = len(build_context(hits, doc_title))

        # ---- theme ----
        t = theme_answer(store, lex, topic, cfg)
        c = t["theme"]["counts"]
        units_t = c["unit_total"]
        vols_t = len({u["volume"] for u in t["theme"]["units"] if u["volume"]})

        print(f"{topic:<8}{len(hits):>8}{len(units_a):>8}{len(vols_a):>6}{adj:>8}{ctx_a:>10}  |"
              f"{c['direct']:>10}{units_t:>10}{vols_t:>8}{len(t.get('answer','')) and '' or ''}"
              f"{'':>12}{len(t['answer']):>10}")

    # 详细一例
    print("\n" + "=" * 78)
    print("明细：马克思")
    q = "马克思在主义主义体系中的位置是什么？"
    a = ask_fn(store, lex, q, cfg)
    ev = _topic_evidence(q, hybrid_search(store, q, cfg, lex, top_k=20), lex, limit=8)
    print(f"[ask] 回答 {len(a['answer'])} 字；证据 {len(ev)} 条，"
          f"平均 {sum(len(e['evidence']) for e in ev)//max(len(ev),1)} 字"
          f"（块平均 {store.manifest['avg_chunk_chars']} 字 → 利用率 "
          f"{sum(len(e['evidence']) for e in ev)/max(sum(len(e['chunk'].text) for e in ev),1):.0%}）")
    t = theme_answer(store, lex, "马克思", cfg)
    print(f"[theme] 输出 {len(t['answer'])} 字；聚合 {t['theme']['counts']['direct']} 块、"
          f"{t['theme']['counts']['unit_total']} 单元；上下文 {len(t['answer'])} 字（离线）/ "
          f"喂 LLM 的上下文更长")
    print("[theme] 核心单元密度：" + "　".join(
        f"{u['code']} {u['hits']}/{u['total']}" for u in t["theme"]["units"][:6]))


if __name__ == "__main__":
    main()
