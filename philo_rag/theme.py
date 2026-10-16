"""范围查询层：把「一个主题在全书中的分布」整体取回，按体系结构聚合。

这是「溯源回答」在判定为**范围查询**时使用的召回策略，与 `retrieve.hybrid_search`
（点查询，top-k 散点）互补。二者对用户是同一个入口，差别只在召回规模与组织方式：

  hybrid_search   点查询 —— 精确、少而准，回答「某句话出自哪里」
  theme_search    范围查询 —— 高召回、结构化，回答「全书如何论述某主题」

两者的根本差别在**召回量与组织方式**，而非排序精度：

  | 维度 | 点查询 | 范围查询 |
  |---|---|---|
  | 召回量 | top-8（≈ 相关块的 2%） | 全部直接命中块（数百）+ 语义补充 |
  | 组织 | 按分数散点排列 | 按数值单元聚合 → 单元内恢复连续段落群 |
  | 单元用途 | 每条引用的属性 | **一等组织维度**（核心单元 / 外围单元分层）|
  | 上下文 | 每块取 1 句（信息利用率 ≈26%）| 保留完整段落群（≈100%）|

设计要点：

1. **两层可核对召回**，由硬到软：
   - `meta`   元数据命中（词典把主题归一后，块标签含该主题）——最硬
   - `literal` 块正文直接出现主题词——次硬（等价于旧「全量关键词扫描」）
   语义近似结果只用于相关性闸门，不作为范围回答的事实证据。
2. **主题锚定**：主题词先经词典归一为 philosopher / concept / unit；
   未登录主题只接受正文直接出现的证据，不把语义近似结果或共现元数据当成主题论据。
3. **单元聚合**：直接命中块按最细数值单元分桶，桶内按块序合并连续块为
   「段落群」，恢复被分块切碎的论证链。
"""
from __future__ import annotations

import collections
import re
from typing import Any

from .index import Store
from .lexicon import Lexicon
from .schema import Chunk

UNKNOWN_UNIT = "（前言·体例·总纲）"


def _filter_relevant_sentences(text: str, terms: list[str], max_chars: int) -> str:
    """从段落群中保留含主题词的句子，去掉无关句，提高上下文信息密度。

    与 answer_theme.py 的 _theme_sentences 不同：这里不做打分排序，只做保留/丢弃
    二值判断，保持原文顺序。没有命中任何主题词时退回截断。
    """
    import re

    sents = re.findall(r"[^。！？；\n]+[。！？；]?", text)
    sents = [s.strip() for s in sents if len(s.strip()) >= 8]
    picked: list[str] = []
    used = 0
    for s in sents:
        if used + len(s) > max_chars and picked:
            break
        # 保留含主题词的句子，或定义/转折标记句
        if any(t in s for t in terms) or any(
            m in s for m in ("即", "是指", "意味着", "所谓", "定义为", "指的是")
        ):
            picked.append(s)
            used += len(s)
    return "".join(picked) if picked else text[:max_chars].rstrip() + "……"


# --------------------------------------------------------------------------- #
# 主题锚定
# --------------------------------------------------------------------------- #
def _anchor(lex: Lexicon, topic: str) -> tuple[list[str], list[str], list[str]]:
    """把主题词归一到词典的三个维度。

    返回 (philosophers, concepts, units)。三者全空即「未登录主题」。
    """
    phils = list(dict.fromkeys(lex.match_philosophers(topic)))
    concs = list(dict.fromkeys(lex.match_concepts(topic)))
    # 主题恰好是某个理论家 / 概念的标准名时，match_* 可能因「查询串 == 别名」而不命中别名表，
    # 这里补一次标准名直查。
    if topic in lex.philosophers and topic not in phils:
        phils.append(topic)
    if topic in lex.concepts and topic not in concs:
        concs.append(topic)

    units: list[str] = []
    for code in lex._unit_by_code:  # noqa: SLF001 - 同包内访问
        title = lex.unit_title(code)
        if topic and topic in title:
            units.append(code)
    # 流派/思潮级主题回退：理论家与概念都未命中时，用主题词典补锚点。
    if not phils and not concs:
        t_phils, t_concs, t_units = lex.theme_anchors(topic)
        if t_phils or t_concs or t_units:
            phils, concs, units = t_phils, t_concs, t_units
    return phils, concs, units


# --------------------------------------------------------------------------- #
# 三层召回
# --------------------------------------------------------------------------- #
def _collect(
    store: Store,
    lex: Lexicon,
    topic: str,
    phils: list[str],
    concs: list[str],
    units: list[str],
    *,
    include_metadata: bool = True,
) -> dict[str, list[Chunk]]:
    """按证据等级收集候选块：meta（元数据）→ literal（字面）。

    未登录主题的理论家/概念只是种子检索产生的候选线索，不能反过来扩大为
    全库的元数据证据；否则一个语义近似结果就会把无关单元全部纳入上下文。
    """
    literals = {t for t in ([topic, *phils, *concs] if include_metadata else [topic]) if t}
    pset, cset, uset = set(phils), set(concs), set(units)
    meta: list[Chunk] = []
    literal: list[Chunk] = []
    for c in store.chunks:
        if include_metadata and (
            (pset & set(c.philosophers))
            or (cset & set(c.concepts))
            or (uset & set(c.unit_codes()))
        ):
            meta.append(c)
        elif any(t in c.text for t in literals):
            literal.append(c)
    return {"meta": meta, "literal": literal}


def _evidence_type(text: str, terms: list[str]) -> str:
    """给段落群标注证据角色；角色用于覆盖式选段，不代表作者立场。"""
    sentences = re.findall(r"[^。！？；\n]+[。！？；]?", text)
    body = " ".join(sentences)
    has_term = any(term in body for term in terms)
    if any(
        term and re.search(
            rf"{re.escape(term)}.{{0,40}}(?:即|是指|意味着|定义为|指的是|包含)",
            body,
        )
        for term in terms
    ) or "所谓" in body:
        return "definition"
    if any(marker in body for marker in ("但是", "然而", "不能", "问题在于", "缺陷", "局限", "反而")):
        return "contrast"
    if any(marker in body for marker in ("因为", "由于", "通过", "从而", "因此", "形成", "产生", "机制")):
        return "mechanism"
    if has_term and any(marker in body for marker in ("主张", "认为", "指出", "核心", "本质", "意味着")):
        return "claim"
    if has_term:
        return "example"
    return "background"


def _group_score(group: dict[str, Any]) -> float:
    weights = {
        "definition": 5.0,
        "claim": 4.0,
        "mechanism": 3.5,
        "contrast": 3.5,
        "example": 2.0,
        "background": 0.5,
    }
    return weights[group["evidence_type"]] + min(group["chars"], 1200) / 1200


def _select_groups(groups: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """优先覆盖定义、论证/机制、限制，再用高分证据补足。"""
    if len(groups) <= limit:
        return groups
    selected: list[dict[str, Any]] = []
    wanted = ("definition", "claim", "mechanism", "contrast")
    for kind in wanted:
        candidates = [g for g in groups if g["evidence_type"] == kind and g not in selected]
        if candidates and len(selected) < limit:
            selected.append(max(candidates, key=_group_score))
    remaining = [g for g in groups if g not in selected]
    selected.extend(sorted(remaining, key=_group_score, reverse=True)[: max(0, limit - len(selected))])
    return sorted(selected, key=lambda g: g["start"])


def _select_units(units: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """先保留高证据单元，再尽量覆盖不同卷与证据类型。"""
    ranked = sorted(
        units,
        key=lambda u: (
            -max((_group_score(g) for g in u["groups"]), default=0),
            -u["hits"],
            -u["density"],
            u["code"],
        ),
    )
    selected: list[dict[str, Any]] = []
    volumes: set[str] = set()
    kinds: set[str] = set()
    while ranked and len(selected) < limit:
        best = max(
            ranked,
            key=lambda u: (
                (2 if u["volume"] and u["volume"] not in volumes else 0)
                + (1 if any(g["evidence_type"] not in kinds for g in u["groups"]) else 0),
                max((_group_score(g) for g in u["groups"]), default=0),
                u["hits"],
            ),
        )
        selected.append(best)
        ranked.remove(best)
        volumes.add(best["volume"])
        kinds.update(g["evidence_type"] for g in best["groups"])
    return sorted(selected, key=lambda u: (-u["hits"], -u["density"], u["code"]))


def _aggregate_by_unit(
    store: Store, lex: Lexicon, blocks: list[Chunk], group_gap: int
) -> list[dict[str, Any]]:
    """按最细数值单元分桶，桶内把连续块合并为段落群，按命中数排序。"""
    total_in_unit: collections.Counter[str] = collections.Counter(
        (c.unit_code() or UNKNOWN_UNIT) for c in store.chunks
    )
    buckets: dict[str, list[Chunk]] = collections.defaultdict(list)
    for c in blocks:
        buckets[c.unit_code() or UNKNOWN_UNIT].append(c)

    out: list[dict[str, Any]] = []
    for code, items in buckets.items():
        items.sort(key=lambda c: c.seq)
        groups: list[dict[str, Any]] = []
        cur: list[Chunk] = []
        for c in items:
            if cur and c.seq - cur[-1].seq > group_gap:
                groups.append(_pack_group(cur))
                cur = []
            cur.append(c)
        if cur:
            groups.append(_pack_group(cur))
        # 段群按长度（信息量）降序，长的段群更可能是论证主体而非顺带一提
        groups.sort(key=lambda g: -g["chars"])

        hits = len(items)
        total = total_in_unit.get(code, hits)
        out.append(
            {
                "code": "" if code == UNKNOWN_UNIT else code,
                "title": lex.unit_title(code) if code != UNKNOWN_UNIT else UNKNOWN_UNIT,
                "volume": lex.volume_of(code) if code != UNKNOWN_UNIT else "",
                "hits": hits,
                "total": total,
                "density": round(hits / max(total, 1), 3),
                "groups": groups,
            }
        )
    # 主题集中度：命中数优先，密度次之，单元编号升序兜底
    out.sort(key=lambda u: (-u["hits"], -u["density"], u["code"]))
    return out


def _overlap_join(a: str, b: str, cap: int = 400) -> str:
    """把 b 接到 a 后面，去掉二者重叠的部分。

    分块时 `overlap_chars` 会在相邻块间留下重复文本；段落群若直接拼接，
    同一句会连续出现两次（实测「精神分析是一个运动…」重复）。这里找最长重叠并裁掉。
    找不到重叠（两块在原文里本来就不相邻）则换行分隔。
    """
    limit = min(len(a), len(b), cap)
    for k in range(limit, 0, -1):
        if a.endswith(b[:k]):
            return a + b[k:]
    return a + "\n" + b


def _pack_group(items: list[Chunk]) -> dict[str, Any]:
    """把一个连续块序列拼成一个段落群（去重叠，保留可溯源区间）。

    正文只由 body 块构成：引文块在字符区间上嵌在正文块内部，若一并拼接会重复；
    它们单独收进 `quotes`（供「金句」展示）。
    """
    items = sorted(items, key=lambda c: c.seq)
    quotes = [c.text for c in items if c.chunk_type == "quote"]
    body = [c for c in items if c.chunk_type != "quote"]
    src = body or items

    text = src[0].text
    for c in src[1:]:
        # 整块已被包含（如相邻块完全覆盖），跳过
        if len(c.text) >= 20 and c.text in text:
            continue
        text = _overlap_join(text, c.text)

    return {
        "text": text,
        "chars": len(text),
        "start": min(c.start for c in items),
        "end": max(c.end for c in items),
        "page": min(c.page for c in items),
        "page_end": max(c.page for c in items),
        "chunk_ids": [c.chunk_id for c in items],
        "quotes": quotes,
        "evidence_type": "",
        "evidence_score": 0.0,
    }


# --------------------------------------------------------------------------- #
# 对外入口
# --------------------------------------------------------------------------- #
def theme_search(store: Store, lex: Lexicon, topic: str, cfg: dict[str, Any]) -> dict[str, Any]:
    """主题聚合检索：返回「主题 → 单元分布 → 段落群」的完整结构。"""
    t_cfg = cfg.get("theme", {}) or {}
    group_gap = int(t_cfg.get("group_gap", 3))
    max_units = int(t_cfg.get("max_units", 12))
    max_group_chars = int(t_cfg.get("max_group_chars", 1500))
    groups_per_unit = int(t_cfg.get("groups_per_unit", 3))

    phils, concs, units = _anchor(lex, topic)
    seed_mode = not (phils or concs or units)
    if seed_mode:
        # 未登录主题不使用语义种子的共现标签扩大全库召回。共现标签不能证明
        # 主题在相应单元中被讨论；这里保留空锚点，要求正文直接出现主题词。
        phils, concs, units = [], [], []

    collected = _collect(
        store,
        lex,
        topic,
        phils,
        concs,
        units,
        include_metadata=not seed_mode,
    )
    direct = collected["meta"] + collected["literal"]

    # 语义补充（semantic_top_k）在之前版本会额外跑一次完整 hybrid_search 做语义近似召回，
    # 但结果只计入 counts.extended 统计数，从未进入上下文 context 或最终答案——
    # 属于纯额外开销（实测 ~3.7s），直接去掉。配置项保留以兼容旧配置。
    extended: list[Chunk] = []

    units_agg = _aggregate_by_unit(store, lex, direct, group_gap)
    topic_terms = [t for t in [topic, *phils, *concs] if t]
    for unit in units_agg:
        for group in unit["groups"]:
            group["evidence_type"] = _evidence_type(group["text"], topic_terms)
            group["evidence_score"] = round(_group_score(group), 3)
    # 只有零散的一次性提及时，不足以支撑「范围查询」的体系分析。
    # 这类结果交给上层返回“资料不足”，避免模型把孤立句拼成完整谱系。
    if seed_mode and (not units_agg or max(u["hits"] for u in units_agg) < 2):
        units_agg = []
    kept = _select_units(units_agg, max_units)

    # 谱系：直接命中块里与主题共现的其他理论家（上游 / 同代 / 后继的线索）
    pc: collections.Counter[str] = collections.Counter()
    ec: collections.Counter[str] = collections.Counter()
    for c in direct:
        for p in c.philosophers:
            if p not in phils:
                pc[p] += 1
        for e in c.eras:
            ec[e] += 1

    # 组装上下文（供生成层；按单元分节，带结构标题）
    # 每个段落群先经句子级筛选——去掉不含主题词的无关句，同等字符预算下
    # 信息密度更高，LLM 输入 token 更少、生成更快。
    context_parts: list[str] = []
    used = 0
    budget = int(t_cfg.get("context_budget", 16000))
    # 主题词集合，用于句子筛选
    evidence: list[dict[str, Any]] = []
    evidence_no = 0
    for u in kept:
        u["selected_groups"] = _select_groups(u["groups"], groups_per_unit)
        head = f"### 单元 {u['code']} {u['title']}｜{u['volume']}｜命中 {u['hits']} 块"
        context_parts.append(head)
        used += len(head)
        for g in u["selected_groups"]:
            text = g["text"]
            # 句子级筛选：保留含主题词的句子，去掉无关句
            if topic_terms and len(text) > 400:
                text = _filter_relevant_sentences(text, topic_terms, max_group_chars)
            elif len(text) > max_group_chars:
                text = text[:max_group_chars].rstrip() + "……"
            evidence_no += 1
            evidence_id = f"E{evidence_no:02d}"
            context_parts.append(
                f"[证据 {evidence_id}]\n"
                f"单元：{u['code'] or '前言'} {u['title']}\n"
                f"页码：{g['page']}–{g['page_end']}\n"
                f"证据类型：{g['evidence_type']}\n"
                f"正文：{text}"
            )
            evidence.append(
                {
                    "id": evidence_id,
                    "unit": u["code"],
                    "unit_title": u["title"],
                    "volume": u["volume"],
                    "page": g["page"],
                    "page_end": g["page_end"],
                    "start": g["start"],
                    "end": g["end"],
                    "chunk_id": g["chunk_ids"][0] if g["chunk_ids"] else "",
                    "chunk_ids": g["chunk_ids"],
                    "text": text,
                    "evidence_type": g["evidence_type"],
                    "score": g["evidence_score"],
                }
            )
            used += len(text)
            if used > budget:
                break
        if used > budget:
            break

    return {
        "topic": topic,
        "seed_mode": seed_mode,
        "anchors": {"philosophers": phils, "concepts": concs, "units": units},
        "counts": {
            "meta": len(collected["meta"]),
            "literal": len(collected["literal"]),
            "direct": len(direct),
            "extended": len(extended),
            "corpus": len(store.chunks),
            "unit_total": len(units_agg),
        },
        "units": kept,
        "units_all": units_agg,
        "lineage": pc.most_common(20),
        "eras": ec.most_common(10),
        "context": "\n\n".join(context_parts),
        "context_chars": used,
        "evidence": evidence,
    }


def theme_payload(store: Store, lex: Lexicon, topic: str, cfg: dict[str, Any]) -> dict[str, Any]:
    """给输出层 / Web 用的精简结构（去掉超大 groups 正文，保留统计与索引）。"""
    res = theme_search(store, lex, topic, cfg)
    return {
        "topic": res["topic"],
        "seed_mode": res["seed_mode"],
        "anchors": res["anchors"],
        "counts": res["counts"],
        "units": [
            {
                "code": u["code"],
                "title": u["title"],
                "volume": u["volume"],
                "hits": u["hits"],
                "total": u["total"],
                "density": u["density"],
                "group_count": len(u["groups"]),
                "top_group": u["groups"][0]["text"][:400] if u["groups"] else "",
            }
            for u in res["units"]
        ],
        "lineage": res["lineage"],
        "eras": res["eras"],
        "context_chars": res["context_chars"],
        "evidence": [
            {
                "id": e["id"],
                "unit": e["unit"],
                "page": e["page"],
                "page_end": e["page_end"],
                "evidence_type": e["evidence_type"],
                "score": e["score"],
            }
            for e in res["evidence"]
        ],
    }
