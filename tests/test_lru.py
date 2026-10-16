"""线程安全 LRU（philo_rag/lru.py）：淘汰顺序与并发写入。

服务端同步端点跑在线程池里，裸 OrderedDict 的 `move_to_end` + `popitem` 组合
在并发下不满足「要么全做、要么不做」；这里同时固定功能契约与容量上限。
"""
from __future__ import annotations

import threading

from philo_rag.lru import LruCache


def test_get_promotes_and_eviction_is_lru():
    cache = LruCache(2)
    cache.put("a", 1)
    cache.put("b", 2)
    assert cache.get("a") == 1          # 命中会把 a 提到最近使用
    cache.put("c", 3)                   # 淘汰最久未用的 b
    assert cache.get("b") is None
    assert cache.get("a") == 1
    assert cache.get("c") == 3
    assert len(cache) == 2


def test_missing_key_returns_none_and_clear_empties():
    cache = LruCache(1)
    assert cache.get("nope") is None
    cache.put("k", 1)
    cache.clear()
    assert len(cache) == 0


def test_concurrent_writes_keep_capacity_bound():
    cache = LruCache(8)

    def worker(base: int) -> None:
        for i in range(200):
            cache.put(f"{base}-{i}", i)
            cache.get("1-0")

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(cache) <= 8
