"""索引层：稠密向量索引 + BM25 稀疏索引 + 术语倒排 + 元数据倒排。

存储格式（store/ 目录，全部为可读文件，便于人工核对与增量更新）：
  chunks.jsonl    每个知识块一行（含全部元数据）
  vectors.npy     与 chunks 行序对齐的稠密向量
  terms.json      概念 / 哲学家 / 年代 / 流派 / 坐标 → chunk_id 倒排表
  manifest.json   构建信息（doc_id、标题、嵌入后端、块数、注解版本、构建时间、
                  **分块参数与词典文件指纹**）
"""
from __future__ import annotations

import hashlib
import json
import sys
import threading
from array import array
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from rank_bm25 import BM25Okapi

from .embed import get_embedder
from .ingest import build_document
from .lexicon import Lexicon
from .schema import Chunk

# 注解结构版本：坐标（coords）/章节级注解（section_*）/别名守卫（lexicon guard）。
# 旧索引缺这些字段时提示重建——注解变了而索引没重建，检索结果会与词典对不上。
ANNOTATION_VERSION = 2


# --------------------------------------------------------------------------- #
# 索引指纹：分块参数 + 词典文件内容
#
# 与注解版本一样，这两类输入变了而索引没重建，检索结果就会与配置/词典对不上，
# 但旧行为是**静默**的（只有注解版本有提示）。指纹把这类隐性不一致变成启动告警。
# --------------------------------------------------------------------------- #
_CHUNK_PARAM_KEYS = (
    "max_chars",
    "min_chars",
    "overlap_chars",
    "split_quotes",
    "quote_min_chars",
    "quote_min_chars_reliable",
    "keep_footnotes",
    "enrich_embed_text",
    "embed_tags_max",
)


def _sha16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def chunk_params(cfg: dict[str, Any]) -> dict[str, Any]:
    """参与分块结果的配置子集（按固定键序取值，保证指纹可复现）。"""
    c = (cfg or {}).get("chunk", {}) or {}
    return {k: c.get(k) for k in _CHUNK_PARAM_KEYS}


def lexicon_hashes(lex: Lexicon) -> dict[str, str]:
    """词典文件内容指纹：文件名 → hash（文件缺失则跳过）。"""
    out: dict[str, str] = {}
    for name, path in sorted((getattr(lex, "sources", None) or {}).items()):
        p = Path(path)
        if p.exists():
            out[name] = _sha16(p.read_text(encoding="utf-8", errors="replace"))
    return out


def manifest_drift(manifest: dict[str, Any], cfg: dict[str, Any], lex: Lexicon) -> list[str]:
    """比对索引 manifest 与当前配置/词典，返回不一致清单（空列表 = 一致）。"""
    problems: list[str] = []

    built_params = manifest.get("chunk_params")
    if built_params is None:
        problems.append("manifest 缺少分块参数指纹（旧索引），无法校验分块设置是否已变更")
    else:
        now = chunk_params(cfg)
        diff = {k: (built_params.get(k), now.get(k)) for k in now if built_params.get(k) != now.get(k)}
        if diff:
            detail = "；".join(f"{k}: 建索引时 {a!r} → 当前 {b!r}" for k, (a, b) in diff.items())
            problems.append(f"分块参数已变更（检索结果可能已与索引不一致）：{detail}")

    built_lex = manifest.get("lexicon_hashes")
    now_lex = lexicon_hashes(lex)
    if built_lex is None:
        problems.append("manifest 缺少词典指纹（旧索引），无法校验词典是否已更新")
    else:
        changed = sorted(k for k in {**built_lex, **now_lex} if built_lex.get(k) != now_lex.get(k))
        if changed:
            problems.append("词典文件已变更（元数据可能已与索引不一致）：" + "、".join(changed))

    return problems



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
        self.tags_max: int = 0
        # 块类型倒排：在构建期一次遍历得到，替代请求期的「按类型过滤」全库扫描
        self.type_ids: dict[str, list[int]] = {}
        # 字符倒排（懒构建）：把「正文包含某词」的判定从全库扫描收敛成候选集 + 验证
        self._literal: dict[str, array] | None = None
        self._literal_lock = threading.Lock()
        # chunk_id → 下标：按 id 取块不再线性扫描
        self._id_pos: dict[str, int] = {}
        self.terms: dict[str, dict[str, list[str]]] = {
            "concept": {},
            "philosopher": {},
            "era": {},
            "school": {},
            "unit": {},
            "volume": {},
            "axis": {},
            "section_concept": {},
            "section_philosopher": {},
        }
        self.manifest: dict[str, Any] = {}

    def _index_texts(self) -> list[str]:
        """进入向量/BM25 的文本：默认把章节路径、坐标与元数据标签一并编码。"""
        return [c.embed_text(self.tags_max) if self.enrich else c.text for c in self.chunks]

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
        st.tags_max = int(cfg["chunk"].get("embed_tags_max", 0))

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
            "embed_tags_max": st.tags_max,
            "chunk_params": chunk_params(cfg),
            "lexicon_hashes": lexicon_hashes(lex),
            "annotation_version": ANNOTATION_VERSION,
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
            "axis": {},
            "section_concept": {},
            "section_philosopher": {},
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
            # 体系结构：数值单元（含全部上位单元）、卷、四层坐标
            for code in c.unit_codes():
                terms["unit"].setdefault(code, []).append(c.chunk_id)
            vol = c.volume()
            if vol:
                terms["volume"].setdefault(vol, []).append(c.chunk_id)
            for coord in c.coords:
                terms["axis"].setdefault(coord, []).append(c.chunk_id)
            # 章节级（推断）注解：与块级注解分表存放，检索侧可区别加权
            for t in c.section_concepts:
                terms["section_concept"].setdefault(t, []).append(c.chunk_id)
            for t in c.section_philosophers:
                terms["section_philosopher"].setdefault(t, []).append(c.chunk_id)
        self.terms = terms

        self.type_ids = {}
        for i, c in enumerate(self.chunks):
            self.type_ids.setdefault(c.chunk_type, []).append(i)
        self._id_pos = {c.chunk_id: i for i, c in enumerate(self.chunks)}

    # ---------------- 字面命中候选 ----------------

    def chunks_of_type(self, chunk_type: str) -> list[int]:
        """块类型 → 块下标（构建期一次遍历得到，替代请求期全库扫描）。"""
        return self.type_ids.get(chunk_type, [])

    def _literal_postings(self) -> dict[str, array]:
        """字符 → 块下标列表（懒构建，构建一次后常驻）。

        用字符级倒排而不是 jieba 词元倒排：分词是上下文相关的（「理性」在
        「合理性」里不是一个词元），按词元建索引会静默漏召回；任何「子串包含」
        都必然包含其中出现的每个字符，按字符取交集得到的是**超集**，
        再用 `in` 逐块验证即为精确结果，与旧的全库 `in` 扫描逐字节等价。
        """
        if self._literal is not None:
            return self._literal
        with self._literal_lock:
            if self._literal is None:
                post: dict[str, array] = {}
                for i, c in enumerate(self.chunks):
                    for ch in set(c.text):
                        post.setdefault(ch, array("i")).append(i)
                self._literal = post
        return self._literal

    def literal_candidates(self, terms: Iterable[str]) -> set[int]:
        """可能包含这些词面的块下标集合（超集，需调用方用 `in` 复核）。

        单字词直接取其字符倒排；多字词取各字符倒排的交集。返回空集即「语料里
        不可能出现这些词面」，与全库扫描的结论一致。
        """
        cands: set[int] = set()
        post = self._literal_postings()
        for term in terms:
            chars = {ch for ch in (term or "") if not ch.isspace()}
            if not chars:
                continue
            sub: set[int] | None = None
            for ch in chars:
                ids = set(post.get(ch, ()))
                sub = ids if sub is None else (sub & ids)
                if not sub:
                    break
            if sub:
                cands |= sub
                if len(cands) >= len(self.chunks):
                    break
        return cands

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
    def load(cls, store_dir: Path, lex: Lexicon, cfg: dict[str, Any] | None = None) -> "Store":
        st = cls()
        with open(store_dir / "chunks.jsonl", encoding="utf-8") as f:
            st.chunks = [Chunk.from_dict(json.loads(line)) for line in f if line.strip()]
        st.vectors = np.load(store_dir / "vectors.npy")
        with open(store_dir / "terms.json", encoding="utf-8") as f:
            st.terms = json.load(f)
        with open(store_dir / "manifest.json", encoding="utf-8") as f:
            st.manifest = json.load(f)
        st.enrich = bool(st.manifest.get("enrich_embed_text", True))
        st.tags_max = int(st.manifest.get("embed_tags_max", 0))
        st._build_lexical(lex)
        if int(st.manifest.get("annotation_version", 1)) < ANNOTATION_VERSION:
            print(
                f"[philo-rag] 索引缺少新版注解（坐标 / 章节级注解）：{store_dir}\n"
                f"            运行 `python -m philo_rag.cli build` 重建后生效。",
                file=sys.stderr,
            )
        # 分块参数 / 词典变更同样会让索引与配置对不上；cfg 传入时逐项提示
        if cfg is not None:
            for problem in manifest_drift(st.manifest, cfg, lex):
                print(
                    f"[philo-rag] {problem}\n"
                    f"            索引目录：{store_dir}\n"
                    f"            确认后运行 `python -m philo_rag.cli build` 重建（可用 `stats --verify` 查看详情）。",
                    file=sys.stderr,
                )
        return st

    def check_consistency(self, cfg: dict[str, Any], lex: Lexicon) -> list[str]:
        """当前索引与配置/词典的不一致清单（CLI `stats --verify` 与测试复用）。"""
        return manifest_drift(self.manifest, cfg, lex)

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
        axis: str | None = None,
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
        if axis:
            # 四层坐标（如 场域论=2 / 本体论=3），来自 chunk.coords
            sets.append(set(self.terms["axis"].get(axis, [])))
        if chunk_type:
            sets.append({self.chunks[i].chunk_id for i in self.chunks_of_type(chunk_type)})

        if not sets:
            return None
        out = sets[0]
        for s in sets[1:]:
            out &= s
        return out

    def index_of(self, chunk_id: str) -> int | None:
        """chunk_id → 块下标（构建期建表，替代按 id 线性扫描）。"""
        return self._id_pos.get(chunk_id)

    def by_id(self, chunk_id: str) -> Chunk | None:
        i = self._id_pos.get(chunk_id)
        return self.chunks[i] if i is not None else None

    def quotes(self) -> list[Chunk]:
        return [self.chunks[i] for i in self.chunks_of_type("quote")]
