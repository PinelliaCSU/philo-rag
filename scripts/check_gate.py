# -*- coding: utf-8 -*-
"""问题闸门的质量巡检。

用法：
    python scripts/check_gate.py                      # 跑内置用例集，核对放行/拦截
    python scripts/check_gate.py "你的问题"           # 只看某条问题的裁决
    python scripts/check_gate.py --strict "问题"      # 按 strict 档裁决
    python scripts/check_gate.py --relevance          # 追加语义相关性格挡用例（需加载索引）

为什么要单独巡检：闸门的取舍是「宁可放行模糊问题，也不误杀真正的哲学提问」。
内置用例分两组——**应当放行**的哲学提问与**应当拦截**的非知识性问题；
扩充拦截模式或调整词典后跑一遍，就能看出有没有把哲学问题误伤成跳过。
`--relevance` 额外校验「硬编码覆盖不到的垃圾问题」能否被语义相关性兜底挡掉。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.gate import check_question, check_relevance  # noqa: E402
from philo_rag.lexicon import Lexicon  # noqa: E402

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
# 而无锚点但确实指向哲学内容的提问应当放行。需要 `--relevance` 加载索引后校验。
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


def main() -> None:
    ap = argparse.ArgumentParser(description="问题闸门巡检")
    ap.add_argument("question", nargs="?", help="只检查这一条问题")
    ap.add_argument("--strict", action="store_true", help="按 strict 档裁决")
    ap.add_argument("--relevance", action="store_true", help="追加语义相关性格挡用例（需加载索引）")
    args = ap.parse_args()

    lex = Lexicon(
        ROOT / "lexicon" / "philosophers.yaml",
        ROOT / "lexicon" / "concepts.yaml",
        ROOT / "lexicon" / "哲学大纲_体系.yaml",
    )
    cfg = {"gate": {"enabled": True, "min_chars": 4, "strict": args.strict, "relevance": True}}

    if args.relevance:
        from philo_rag.cli import load_config
        from philo_rag.index import Store

        full_cfg = load_config(ROOT / "config.yaml")
        full_cfg.setdefault("gate", {})["strict"] = args.strict
        store_dir = Path(full_cfg["doc"]["store_dir"])
        if not (store_dir / "chunks.jsonl").exists():
            raise SystemExit(f"索引不存在：{store_dir}\n请先运行：python -m philo_rag.cli build")
        store = Store.load(store_dir, lex)

    def decide(q: str) -> dict:
        if args.relevance:
            return combined_gate(store, lex, full_cfg, q)
        return check_question(q, lex, cfg)

    if args.question:
        g = decide(args.question)
        print(f"{'PASS' if g['ok'] else 'SKIP'}  [{g['category']}]  {args.question}")
        print(f"  {g['reason']}")
        return

    cases = list(CASES) + (list(RELEVANCE_CASES) if args.relevance else [])
    bad = 0
    for q, expect in cases:
        g = decide(q)
        ok = g["ok"] == expect
        bad += 0 if ok else 1
        tag = "PASS" if g["ok"] else "SKIP"
        print(f"{'✓' if ok else '✗'} {tag:4} [{g['category']:11}] {q}")

    total = len(cases)
    print("─" * 72)
    print(f"用例 {total} 条　符合预期 {total - bad} 条　不符合 {bad} 条")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
