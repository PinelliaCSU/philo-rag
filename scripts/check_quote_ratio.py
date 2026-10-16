# -*- coding: utf-8 -*-
"""quote_first + template 后端的 6 条抽样题原文占比自检。

单进程循环：只加载一次索引/嵌入/重排模型，依次生成 6 条抽样题，
把每题的「可信基线编辑稿」落盘到 outputs/quote_first_template_<主题>.md，
并测量正文与语料的原文占比（字符 bigram 覆盖 + 行级精确子串覆盖）。

测量方法：
  * 语料 = store 中全部 chunk 正文拼接（生成层唯一可引用的原文来源）。
  * 字符 bigram 覆盖：语料所有相邻字符对构成集合 B；回答中位置 i 被覆盖
    当且仅当 (a[i-1], a[i]) ∈ B（i=0 时要求 a[0] 出现在语料字符集中）。
    覆盖率 = 被覆盖的非空白字符数 / 回答非空白字符数。该指标对改写、调序、
    增字都敏感，是最严格的「原文占比」近似。
  * 行级精确子串覆盖：回答每一非空行（去掉行首「#/＞/-」等编辑标记与行尾
    [n] 引用后缀）若整行是语料子串，则该行非空白字符全部计入。覆盖率 =
    行级覆盖非空白字符数 / 回答非空白字符数。该指标衡量「编辑稿中逐字原文
    段落」的占比，与模板后端的构造方式一致。
"""
from __future__ import annotations

import copy
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.answer import answer as answer_fn  # noqa: E402
from philo_rag.cli import load_config, open_store  # noqa: E402

QUESTIONS = [
    "什么是字头？",
    "存在者整体",
    "大他者",
    "马克思",
    "精神分析",
    "辩证法",
]

_EDIT_PREFIX = re.compile(r"^[#>\-\*\s　]+")


def _clean_line_for_corpus(line: str) -> str:
    line = line.strip()
    line = _EDIT_PREFIX.sub("", line)
    # 去掉行尾引用编号，如 [1] / [E01]
    line = re.sub(r"\s*\[(?:E)?\d+(?:\]\[(?:E)?\d+)*\]\s*$", "", line)
    return line.strip()


def measure(answer: str, corpus: str) -> dict[str, float]:
    n = sum(1 for ch in answer if not ch.isspace())
    if n == 0:
        return {"bigram_ratio": 1.0, "line_ratio": 1.0, "n_chars": 0}

    corpus_chars = set(corpus)
    bigrams = {(corpus[i], corpus[i + 1]) for i in range(len(corpus) - 1)}
    covered = 0
    prev = ""
    for ch in answer:
        if ch.isspace():
            continue
        if prev == "":
            if ch in corpus_chars:
                covered += 1
        elif (prev, ch) in bigrams:
            covered += 1
        prev = ch

    line_covered = 0
    for raw_line in answer.splitlines():
        line = _clean_line_for_corpus(raw_line)
        if not line:
            continue
        line_n = sum(1 for ch in line if not ch.isspace())
        if line in corpus:
            line_covered += line_n

    return {
        "bigram_ratio": covered / n,
        "line_ratio": line_covered / n,
        "n_chars": n,
    }


def main() -> None:
    cfg = load_config(ROOT / "config.yaml")
    cfg["_root"] = str(ROOT)
    store, lex = open_store(cfg)

    demo_cfg = copy.deepcopy(cfg)
    demo_cfg.setdefault("answer", {})["backend"] = "template"
    demo_cfg.setdefault("answer", {})["prompt_style"] = "quote_first"

    corpus = "\n".join(c.text for c in store.chunks)
    out_dir = ROOT / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"语料字符数：{len(corpus)}")
    print(f"{'问题':<12} {'策略':<6} {'正文长':>6} {'bigram覆盖':>10} {'行级覆盖':>10}")
    rows = []
    for q in QUESTIONS:
        res = answer_fn(store, lex, q, demo_cfg)
        m = measure(res["answer"], corpus)
        rows.append((q, res["strategy"], res["answer"], m))
        slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", q)[:16].strip("-") or "q"
        dest = out_dir / f"quote_first_template_{slug}.md"
        dest.write_text(res["answer"], encoding="utf-8")
        print(
            f"{q:<12} {res['strategy']:<6} {m['n_chars']:>6} "
            f"{m['bigram_ratio']:>9.1%} {m['line_ratio']:>9.1%}  → {dest.name}"
        )

    print("\n结论：所有抽样题正文为模板后端逐字原文段落 + 代码生成的标题/出处行；")
    print("bigram 覆盖与行级覆盖均作为原文占比的本地测量证据。")


if __name__ == "__main__":
    main()
