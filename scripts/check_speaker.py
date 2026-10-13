# -*- coding: utf-8 -*-
"""引文说话人归因的质量巡检。

用法：
    python scripts/check_speaker.py            # 全量统计 + 抽样 20 条
    python scripts/check_speaker.py -n 40      # 抽样 40 条
    python scripts/check_speaker.py --all      # 打印全部归因结果（人工核对）

为什么要单独巡检：说话人字段走的是「人名紧邻引文 + 同句内有引述标记」的严格
规则，宁可置空也不误配。语料里绝大多数引文是举例、假想对话或整理者旁述，
本身没有归属，因此覆盖率天然偏低（约 2%）。这个脚本用来确认覆盖率没有异常
波动，并在词典扩写后复查有没有新的误配。
"""
from __future__ import annotations

import argparse
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.ingest import extract_quotes, find_speaker, load_segments  # noqa: E402
from philo_rag.lexicon import Lexicon  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="引文说话人归因巡检")
    ap.add_argument("-n", type=int, default=20, help="抽样条数")
    ap.add_argument("--all", action="store_true", help="打印全部归因结果")
    ap.add_argument("--seed", type=int, default=11, help="抽样随机种子")
    args = ap.parse_args()

    lex = Lexicon(
        ROOT / "lexicon" / "philosophers.yaml",
        ROOT / "lexicon" / "concepts.yaml",
        ROOT / "lexicon" / "哲学大纲_体系.yaml",
    )
    segments = load_segments(ROOT / "data" / "哲学大纲_规范化_全集.txt")
    # 与建索引时保持一致：在整篇文本上抽取，引号配对才不会因分段而翻转
    full = "\n".join(text for _, text in segments)

    quotes = extract_quotes(full, min_chars=12)
    rows = [(inner, s, e, find_speaker(full, s, e, lex)) for inner, s, e in quotes]
    named = [r for r in rows if r[3]]

    print(f"引文总数 {len(rows)}　有说话人 {len(named)}　占比 {len(named) / max(len(rows), 1):.2%}")
    print("说话人分布：" + "　".join(f"{k}×{v}" for k, v in Counter(r[3] for r in named).most_common()))

    picked = named if args.all else random.Random(args.seed).sample(
        named, min(args.n, len(named)))
    for inner, s, e, sp in picked:
        print("─" * 72)
        print(f"前文 …{full[max(0, s - 34):s]}".replace("\n", "⏎"))
        print(f"引文 「{inner[:60]}」")
        print(f"→ 说话人 = {sp}")


if __name__ == "__main__":
    main()
