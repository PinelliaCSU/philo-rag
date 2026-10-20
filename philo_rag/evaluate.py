"""评测层：用一组标注问题回归检索质量。

RAG 系统最容易「看起来能跑、实际上不准」，所以把 Hit@k 与 MRR 固化成可回归的指标，
每次改分块策略 / 换嵌入模型 / 调融合权重后都跑一遍，避免悄悄退化。

标注方式用「必须命中的关键词」而非 chunk_id——因为调整分块粒度会让 chunk_id 全部失效，
而关键词标注在分块策略变化后依然有效。

标注集针对《哲学大纲》语料：覆盖体系核心（字头/四层/话语）、四卷各自的关键议题。
`evaluate()` 也可接收自定义标注集，格式为
`[{"q": "问题", "must": ["必须出现在命中块里的关键词"]}, ...]`。
"""
from __future__ import annotations

from typing import Any

from .index import Store
from .lexicon import Lexicon
from .retrieve import hybrid_search

GOLDEN: list[dict[str, Any]] = [
    # ---------- 体系总纲 ----------
    {"q": "什么是字头？四个字头分别指什么？", "must": ["字头"]},
    {"q": "场域论、本体论、认识论、目的论这四层分别规定什么？", "must": ["场域论"]},
    {"q": "一字头为什么被称为形而下学？", "must": ["形而下学"]},
    {"q": "存在者整体是什么意思？", "must": ["存在者整体"]},
    {"q": "总体与总体化的差别在哪里？", "must": ["总体化"]},
    {"q": "二字头的实质是什么张力？", "must": ["二字头"]},
    {"q": "三字头如何理解「无」？", "must": ["三字头"]},
    {"q": "四字头为什么强调辩证唯物主义的姿态？", "must": ["四字头"]},

    # ---------- 第 1 卷 实在论 ----------
    {"q": "科学实在论的核心主张是什么？", "must": ["科学实在论"]},
    {"q": "物理主义的代表人物是谁？", "must": ["物理主义"]},
    {"q": "建构论为什么被视为资本主义的仆从？", "must": ["建构论"]},
    {"q": "行为主义心理学的基本特征是什么？", "must": ["行为主义"]},
    {"q": "宇宙悲观主义（cosmicism）指的是什么？", "must": ["宇宙悲观主义"]},
    {"q": "宗教实在论包含哪些形态？", "must": ["宗教实在论"]},

    # ---------- 第 2 卷 形而上学 ----------
    {"q": "在场形而上学是什么？", "must": ["在场形而上学"]},
    {"q": "我思形而上学的基本规定是什么？", "must": ["我思"]},
    {"q": "反形而上学为什么要取消形而上学问题？", "must": ["反形而上学"]},

    # ---------- 第 3 卷 观念论 ----------
    {"q": "现象学为什么强调面向事情本身？", "must": ["现象学"]},
    {"q": "康德的批判哲学要解决什么问题？", "must": ["批判哲学"]},
    {"q": "谢林思想转折点上的体系自由主义是什么？", "must": ["体系自由主义"]},
    {"q": "黑格尔的辩证法与绝对精神是什么关系？", "must": ["辩证法"]},
    {"q": "海德格尔的此在指什么？", "must": ["此在"]},
    {"q": "拉康的大他者是什么意思？", "must": ["大他者"]},
    {"q": "符号学中的能指与所指是什么关系？", "must": ["能指"]},

    # ---------- 第 4 卷 实践 ----------
    {"q": "政治-经济-意识形态批判要批判什么？", "must": ["意识形态"]},
    {"q": "现实的正统化是如何运作的？", "must": ["正统化"]},
    {"q": "建设理想社会的路径是什么？", "must": ["理想社会"]},
    {"q": "为什么说不可能是乌托邦的基本规定？", "must": ["乌托邦"]},
]


def _first_hit_rank(hits: list[dict[str, Any]], must: list[str]) -> int | None:
    for rank, h in enumerate(hits, start=1):
        text = h["chunk"].text
        if all(k in text for k in must):
            return rank
    return None


def evaluate(
    store: Store,
    lex: Lexicon,
    cfg: dict[str, Any],
    top_k: int = 8,
    golden: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    golden = golden or GOLDEN
    ranks: list[int | None] = []
    rows: list[dict[str, Any]] = []

    for item in golden:
        hits = hybrid_search(store, item["q"], cfg, lex, top_k=top_k)
        rank = _first_hit_rank(hits, item["must"])
        ranks.append(rank)
        rows.append(
            {
                "q": item["q"],
                "must": item["must"],
                "rank": rank,
                "top1": hits[0]["chunk"].text[:40].replace("\n", " ") if hits else "",
            }
        )

    n = len(ranks)
    hit_at_1 = sum(1 for r in ranks if r == 1) / n
    hit_at_3 = sum(1 for r in ranks if r is not None and r <= 3) / n
    hit_at_k = sum(1 for r in ranks if r is not None) / n
    mrr = sum(1.0 / r for r in ranks if r is not None) / n

    return {
        "n": n,
        "top_k": top_k,
        "hit@1": round(hit_at_1, 4),
        "hit@3": round(hit_at_3, 4),
        f"hit@{top_k}": round(hit_at_k, 4),
        "mrr": round(mrr, 4),
        "rows": rows,
    }
