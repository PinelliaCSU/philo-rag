"""问题闸门用例表。

原本放在 `scripts/check_gate.py` 里由人工巡检；CLI 与巡检脚本删除后，
这些期望值只服务于 `tests/test_gate.py`，因此随用例一起放在 tests/ 下。

闸门的取舍是「宁可放行模糊问题，也不误杀真正的哲学提问」，用例分三组：
应当放行的哲学提问、应当拦截的非知识性问题、语义相关性兜底的垃圾输入。
"""
from __future__ import annotations

from philo_rag.gate import check_question, check_relevance

# (问题, 期望是否放行)
CASES: list[tuple[str, bool]] = [
    # ---- 应当放行：指向本书内容的提问 ----
    ("什么是字头？", True),
    ("场域论、本体论、认识论、目的论这四层分别规定什么？", True),
    ("大他者怎么理解？", True),
    ("谢林和黑格尔的分歧在哪？", True),
    ("3-2 讲的是什么？", True),
    ("存在者整体是什么意思？", True),
    ("字头", True),
    ("辩证法", True),
    ("拉康", True),
    ("什么是幸福？", True),
    ("为什么说不可能是乌托邦的基本规定？", True),
    ("阿赖耶识", True),
    # ---- 应当拦截：不适合检索的问题 ----
    ("你好", False),
    ("谢谢你！", False),
    ("ok", False),
    ("你是谁", False),
    ("这个知识库怎么用", False),
    ("介绍一下你自己", False),
    ("今天天气怎么样", False),
    ("股票涨了吗", False),
    ("写一首诗", False),
    ("继续", False),
    ("然后呢", False),
    ("详细点", False),
    ("什么是", False),
    ("?", False),
]

# 语义相关性格挡用例：硬编码模式覆盖不到的垃圾输入应当被 `irrelevant` 兜底，
# 而无锚点但确实指向哲学内容的提问应当放行。需要加载索引后校验。
RELEVANCE_CASES: list[tuple[str, bool]] = [
    # ---- 无锚点、但与语料相关，应当放行 ----
    ("什么是幸福", True),
    ("阿赖耶识", True),
    ("禅宗怎么看空性", True),
    ("德里达的延异", True),
    ("现象学还原是什么意思", True),
    # ---- 无锚点、且与语料无关，应当被语义相关性拦截 ----
    ("红烧肉怎么做", False),
    ("阿巴阿巴阿巴", False),
    ("qwertyuiop", False),
    ("如何修复家里的水管漏水", False),
    ("推荐几部好看的电影", False),
    ("明天去北京坐哪趟高铁", False),
    ("如何减肥", False),
    ("王者荣耀怎么上分", False),
    ("买房首付多少", False),
]


def combined_gate(store, lex, cfg, question: str) -> dict:
    """与 `answer()` 一致的闸门组合：规则闸门 → 语义相关性兜底。"""
    g = check_question(question, lex, cfg)
    if not g["ok"]:
        return g
    if cfg.get("gate", {}).get("relevance", True) and g.get("anchor") is False:
        return check_relevance(store, question, cfg)
    return g
