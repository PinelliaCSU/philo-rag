"""嵌入层：可插拔的向量化后端。

三个后端共用同一接口 encode(texts) -> (n, dim) float32（已 L2 归一化）：
  * HashingEmbedder            —— 纯 numpy 特征哈希，离线可跑，用于开发与自检
  * SentenceTransformerEmbedder —— BGE-M3 / bge-large-zh，本地生产环境首选
  * APIEmbedder                —— 任意 OpenAI 兼容 /embeddings 接口
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

RE_CJK = re.compile(r"[\u4e00-\u9fff]+")
RE_WORD = re.compile(r"[a-z0-9]+")


def _cjk_tokens(run: str) -> list[str]:
    import jieba

    return [t for t in jieba.lcut(run) if len(t) >= 2]


class BaseEmbedder:
    dim: int = 0

    def encode(self, texts: list[str]) -> np.ndarray:  # pragma: no cover - 接口
        raise NotImplementedError


class HashingEmbedder(BaseEmbedder):
    """特征哈希：中文字符二元组 + jieba 词 + 英文词，带符号哈希投影到固定维度。

    优点：零模型下载、零网络依赖、可复现。
    缺点：只有词法相似度，无语义泛化 —— 仅用于打通链路与回归测试。
    """

    def __init__(self, dim: int = 512) -> None:
        self.dim = dim

    def _features(self, text: str) -> list[str]:
        low = text.lower()
        feats = ["w:" + w for w in RE_WORD.findall(low) if len(w) > 1]
        for run in RE_CJK.findall(text):
            feats.extend("t:" + t for t in _cjk_tokens(run))
            feats.extend("b:" + run[i : i + 2] for i in range(len(run) - 1))
        return feats

    def encode(self, texts: list[str]) -> np.ndarray:
        mat = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row, text in enumerate(texts):
            counts: dict[str, int] = {}
            for f in self._features(text):
                counts[f] = counts.get(f, 0) + 1
            for feat, tf in counts.items():
                digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
                v = int.from_bytes(digest, "big")
                idx = v % self.dim
                sign = 1.0 if (v >> 63) & 1 == 0 else -1.0
                mat[row, idx] += sign * (1.0 + np.log(tf))
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms


class SentenceTransformerEmbedder(BaseEmbedder):
    """本地语义向量（推荐 BAAI/bge-small-zh-v1.5，中文、轻量、512 维）。

    model 可以是 HuggingFace 名称（需联网/缓存），也可以是本地目录（推荐，
    项目内 `models/` 下已自带一份，保证离线可用）。
    """

    def __init__(self, model: str, batch_size: int = 32, device: str = "cpu") -> None:
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model, device=device)
        self.dim = int(self.model.get_sentence_embedding_dimension())
        self.batch_size = batch_size

    def encode(self, texts: list[str]) -> np.ndarray:
        vecs = self.model.encode(
            texts,
            batch_size=self.batch_size,
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 200,
        )
        return np.asarray(vecs, dtype=np.float32)


class APIEmbedder(BaseEmbedder):
    """任意 OpenAI 兼容 /embeddings 接口。"""

    def __init__(self, model: str, base: str, key: str, batch_size: int = 32) -> None:
        if not base:
            raise ValueError("embedding.api_base 未配置")
        self.model = model
        self.base = base.rstrip("/")
        self.key = key
        self.batch_size = batch_size
        self.dim = 0

    def _call(self, batch: list[str]) -> list[list[float]]:
        payload = json.dumps({"model": self.model, "input": batch}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}/embeddings",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.key}"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return [item["embedding"] for item in data["data"]]

    def encode(self, texts: list[str]) -> np.ndarray:
        out: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            out.extend(self._call(texts[i : i + self.batch_size]))
        mat = np.asarray(out, dtype=np.float32)
        self.dim = mat.shape[1]
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms


_CACHE: dict[tuple, BaseEmbedder] = {}


def _cache_key(cfg: dict[str, Any], root: str | Path | None) -> tuple:
    return (
        cfg.get("backend", "hashing"),
        str(cfg.get("model", "")),
        int(cfg.get("dim", 512)),
        int(cfg.get("batch_size", 32)),
        str(cfg.get("device", "cpu")),
        str(cfg.get("api_base", "")),
        str(root or ""),
    )


def get_embedder(cfg: dict[str, Any], root: str | Path | None = None) -> BaseEmbedder:
    """按配置构造嵌入后端（带缓存）。

    模型加载很贵（bge-small 冷启动约 20 秒），服务化场景下每次查询都重建会直接
    拖垮响应时间，因此按配置指纹缓存实例。

    model 为相对路径时相对 root（项目根）解析，便于把模型随项目一起分发。
    """
    key = _cache_key(cfg, root)
    if key in _CACHE:
        return _CACHE[key]

    backend = cfg.get("backend", "hashing")
    if backend == "hashing":
        emb: BaseEmbedder = HashingEmbedder(dim=int(cfg.get("dim", 512)))
    elif backend == "sentence_transformer":
        model = str(cfg["model"])
        if root is not None:
            p = Path(model)
            if not p.is_absolute() and (Path(root) / p).exists():
                model = str(Path(root) / p)
        emb = SentenceTransformerEmbedder(
            model,
            int(cfg.get("batch_size", 32)),
            str(cfg.get("device", "cpu")),
        )
    elif backend == "api":
        emb = APIEmbedder(
            cfg["model"], cfg.get("api_base", ""), cfg.get("api_key", ""),
            int(cfg.get("batch_size", 32)),
        )
    else:
        raise ValueError(f"未知 embedding.backend：{backend}")

    _CACHE[key] = emb
    return emb
