"""追问改写：把「继续 / 详细点 / 那黑格尔呢 / 和康德比呢」变成可检索的独立问题。

为什么必须前置在闸门之前：gate 的 fragment 类把「继续 / 详细点 / 为什么」整类拦死，
因为它们脱离上下文没有主题。改写在 gate **之前**完成，改写后的句子自带主题，
fragment 自然不再命中——于是 gate.py 的判定逻辑一行都不用改，也不会误伤真正的提问。

为什么只做规则（不上 LLM 兜底）：规则命中率高且 <1ms；LLM 改写引入 1–3s 首字延迟，
且在 answer.backend=template（测试与离线模式）下根本不可用，会造成「测试通过、
线上行为不同」。规则未命中时退化为「继承上一轮的独立问题」，仍然安全
（宁放行不误杀，与 gate 的设计哲学一致）。

依赖方向：只依赖 gate.normalize / text_rules / Lexicon，**不得** import answer，
否则 answer → rewrite → answer 形成循环导入。
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from .gate import RE_ASK, normalize
from .text_rules import DOMAIN_TERMS

if TYPE_CHECKING:  # 只用于类型标注：运行时不需要 conv / lexicon 的具体类型
    from .conv import Turn
    from .lexicon import Lexicon


@dataclass
class Rewrite:
    standalone: str          # 交给闸门 / 检索 / 路由的独立问题
    is_followup: bool        # 是否用上了上文（决定缓存键的 S/F 段）
    hint: str = ""           # 给提示词的一句侧重（拼进 context 前置块，不给模板加占位符）
    downgrade: bool = False  # True 时强制 strategy = point（上一轮是范围查询的纯延续）


# --------------------------------------------------------------------------- #
# 形态表（顺序即优先级）
# --------------------------------------------------------------------------- #
def _tail(body: str) -> re.Pattern[str]:
    """整句形态：允许句尾的标点与空白，但不许有多余的词。"""
    return re.compile(r"^(?:" + body + r")[？?。!！…、，,\s]*$")


# 1) 纯延续：继续 / 然后呢 / 接着 / 再说 / 展开 / 细说
RE_CONTINUE = _tail(
    "继续|继续讲|继续吧|继续展开|然后呢|然后|接着|接着说|再说说|再说|展开|细说|详细说|"
    "说下去|往下说"
)
# 2) 讲细：详细点 / 具体点 / 展开讲讲
RE_DETAIL = _tail(
    "详细点|详细一点|再详细点|具体点|具体些|具体一些|展开讲讲|展开说说|展开讲|"
    "说得更清楚些|说得再清楚些|讲细点|细讲"
)
# 3) 问依据：为什么 / 凭什么 / 怎么证明
RE_WHY = _tail("为什么|为何|凭什么|怎么证明|何以见得")
# 4) 求例证：举个例子 / 出处 / 原文在哪
RE_EXAMPLE = _tail("举个例子|举个例子说明|举例说明|举例|出处|原文在哪|原文在哪里|引文在哪")

# 5) 换话题：「那X呢 / 那么X呢 / X呢 / 那X」
RE_TOPIC_THEN = re.compile(r"^(?:那|那么)?\s*(?P<x>[^，。？！]{1,12})\s*呢$")
RE_TOPIC_NA = re.compile(r"^那(?P<x>.{1,12})$")
# 6) 对比：「和X比呢 / 与X有何不同 / 对比X / X和Y的区别」
RE_COMPARE = re.compile(
    r"(?:和|与|跟|对比)\s*(?P<x>[^，。？！]{1,10}?)\s*"
    r"(?:比|比较|相比|有什么不同|有何不同|有哪些不同|区别|的异同|的不同)"
)
# 7) 指代：他 / 它 / 这 / 那 / 上面 / 刚才 / 前面 / 上一
RE_PRONOUN = re.compile(r"(他|它|这|那|上面|刚才|前面|上一)")
RE_UNIT_CODE = re.compile(r"\d+(?:-\d+){1,3}")

HINT_CONTINUE = "接着上文继续展开，不要重复已经答过的要点"
HINT_DETAIL = "把上文的论点讲细，指出其中的分歧与张力"
HINT_WHY = "说明上文结论在原文中的论证依据"
HINT_EXAMPLE = "给出原文中的具体例子与引文"
HINT_COMPARE = "对比二者的定义、体系位置与关键分歧"
HINT_TOPIC = "承接上一轮的侧重回答这个话题，不重复上一轮的结论"


def _clean_topic(x: str) -> str:
    """剥掉首尾的「那 / 那么 / 呢 / 的」与空白标点。"""
    t = (x or "").strip()
    for _ in range(3):
        t = t.strip(" \t，,。.、！!？?…~～")
        t = re.sub(r"^(?:那么|那)", "", t).strip()
        t = re.sub(r"(?:那么|那|呢|的)$", "", t).strip()
    return t


def _topic_only(q: str) -> str:
    """从「那X呢 / X呢 / 那X」里剥出 X；不像换话题形态时返回空串。"""
    m = RE_TOPIC_THEN.match(q) or RE_TOPIC_NA.match(q)
    if m is None:
        return ""
    x = m.group("x")
    # 带对比标记的归规则 6；本身就是完整问句（「什么是字头呢」）的不要当话题
    if RE_COMPARE.search(x) or RE_ASK.search(x):
        return ""
    x = _clean_topic(x)
    if not x or len(x) > 12:
        return ""
    return x


def _compose(x: str, last: Turn) -> str:
    """按上一轮的意图把话题包成完整问句。

    必须**总是**合成完整问句：裸词（「黑格尔」）会命中 routing.clarify_broad_topic
    的裸主题反问，形成「点了方向又被反问方向」的死循环。
    """
    focus = (last.focus or "").lower()
    if last.strategy == "theme":
        if focus == "position":
            return f"{x}在体系中的位置"
        if focus == "mechanism":
            return f"{x}的思想机制与论证路径"
        if focus == "lineage":
            return f"{x}的谱系与后继影响"
        if focus == "critique":
            return f"书中对{x}的张力与批判"
    return f"{x}的核心定义是什么？"


def _has_anchor(q: str, lex: Lexicon | None) -> bool:
    """问题里是否已有「指向本书内容」的锚点（与 gate 的放行判据同源）。"""
    if lex is not None and (lex.match_concepts(q) or lex.match_philosophers(q)):
        return True
    if RE_UNIT_CODE.search(q):
        return True
    return any(term in q for term in DOMAIN_TERMS)


def rewrite_followup(
    question: str,
    turns: list[Turn] | None,
    lex: Lexicon | None = None,
) -> Rewrite:
    """把本轮问题改写成可独立检索的句子。

    `turns` 为空（无上文 / 会话已过期）时，只有「那X呢」这类仍能剥出话题的形态会被
    改写；纯延续（继续 / 详细点 / 为什么 / 举例）一律不生效——保持 gate 的原有拦截，
    让用户看到「缺少上下文的碎片追问」而不是一个空泛检索。
    """
    q = normalize(question)
    last = turns[-1] if turns else None

    if last is None:
        topic = _topic_only(q)
        return Rewrite(standalone=topic or q, is_followup=False)

    # 上一轮是范围查询时，纯延续必须降级为点查询：否则会以数千字重跑一遍主题聚合
    downgrade = last.strategy == "theme"
    if RE_CONTINUE.match(q):
        return Rewrite(last.standalone, True, hint=HINT_CONTINUE, downgrade=downgrade)
    if RE_DETAIL.match(q):
        return Rewrite(last.standalone, True, hint=HINT_DETAIL, downgrade=downgrade)
    if RE_WHY.match(q):
        return Rewrite(last.standalone, True, hint=HINT_WHY, downgrade=downgrade)
    if RE_EXAMPLE.match(q):
        return Rewrite(last.standalone, True, hint=HINT_EXAMPLE, downgrade=downgrade)

    compare = RE_COMPARE.search(q)
    if compare is not None:
        x = _clean_topic(compare.group("x"))
        if x:
            base = last.topic or last.standalone
            return Rewrite(f"{base}与{x}的异同与关键分歧", True, hint=HINT_COMPARE)

    topic = _topic_only(q)
    if topic:
        # 未登录词典的话题也照合成：否则未登录主题永远接不上上文
        return Rewrite(_compose(topic, last), True, hint=HINT_TOPIC)

    if RE_PRONOUN.search(q) and not _has_anchor(q, lex):
        return Rewrite(last.standalone, True, hint=HINT_DETAIL)

    # 兜底：有上文、无锚点、无提问句式 → 当作「又问了一遍上文那个问题」
    if len(q) >= 2 and not _has_anchor(q, lex) and not RE_ASK.search(q):
        return Rewrite(last.standalone, True)

    return Rewrite(q, False)
