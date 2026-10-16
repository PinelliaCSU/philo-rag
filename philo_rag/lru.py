"""小容量线程安全 LRU 缓存。

为什么需要它：Web 服务（FastAPI 的同步端点）在线程池里并发执行，而
`OrderedDict` 的 `move_to_end()` / `popitem()` 是多个步骤的组合，并发下可能交错
执行，留下被破坏的缓存状态（键存在但顺序错乱，极端情况下 `popitem` 抛
`KeyError`）。把读写放进同一把锁即可消除这一整类竞态：容量只有几十到几百，
单次操作 O(1)，锁本身不是瓶颈。

约定：命中后返回的是**共享对象**，调用方只读使用，不要原地修改。
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any, Hashable


class LruCache:
    """最近最少使用缓存：`get` 未命中返回 None，`put` 超容时淘汰最旧项。"""

    def __init__(self, maxsize: int) -> None:
        self.maxsize = max(1, int(maxsize))
        self._lock = threading.Lock()
        self._data: OrderedDict[Hashable, Any] = OrderedDict()

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            if key not in self._data:
                return None
            self._data.move_to_end(key)
            return self._data[key]

    def put(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)
