"""提问路由：判定「点查询 / 范围查询」，并决定裸主题提问是否先澄清方向。

两条策略回答的是同一个「溯源回答」版块的问题，差别只在召回规模与组织方式：
点查询少而准、每条论断可回跳原文；范围查询高召回、按体系结构分节。
判定顺序（见 classify_question）即优先级：主题式措辞 → 裸主题词 → 点查询。

裸主题（「谈谈黑格尔」「黑格尔」）不直接跑昂贵的范围查询，先由 clarify_broad_topic
反问方向，用户点选后带 strategy + focus 重新走原链路。
"""

from __future__ import annotations

import re
from typing import Any

from .gate import normalize
from .index import Store
from .lexicon import Lexicon
from .text_rules import (
    POINT_QUERY_PHRASES,
    THEME_QUERY_PHRASES,
    TOPIC_NOISE_PARTS,
    phrase_alternation,
)

# --------------------------------------------------------------------------- #
# 提问类型判定：点查询 vs 范围查询
# --------------------------------------------------------------------------- #
# 「溯源回答」是一个版块，但用户的问题有两类诉求，需要不同的召回规模与组织方式：
#
#   点查询    「什么是字头？」「大他者是什么意思？」「3-2 讲什么？」
#             → 少而准（top-k 8），每条论断可回跳原文；回答 3—5 段、数百字。
#   范围查询  「马克思在体系中的位置」「谈谈精神分析」「黑格尔的思想脉络」
#             → 高召回（数百块），按数值单元聚合、恢复连续段落群；
#             回答按体系结构分节、数千字，与离线时代的「专题提炼稿」同量级。
#
# 两者共用同一索引与同一返回结构（answer + citations），对用户是同一个入口，
# 差别只体现在回答的深度与覆盖面。`ask --strategy auto|point|theme` 可显式指定。
# 词表集中在 text_rules（与 gate 的提问句式同源）；**次序即语义**，勿按字母序重排
RE_THEME_QUERY = re.compile("(" + phrase_alternation(THEME_QUERY_PHRASES) + ")")
RE_POINT_QUERY = re.compile("(" + phrase_alternation(POINT_QUERY_PHRASES) + ")")
RE_UNIT_ONLY = re.compile(r"^\d+(?:-\d+){1,3}$")

# 从提问里剥掉「提问句式 + 主题修饰词 + 语气助词」，剩下的就是主题词本身
RE_TOPIC_NOISE = re.compile("(" + phrase_alternation(TOPIC_NOISE_PARTS) + ")")
_TRIM = " \u3000?？。！!，,、：:；;…~～·-—"


def _core_topic(question: str) -> str:
    """剥掉提问句式与主题修饰词，留下核心实词短语。"""
    return RE_TOPIC_NOISE.sub("", question or "").strip(_TRIM)


def route_question(question: str, lex: Lexicon | None = None) -> tuple[str, str]:
    """判定召回策略并给出**可解释的理由**，返回 (strategy, reason)。

    顺序即优先级：先看有没有「主题式」措辞（思想 / 脉络 / 体系中的位置 / 谈谈 …），
    再看是不是一个**裸主题词**（「马克思」「精神分析」——词典能锚定、又不含提问句式），
    最后才落到点查询。定义式提问（「什么是 X」）始终走点查询，保证精确。

    理由串会随问答结果返回（`route_reason`）：分流异常时不必翻代码猜判定依据。
    """
    q = (question or "").strip()
    if not q:
        return "point", "空问题按点查询处理"
    if RE_THEME_QUERY.search(q):
        return "theme", "含主题式措辞（思想 / 脉络 / 位置 / 谈谈 …）"
    core = _core_topic(q)
    stripped = q.strip(_TRIM)
    if core and core == stripped and not RE_POINT_QUERY.search(q):
        # 整句就是一个主题词（无提问句式），例如「马克思」「精神分析」「辩证法」
        if RE_UNIT_ONLY.match(core):
            return "point", "整句是数值单元编号，按定位式提问处理"
        if lex is not None and (lex.match_philosophers(core) or lex.match_concepts(core)):
            return "theme", "整句是词典锚定的裸主题"
        if 2 <= len(core) <= 12:
            return "theme", "整句是 2–12 字短实词裸主题"
    return "point", "默认按点查询处理"


def classify_question(question: str, lex: Lexicon | None = None) -> str:
    """判定问题属于「点查询」还是「范围查询」（理由见 `route_question`）。"""
    return route_question(question, lex)[0]


def theme_topic(question: str, lex: Lexicon | None) -> str:
    """从提问里抽出用于聚合的主题词。

    优先取词典锚点（第一个出现的理论家 / 概念），这样「马克思在体系中的位置」
    会被归一成「马克思」而不是整句；词典没有锚点时才退回「剥掉提问句式后的实词短语」。
    """
    if lex is not None:
        phils = sorted(lex.iter_philosophers(question), key=lambda x: x[0])
        if phils:
            return phils[0][2]
        concs = sorted(lex.iter_concepts(question), key=lambda x: x[0])
        if concs:
            return concs[0][2]
        themes = lex.match_themes(question)
        if themes:
            return str(themes[0].get("name") or "")
    return _core_topic(question) or (question or "").strip()


# --------------------------------------------------------------------------- #
# 宽泛主题澄清（clarify）：裸主题提问的前置聚焦选择器
# --------------------------------------------------------------------------- #
# 「谈谈黑格尔」「黑格尔」这类无修饰裸主题，不直接跑昂贵的范围查询，
# 先反问方向；用户点选后带 strategy + focus 重新走原链路。
RE_CLARIFY_BARE = re.compile(
    r"^(?:介绍一下|介绍下|说说看|谈谈|讲讲|说说|聊聊)?\s*(?P<topic>.{1,12})$"
)
# 含这些限定字的不算裸主题：什么/怎么/为什么/如何/哪/吗/呢/？/在/与/和 …
RE_CLARIFY_BLOCKED = re.compile(r"[什么怎么为什么如何哪吗呢？?在与和]")


def _clarify_bare_topic(question: str) -> str:
    """裸主题形态检查：可带「谈谈/讲讲…」引导词，余下 1—12 字且无限定字。"""
    q = normalize(question)
    m = RE_CLARIFY_BARE.match(q)
    if not m:
        return ""
    topic = m.group("topic").strip()
    if not topic or RE_CLARIFY_BLOCKED.search(topic):
        return ""
    return topic


def _topic_anchored(topic: str, lex: Lexicon | None) -> str:
    """整词锚定词典（理论家/概念/主题层），返回标准名；未锚定返回空串。

    必须整词命中、不能用子串命中：这样「精神分析的发展」不会被「精神分析」放行。
    """
    if not topic or lex is None:
        return ""
    for std, info in lex.philosophers.items():
        if topic == std or topic in info.get("aliases", []):
            return std
    for std, info in lex.concepts.items():
        if topic == std or topic in info.get("aliases", []):
            return std
    for theme in lex.themes:
        if topic == theme.get("name") or topic in theme.get("aliases", []):
            return str(theme.get("name") or topic)
    return ""


def clarify_broad_topic(
    question: str,
    strategy: str = "auto",
    cfg: dict[str, Any] | None = None,
    lex: Lexicon | None = None,
    backend: str = "api",
) -> str | None:
    """宽泛裸主题是否先澄清：返回应澄清的主题词，否则返回 None。

    全部条件同时满足才澄清：
      1. answer.clarify_broad 开启（默认 true）；
      2. 调用方未显式指定 point/theme；
      3. classify_question 自动判定为 theme；
      4. 问题是「谈谈/讲讲… + 裸主题」形态，且主题词能整词锚定词典；
      5. 离线 template 后端不澄清（cli build 自检依赖 theme 结果）。
    """
    a_cfg = (cfg or {}).get("answer", {}) or {}
    if not a_cfg.get("clarify_broad", True):
        return None
    s = (strategy or "").strip().lower()
    if s not in ("", "auto"):
        return None
    if backend == "template":
        return None
    if classify_question(question, lex) != "theme":
        return None
    raw = _clarify_bare_topic(question)
    if not raw:
        return None
    return _topic_anchored(raw, lex) or None


def _clarify_options(topic: str) -> list[dict[str, str]]:
    """澄清卡片的 5 个固定方向；question 里的主题词按实际 topic 填入。"""
    return [
        {"id": "definition", "label": "核心定义",
         "question": f"{topic}的核心思想是什么？",
         "strategy": "point", "focus": "definition"},
        {"id": "position", "label": "体系位置",
         "question": f"{topic}在主义主义体系中的位置",
         "strategy": "theme", "focus": "position"},
        {"id": "mechanism", "label": "思想机制 / 论证骨架",
         "question": f"{topic}的思想机制与论证路径",
         "strategy": "theme", "focus": "mechanism"},
        {"id": "lineage", "label": "谱系与后继",
         "question": f"{topic}的谱系与后继影响",
         "strategy": "theme", "focus": "lineage"},
        {"id": "critique", "label": "张力与批判",
         "question": f"书中对{topic}的张力与批判",
         "strategy": "theme", "focus": "critique"},
    ]


def _has_direct_topic_match(store: Store, topic: str) -> bool:
    """语义相似度偏低时，仍放行正文确实出现过的主题。

    先用字符倒排取候选块（超集），再逐块 `in` 复核——判定结果与「遍历全库做子串
    查找」完全一致，但不必对 6630 个块逐个做字符串搜索。
    """
    if not topic:
        return False
    return any(topic in store.chunks[i].text for i in store.literal_candidates([topic]))
