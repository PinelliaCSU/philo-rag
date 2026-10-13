# -*- coding: utf-8 -*-
"""问题闸门的质量巡检。

用法：
    python scripts/check_gate.py                      # 跑内置用例集，核对放行/拦截
    python scripts/check_gate.py "你的问题"           # 只看某条问题的裁决
    python scripts/check_gate.py --strict "问题"      # 按 strict 档裁决

为什么要单独巡检：闸门的取舍是「宁可放行模糊问题，也不误杀真正的哲学提问」。
内置用例分两组——**应当放行**的哲学提问与**应当拦截**的非知识性问题；
扩充拦截模式或调整词典后跑一遍，就能看出有没有把哲学问题误伤成跳过。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.gate import check_question  # noqa: E402
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


def main() -> None:
    ap = argparse.ArgumentParser(description="问题闸门巡检")
    ap.add_argument("question", nargs="?", help="只检查这一条问题")
    ap.add_argument("--strict", action="store_true", help="按 strict 档裁决")
    args = ap.parse_args()

    lex = Lexicon(
        ROOT / "lexicon" / "philosophers.yaml",
        ROOT / "lexicon" / "concepts.yaml",
        ROOT / "lexicon" / "哲学大纲_体系.yaml",
    )
    cfg = {"gate": {"enabled": True, "min_chars": 4, "strict": args.strict}}

    if args.question:
        g = check_question(args.question, lex, cfg)
        print(f"{'PASS' if g['ok'] else 'SKIP'}  [{g['category']}]  {args.question}")
        print(f"  {g['reason']}")
        return

    bad = 0
    for q, expect in CASES:
        g = check_question(q, lex, cfg)
        ok = g["ok"] == expect
        bad += 0 if ok else 1
        tag = "PASS" if g["ok"] else "SKIP"
        print(f"{'✓' if ok else '✗'} {tag:4} [{g['category']:9}] {q}")

    total = len(CASES)
    print("─" * 72)
    print(f"用例 {total} 条　符合预期 {total - bad} 条　不符合 {bad} 条")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
