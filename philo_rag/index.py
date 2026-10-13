"""索引层：稠密向量索引 + BM25 稀疏索引 + 术语倒排 + 元数据倒排。

存储格式（store/ 目录，全部为可读文件，便于人工核对与增量更新）：
  chunks.jsonl    每个知识块一行（含全部元数据）
  vectors.npy     与 chunks 行序对齐的稠密向量
  terms.json      概念 / 哲学家 / 年代 / 流派 → chunk_id 倒排表
  manifest.json   构建信息（doc_id、标题、嵌入后端、块数、构建时间）
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from rank_bm25 import BM25Okapi

from .embed import get_embedder
from .ingest import build_document
from .lexicon import Lexicon
from .schema import Chunk


def tokenize(text: str) -> list[str]:
    """检索用分词：jieba 切词，保留中文单字以提升召回。"""
    import jieba

    out: list[str] = []
    for tok in jieba.lcut(text):
        tok = tok.strip().lower()
        if not tok:
            continue
        if not any(ch.isalnum() for ch in tok):
            continue
        out.append(tok)
    return out


class Store:
    def __init__(self) -> None:
        self.chunks: list[Chunk] = []
        self.vectors: np.ndarray | None = None
        self.tokenized: list[list[str]] = []
        self.bm25: BM25Okapi | None = None
        self.enrich: bool = True
        self.terms: dict[str, dict[str, list[str]]] = {
            "concept": {},
            "philosopher": {},
            "era": {},
            "school": {},
            "unit": {},
            "volume": {},
        }
        self.manifest: dict[str, Any] = {}

    def _index_texts(self) -> list[str]:
        """进入向量/BM25 的文本：默认把章节路径与元数据标签一并编码。"""
        return [c.embed_text() if self.enrich else c.text for c in self.chunks]

    # ---------------- 构建 ----------------

    @classmethod
    def build(cls, cfg: dict[str, Any], lex: Lexicon) -> "Store":
        st = cls()
        doc_cfg = cfg["doc"]
        source = Path(doc_cfg["source"])
        if not source.exists():
            raise SystemExit(
                f"清洗后的语料不存在：{source}\n"
                f"请先运行：python -m philo_rag.cli prepare"
            )
        chunks, title = build_document(source, doc_cfg["id"], lex, cfg["chunk"])
        st.chunks = chunks
        st.enrich = bool(cfg["chunk"].get("enrich_embed_text", True))

        embedder = get_embedder(cfg["embedding"], cfg.get("_root"))
        st.vectors = embedder.encode(st._index_texts())
        st._build_lexical(lex)

        st.manifest = {
            "doc_id": doc_cfg["id"],
            "doc_title": doc_cfg.get("title") or title,
            "source": str(source),
            "chunk_count": len(chunks),
            "quote_count": sum(1 for c in chunks if c.chunk_type == "quote"),
            "footnote_count": sum(1 for c in chunks if c.chunk_type == "footnote"),
            "avg_chunk_chars": round(sum(c.char_len for c in chunks) / max(len(chunks), 1), 1),
            "unit_count": len({code for c in chunks for code in c.unit_codes()}),
            "embedding_backend": cfg["embedding"]["backend"],
            "embedding_model": cfg["embedding"].get("model", ""),
            "vector_dim": int(st.vectors.shape[1]),
            "enrich_embed_text": st.enrich,
            "built_at": datetime.now().isoformat(timespec="seconds"),
        }
        return st

    def _build_lexical(self, lex: Lexicon) -> None:
        self.tokenized = [tokenize(t) for t in self._index_texts()]
        self.bm25 = BM25Okapi(self.tokenized) if self.tokenized else None

        terms: dict[str, dict[str, list[str]]] = {
            "concept": {},
            "philosopher": {},
            "era": {},
            "school": {},
            "unit": {},
            "volume": {},
        }
        for c in self.chunks:
            for p in c.philosophers:
                terms["philosopher"].setdefault(p, []).append(c.chunk_id)
                school = lex.school_of(p)
                if school:
                    terms["school"].setdefault(school, []).append(c.chunk_id)
            for concept in c.concepts:
                terms["concept"].setdefault(concept, []).append(c.chunk_id)
            for era in c.eras:
                terms["era"].setdefault(era, []).append(c.chunk_id)
            # 体系结构：数值单元（含全部上位单元）与卷
            for code in c.unit_codes():
                terms["unit"].setdefault(code, []).append(c.chunk_id)
            vol = c.volume()
            if vol:
                terms["volume"].setdefault(vol, []).append(c.chunk_id)
        self.terms = terms

    # ---------------- 持久化 ----------------

    def save(self, store_dir: Path) -> None:
        store_dir.mkdir(parents=True, exist_ok=True)
        with open(store_dir / "chunks.jsonl", "w", encoding="utf-8") as f:
            for c in self.chunks:
                f.write(json.dumps(c.to_dict(), ensure_ascii=False) + "\n")
        np.save(store_dir / "vectors.npy", self.vectors)
        with open(store_dir / "terms.json", "w", encoding="utf-8") as f:
            json.dump(self.terms, f, ensure_ascii=False, indent=1)
        with open(store_dir / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(self.manifest, f, ensure_ascii=False, indent=1)

    @classmethod
    def load(cls, store_dir: Path, lex: Lexicon) -> "Store":
        st = cls()
        with open(store_dir / "chunks.jsonl", encoding="utf-8") as f:
            st.chunks = [Chunk.from_dict(json.loads(line)) for line in f if line.strip()]
        st.vectors = np.load(store_dir / "vectors.npy")
        with open(store_dir / "terms.json", encoding="utf-8") as f:
            st.terms = json.load(f)
        with open(store_dir / "manifest.json", encoding="utf-8") as f:
            st.manifest = json.load(f)
        st.enrich = bool(st.manifest.get("enrich_embed_text", True))
        st._build_lexical(lex)
        return st

    # ---------------- 过滤 ----------------

    def filter_ids(
        self,
        philosophers: list[str] | None = None,
        era: str | None = None,
        concept: str | None = None,
        school: str | None = None,
        chunk_type: str | None = None,
        unit: str | None = None,
        volume: str | None = None,
    ) -> set[str] | None:
        """按元数据取交集，返回允许的 chunk_id 集合；无过滤条件时返回 None。"""
        sets: list[set[str]] = []

        if philosophers:
            s: set[str] = set()
            for p in philosophers:
                s |= set(self.terms["philosopher"].get(p, []))
            sets.append(s)
        if era:
            sets.append(set(self.terms["era"].get(era, [])))
        if concept:
            sets.append(set(self.terms["concept"].get(concept, [])))
        if school:
            sets.append(set(self.terms["school"].get(school, [])))
        if unit:
            # 支持字头（"1"）与任意层级编号（"1-1-1"）
            sets.append(set(self.terms["unit"].get(unit, [])))
        if volume:
            sets.append(set(self.terms["volume"].get(volume, [])))
        if chunk_type:
            sets.append({c.chunk_id for c in self.chunks if c.chunk_type == chunk_type})

        if not sets:
            return None
        out = sets[0]
        for s in sets[1:]:
            out &= s
        return out

    def by_id(self, chunk_id: str) -> Chunk | None:
        for c in self.chunks:
            if c.chunk_id == chunk_id:
                return c
        return None

    def quotes(self) -> list[Chunk]:
        return [c for c in self.chunks if c.chunk_type == "quote"]
