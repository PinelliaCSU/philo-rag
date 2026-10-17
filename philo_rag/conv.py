"""会话状态：conversation_id → 最近若干轮 Turn，TTL + 容量双约束。

为什么放进程内存：追问改写只需要**结构化**的上一轮信息（原问题 / 改写后独立问题 /
策略 / 主题 / 要点摘要），不是一整段对话文本。让前端每轮回传，请求体会随答案
（点查询数百字、范围查询数千字）膨胀，还会和流式渲染的竞态纠缠。单用户场景下
内存足够；TTL 到点即丢，丢掉的代价只是追问降级为普通提问（gate 的 fragment 文案）。

线程安全按 lru.py 的教训处理：FastAPI 的同步端点跑在线程池里，get / append 都是
「读时间戳 → 判过期 → 写回」的多步组合，必须整段放进同一把锁，否则并发下会丢轮次。
"""
from __future__ import annotations

import re
import secrets
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

# 正文里的引用标记（[1] / [12]）：摘要是给下一轮读的，标记没有信息量
RE_CITE_MARK = re.compile(r"\[\d+\]")

DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "ttl_sec": 1800,
    "max_turns": 4,
    "digest_chars": 300,
    "max_conversations": 64,
}


@dataclass
class Turn:
    """一轮问答的结构化记录：改写只需要这里的字段，不需要答案全文。"""

    question: str          # 用户原话
    standalone: str        # 改写后的独立问题（= 实际检索用的问题）
    strategy: str          # point | theme（gate / clarify 分支也照记，供下一轮参考）
    topic: str = ""        # theme_topic() 结果（theme 时用于聚合；clarify 时为待澄清主题）
    focus: str | None = None
    digest: str = ""       # 给下一轮的「上一轮要点」≤ digest_chars 字
    ts: float = 0.0


class ConversationStore:
    """conversation_id → [Turn...]，TTL + 容量双约束，单锁保护。"""

    def __init__(self, maxsize: int = 64, ttl_sec: float = 1800.0, max_turns: int = 4) -> None:
        self.maxsize = max(1, int(maxsize))
        self.ttl_sec = max(0.0, float(ttl_sec))   # 允许小数：测试要秒级以内验过期
        self.max_turns = max(1, int(max_turns))
        self._lock = threading.Lock()
        # cid → (最后写入时刻, 轮次列表)；OrderedDict 天然给出 LRU 淘汰顺序
        self._data: OrderedDict[str, tuple[float, list[Turn]]] = OrderedDict()

    def get(self, cid: str | None) -> list[Turn]:
        """取回某会话的轮次（按时间正序）；不存在或已过期返回空列表。"""
        if not cid:
            return []
        with self._lock:
            item = self._data.get(cid)
            if item is None:
                return []
            seen, turns = item
            if time.time() - seen > self.ttl_sec:
                self._data.pop(cid, None)
                return []
            self._data.move_to_end(cid)
            return list(turns)

    def append(self, cid: str, turn: Turn) -> None:
        """追加一轮；单会话只保留最近 max_turns 轮，超容量时淘汰最久未用的会话。"""
        if not cid:
            return
        now = time.time()
        if not turn.ts:
            turn.ts = now
        with self._lock:
            item = self._data.get(cid)
            turns = item[1] if item is not None and now - item[0] <= self.ttl_sec else []
            self._data[cid] = (now, [*turns, turn][-self.max_turns :])
            self._data.move_to_end(cid)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def new_id(self) -> str:
        """新会话标识：12 位十六进制（与 AskRequest 的 32 字上限、字符集约束相容）。"""
        return secrets.token_hex(6)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

def prior_block(digest: str, hint: str) -> str:
    """上一轮要点 + 本轮侧重，准备前置到 context 最前面（模板零改动，见硬约束）。"""
    if not digest and not hint:
        return ""
    parts: list[str] = []
    if digest:
        parts.append("【上一轮已答要点，本轮请勿重复，只做增量】")
        parts.append(digest)
    if hint:
        parts.append(f"【本轮侧重】{hint}")
    return "\n".join(parts)


def with_prior(prior: str, context: str) -> str:
    """把前置块拼进 context：模板里的 {context} 位置不变，因此不会多出占位符。"""
    return f"{prior}\n\n{context}" if prior else context


def settings(cfg: dict[str, Any] | None) -> dict[str, Any]:
    """把 config 的 conversation 段补全成完整阈值（缺省值即 temp.md 的定稿）。"""
    raw = (cfg or {}).get("conversation", {}) or {}
    out: dict[str, Any] = {}
    for key, default in DEFAULTS.items():
        val = raw.get(key, default)
        out[key] = bool(val) if key == "enabled" else int(val)
    return out


# 进程内单例：阈值来自 config，改动则重建（测试要能改 ttl / max_turns）
_CONV: ConversationStore | None = None
_CONV_KEY: tuple[int, float, int] | None = None


def get_store(cfg: dict[str, Any] | None) -> ConversationStore:
    """按 config 的 conversation 段装配进程内单例。"""
    global _CONV, _CONV_KEY
    s = settings(cfg)
    key = (s["max_conversations"], float(s["ttl_sec"]), s["max_turns"])
    if _CONV is None or _CONV_KEY != key:
        _CONV = ConversationStore(maxsize=key[0], ttl_sec=key[1], max_turns=key[2])
        _CONV_KEY = key
    return _CONV


def reset_store() -> None:
    """丢弃单例（测试隔离用）。"""
    global _CONV, _CONV_KEY
    _CONV = None
    _CONV_KEY = None


def _lineage_name(item: Any) -> str:
    """lineage 项在内存里是 (名称, 次数)，过一遍 JSON 后变成列表——两种都认。"""
    if isinstance(item, (list, tuple)):
        return str(item[0]) if item else ""
    return str(item or "")


def _theme_digest(theme: dict[str, Any], chars: int) -> str:
    """范围查询的摘要用结构化字段拼，不取正文。

    范围查询正文开头是「聚合概览」式套话（体系定位、密度分布…），前 300 字信息量很低；
    命中单元 + 共现理论家 + 直接证据块数才是下一轮真正需要的锚点。
    """
    parts: list[str] = []
    units = theme.get("units") or []
    if units:
        heads = [
            f"{u.get('code') or '前言'} {u.get('title') or ''}".strip()
            for u in units[:3]
            if isinstance(u, dict)
        ]
        parts.append("命中单元：" + "、".join(h for h in heads if h))
    lineage = theme.get("lineage") or []
    if lineage:
        parts.append("共现理论家：" + "、".join(n for n in map(_lineage_name, lineage[:5]) if n))
    counts = theme.get("counts") or {}
    if isinstance(counts, dict) and counts.get("direct") is not None:
        parts.append(f"直接证据 {counts['direct']} 块")
    return "；".join(p for p in parts if p)[:chars]


def make_digest(result: dict[str, Any], chars: int = 300) -> str:
    """从一轮结果里抽出给下一轮看的要点（≤ chars 字）。"""
    if str(result.get("strategy") or "") == "theme":
        return _theme_digest(result.get("theme") or {}, chars)
    text = RE_CITE_MARK.sub("", str(result.get("answer") or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:chars]
