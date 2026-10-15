r"""引用核对层命令行入口 + 基线报告。

用法（在项目根目录运行）：
    python scripts/check_grounded.py [文件.md ...] [--corpus data/哲学大纲_规范化_全集.txt]
不带文件参数时，默认核对 outputs\*.md 下的全部回答。

输出：
    每句判定（G=grounded / P=paraphrase / U=ungrounded / S=skipped）、
    每类计数与率、ungrounded 句清单（含原句）、跨文件基线表。
"""
from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from philo_rag.verify import (  # noqa: E402
    CorpusVerifier,
    SentenceVerdict,
    TextReport,
    Thresholds,
    summary_table,
)

_VERDICT_MARK = {"grounded": "G", "paraphrase": "P", "ungrounded": "U", "skipped": "S"}


def _fmt_rate(x: float) -> str:
    return f"{x * 100:6.2f}%"


def _print_sentence_rows(sentences: list[SentenceVerdict]) -> None:
    print(f"  {'#':>3}  V  {'cov':>6}  {'match':>6}  {'ngram':>6}  句子")
    for s in sentences:
        mark = _VERDICT_MARK[s.verdict]
        snippet = s.raw.replace("\n", " ")[:46]
        print(f"  {s.index:>3}  {mark}  {s.coverage:6.2f}  {s.match_len:>6}  "
              f"{s.ngram_overlap:6.2f}  {snippet}")


def _print_ungrounded(label: str, sentences: list[SentenceVerdict]) -> None:
    un = [s for s in sentences if s.verdict == "ungrounded"]
    if un:
        print(f"  --- {label} ungrounded 句清单（含原句）---")
        for s in un:
            print(f"  [{s.index}] {s.raw.strip()}")


def print_report(rep: TextReport, show_sentences: bool = True) -> None:
    print(f"\n{'=' * 78}\n{rep.source}\n{'=' * 78}")
    if show_sentences:
        _print_sentence_rows(rep.sentences)
    c = rep.counts()
    r = rep.rates()
    n = len(rep.counted)
    print(f"  --- 正文计数（共 {n} 句判定，另有 {c['skipped']} 句跳过）---")
    print(f"  grounded   {c['grounded']:>4}  {_fmt_rate(r['grounded'])}")
    print(f"  paraphrase {c['paraphrase']:>4}  {_fmt_rate(r['paraphrase'])}")
    print(f"  ungrounded {c['ungrounded']:>4}  {_fmt_rate(r['ungrounded'])}")
    _print_ungrounded("正文", rep.sentences)

    if rep.has_glossary:
        gc = rep.glossary_counts()
        gr = rep.glossary_rates()
        gn = len(rep.glossary_counted)
        print(f"  --- 术语注解计数（共 {gn} 句判定，另有 {gc['skipped']} 句跳过）---")
        print(f"  grounded   {gc['grounded']:>4}  {_fmt_rate(gr['grounded'])}")
        print(f"  paraphrase {gc['paraphrase']:>4}  {_fmt_rate(gr['paraphrase'])}")
        print(f"  ungrounded {gc['ungrounded']:>4}  {_fmt_rate(gr['ungrounded'])}")
        if show_sentences:
            print("  --- 术语注解逐句判定 ---")
            _print_sentence_rows(rep.glossary_sentences)
        _print_ungrounded("术语注解", rep.glossary_sentences)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="要核对的 .md 文件；缺省为 outputs\\*.md")
    ap.add_argument("--corpus", default="data/哲学大纲_规范化_全集.txt")
    ap.add_argument("--ngram-n", type=int, default=4)
    ap.add_argument("--grounded-cover", type=float, default=0.80)
    ap.add_argument("--grounded-min-chars", type=int, default=10)
    ap.add_argument("--para-cover", type=float, default=0.50)
    ap.add_argument("--para-ngram", type=float, default=0.50)
    ap.add_argument("--min-sentence-chars", type=int, default=6)
    ap.add_argument("--no-sentences", action="store_true", help="不逐句打印")
    ap.add_argument("--json", action="store_true", help="末尾附 JSON 基线表")
    args = ap.parse_args()

    files = args.files or sorted(glob.glob(str(_ROOT / "outputs" / "*.md")))
    files = [f for f in files if Path(f).suffix.lower() == ".md"]
    if not files:
        print("没有找到要核对的 .md 文件。", file=sys.stderr)
        raise SystemExit(1)

    th = Thresholds(
        ngram_n=args.ngram_n,
        grounded_cover=args.grounded_cover,
        grounded_min_chars=args.grounded_min_chars,
        para_cover=args.para_cover,
        para_ngram_overlap=args.para_ngram,
        min_sentence_chars=args.min_sentence_chars,
    )

    print("阈值参数表")
    print(f"  ngram_n             {th.ngram_n}")
    print(f"  grounded_cover      {th.grounded_cover}")
    print(f"  grounded_min_chars  {th.grounded_min_chars}")
    print(f"  para_cover          {th.para_cover}")
    print(f"  para_ngram_overlap  {th.para_ngram_overlap}")
    print(f"  min_sentence_chars  {th.min_sentence_chars}")

    verifier = CorpusVerifier(args.corpus, thresholds=th)
    print(f"语料已加载：{args.corpus}（{len(verifier.text)} 字符）")

    reports = [verifier.verify_markdown(f) for f in files]
    for rep in reports:
        print_report(rep, show_sentences=not args.no_sentences)

    rows = summary_table(reports)
    print(f"\n{'=' * 78}\n基线表（跨文件汇总：正文 / 术语注解）\n{'=' * 78}")
    print(f"  {'文件':<40} {'正文总':>5} {'G':>4} {'P':>4} {'U':>4} {'正文G率':>7} "
          f"{'注解总':>5} {'注解G':>5} {'注解P':>5} {'注解U':>5} {'注解G率':>7}")
    for row in rows:
        name = Path(row["source"]).name
        if row["has_glossary"]:
            g = (f"{row['glossary_total']:>5} {row['glossary_grounded']:>5} "
                 f"{row['glossary_paraphrase']:>5} {row['glossary_ungrounded']:>5} "
                 f"{_fmt_rate(row['glossary_grounded_rate']):>7}")
        else:
            g = f"{'-':>5} {'-':>5} {'-':>5} {'-':>5} {'-':>7}"
        print(f"  {name:<40} {row['total']:>5} {row['grounded']:>4} "
              f"{row['paraphrase']:>4} {row['ungrounded']:>4} "
              f"{_fmt_rate(row['grounded_rate']):>7} {g}")

    if args.json:
        import json
        print("\nJSON_BASELINE " + json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
