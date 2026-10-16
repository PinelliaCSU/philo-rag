"""重排层（交叉编码器，可选）：本地路径解析 + 实例缓存 + 离线护栏。

`hybrid_search` 融合完两路召回后调用 `_rerank`，只对前 window 个候选打分——
重排是提精的**可选**环节，模型目录缺失、依赖未装或加载失败时一律静默退回融合结果，
绝不因为环境缺件而中断检索链路，也绝不在离线部署下触发联网下载。
"""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Any

import numpy as np

# --------------------------------------------------------------------------- #
# 重排器（交叉编码器，可选）：本地路径解析 + 实例缓存 + 离线护栏
# --------------------------------------------------------------------------- #
_RERANK_CACHE: dict[tuple[str, str], Any] = {}

# 重排输入默认截断长度：交叉编码器的耗时与输入长度成正比，见 _rerank 的说明。
DEFAULT_RERANK_MAX_CHARS = 320

# 「问题 + 候选块 → 分数」的 LRU。同一问题重复提问（界面卡片联动、复看、对比）
# 不该再算一遍重排——那是每次提问里最贵的一步。
_RERANK_SCORE_CACHE: OrderedDict[tuple, list[float]] = OrderedDict()
_RERANK_SCORE_CACHE_MAX = 256


def _resolve_model_path(model: str, root: str | Path | None) -> str:
    """把模型名解析为本地路径（与嵌入层一致）。

    `rerank_model` 推荐写成 `models/bge-reranker-v2-m3` 这类随项目分发的相对路径；
    相对路径相对项目根（`cfg["_root"]`）解析。绝对路径或远程 repo id 原样返回，
    供有网环境直接按 HuggingFace 名称加载。
    """
    if not root or not model:
        return model
    p = Path(model)
    if not p.is_absolute() and (Path(root) / p).exists():
        return str(Path(root) / p)
    return model


def _load_reranker(cfg: dict[str, Any]) -> Any | None:
    """按配置加载交叉编码器，带实例缓存与离线护栏。

    - 只加载一次，之后复用（CrossEncoder 冷启动较贵，服务化场景每查重建会拖慢响应）；
    - 模型目录不存在时直接判不可用并**负面缓存**，绝不触发联网下载——离线部署下
      下载会挂起或抛网络异常，且每次查询反复尝试会雪上加霜；
    - 加载失败同样退回 None（由调用方回到融合结果），只告警不中断链路。
    """
    r_cfg = cfg.get("retrieval", {}) or {}
    model = str(r_cfg.get("rerank_model", "models/bge-reranker-v2-m3"))
    resolved = _resolve_model_path(model, cfg.get("_root"))
    key = ("reranker", resolved)
    if key in _RERANK_CACHE:
        return _RERANK_CACHE[key]  # 可能是 None（负面缓存）

    if not Path(resolved).exists():
        print(f"[warn] 重排模型不可用（{resolved} 不存在），已退回融合结果。"
              f"下载后放入该目录，或改 retrieval.rerank_model。")
        _RERANK_CACHE[key] = None
        return None

    try:
        from sentence_transformers import CrossEncoder

        # max_length 与 rerank_max_chars(256) 对齐：输入已截断到 256 字符，
        # 默认 max_length=512 会导致 padding 浪费计算。设 256 不改变打分结果。
        ce = CrossEncoder(resolved, max_length=256)
        _RERANK_CACHE[key] = ce
        return ce
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] 重排器加载失败，已退回融合结果：{exc}")
        _RERANK_CACHE[key] = None
        return None


def _clip_chunk_text(text: str, limit: int) -> str:
    """重排输入只取块首 `limit` 个字符（`limit <= 0` 表示不截断）。

    交叉编码器的耗时随输入长度线性增长，而块首通常就是该块的论点句，
    截断能省下大半打分时间。尽量切在句末，别把句子劈成半截。
    """
    if limit <= 0 or len(text) <= limit:
        return text
    window = text[:limit]
    cut = max(window.rfind(mark) for mark in "。；！？")
    return window[: cut + 1] if cut >= limit // 2 else window


def _rerank(
    results: list[dict[str, Any]],
    query: str,
    cfg: dict[str, Any],
    window: int = 12,
) -> list[dict[str, Any]]:
    """交叉编码器重排（可选）。模型不可用时静默退回融合结果。

    只对前 `window` 个融合候选打分并重排，其余保持原序接在末尾——
    最终输出仍由调用方截断为 top_k。窗口内的候选才有机会被提进 top_k，
    因此窗口应大于 top_k（默认 12 对 8，留 1.5 倍余量）。

    每次提问的延迟几乎全在这一步（CPU 上 bge-reranker-v2-m3 约 0.6 s/对/500 字，
    16 对就是 10 秒以上），所以打两处折扣：
      * 打分文本截到 `rerank_max_chars`（见 _clip_chunk_text）；
      * 同一「问题 + 候选块」的结果进 LRU，重复提问直接复用，不再过模型。
    """
    ce = _load_reranker(cfg)
    if ce is None:
        return results
    head = results[:window]
    tail = results[window:]
    if not head:
        return results

    r_cfg = cfg.get("retrieval", {}) or {}
    max_chars = int(r_cfg.get("rerank_max_chars", DEFAULT_RERANK_MAX_CHARS))
    key = (
        str(cfg.get("_root", "")),
        str(r_cfg.get("rerank_model", "")),
        window,
        max_chars,
        query,
        tuple(r["chunk"].chunk_id for r in head),
    )
    scores = _RERANK_SCORE_CACHE.get(key)
    if scores is None:
        pairs = [(query, _clip_chunk_text(r["chunk"].text, max_chars)) for r in head]
        raw = ce.predict(pairs, batch_size=len(pairs))
        if not isinstance(raw, (list, np.ndarray)):
            raw = [raw]
        scores = [float(s) for s in raw]
        _RERANK_SCORE_CACHE[key] = scores
        while len(_RERANK_SCORE_CACHE) > _RERANK_SCORE_CACHE_MAX:
            _RERANK_SCORE_CACHE.popitem(last=False)
    else:
        _RERANK_SCORE_CACHE.move_to_end(key)

    for r, s in zip(head, scores):
        r["rerank_score"] = s
    head.sort(key=lambda r: -r["rerank_score"])
    return head + tail
