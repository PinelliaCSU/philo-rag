"""只测本地检索链路（不含LLM），排除网络波动影响。"""
from __future__ import annotations

import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from philo_rag.cli import get_lexicon, load_config
from philo_rag.index import Store
from philo_rag.theme import theme_search
from philo_rag.retrieve import hybrid_search


def main():
    cfg = load_config(Path("config.yaml"))
    lex = get_lexicon(cfg)
    store = Store.load(Path(cfg["doc"]["store_dir"]), lex)
    print(f"索引已载入：{len(store.chunks)} 块\n")

    # 点查询：hybrid_search（含重排）
    print("=== 点查询 hybrid_search（含重排）===")
    for q in ["什么是字头？", "大他者是什么意思？", "黑格尔的辩证法"]:
        t0 = time.perf_counter()
        hits = hybrid_search(store, q, cfg, lex, top_k=8)
        t1 = time.perf_counter()
        print(f"  {q:20s}  {(t1-t0)*1000:.0f}ms  ({len(hits)} hits)")

    # 范围查询：theme_search（不含LLM）
    print("\n=== 范围查询 theme_search（不含LLM）===")
    for q in ["马克思", "精神分析", "康德"]:
        t0 = time.perf_counter()
        res = theme_search(store, lex, q, cfg)
        t1 = time.perf_counter()
        ctx_chars = res["context_chars"]
        print(f"  {q:20s}  {(t1-t0)*1000:.0f}ms  (context={ctx_chars}字)")

    # 再次测点查询（warm，排除冷启动）
    print("\n=== 点查询 hybrid_search（warm，第2次）===")
    for q in ["什么是字头？", "大他者是什么意思？", "黑格尔的辩证法"]:
        t0 = time.perf_counter()
        hits = hybrid_search(store, q, cfg, lex, top_k=8)
        t1 = time.perf_counter()
        print(f"  {q:20s}  {(t1-t0)*1000:.0f}ms")

    # 再次测范围查询（warm）
    print("\n=== 范围查询 theme_search（warm，第2次）===")
    for q in ["马克思", "精神分析", "康德"]:
        t0 = time.perf_counter()
        res = theme_search(store, lex, q, cfg)
        t1 = time.perf_counter()
        ctx_chars = res["context_chars"]
        print(f"  {q:20s}  {(t1-t0)*1000:.0f}ms  (context={ctx_chars}字)")


if __name__ == "__main__":
    main()
