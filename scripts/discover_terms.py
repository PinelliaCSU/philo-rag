"""候选术语发现：从语料里挖出「还没进词典」的高频术语，产出人审清单。

为什么需要它：注解（概念/理论家标签）全部来自 lexicon/*.yaml，词典之外的内容
在检索里等于不存在——「问题区域」的上限就是词典的覆盖。人工在 200 万字里找术语
不现实，这里做**确定性**的机器初筛：

  1. jieba 切词 → 统计 2–6 字的候选（词性 n / nz / vn，按孤立词判定）；
  2. 排除已在词典中的标准名与别名；排除文档频率过高的通用词；
  3. 打分 = 频次 × log(1 + 覆盖单元数)：既高频、又跨多个单元复现的才可能是术语；
  4. 输出 YAML 骨架（含频次 / 覆盖单元 / 例句），供人工确认后并入 concepts.yaml。

清单是**建议**不是事实：只写进 outputs/，不会自动改动词典——注解进词典前必须人审，
否则「给语料加注解」只会变成「给检索加噪声」。
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, ".")

from philo_rag.cli import get_lexicon, load_config
from philo_rag.schema import Chunk

# 候选词性：名词 / 专名 / 动名词。孤立成词判定（对单个词再做一次词性标注）。
ALLOW_POS = ("n", "nz", "vn", "nr", "ns", "nt")
MIN_CHARS = 2
MAX_CHARS = 6


def _load_chunks(store_dir: Path) -> list[Chunk]:
    with open(store_dir / "chunks.jsonl", encoding="utf-8") as f:
        return [Chunk.from_dict(json.loads(line)) for line in f if line.strip()]


def _known_phrases(lex) -> set[str]:
    """词典里已有的全部词面（标准名 + 别名），候选命中即跳过。"""
    known: set[str] = set()
    for table in (lex.concepts, lex.philosophers):
        for name, info in table.items():
            known.add(name)
            known.update(str(a) for a in (info.get("aliases") or []))
    for theme in lex.themes:
        known.add(str(theme.get("name", "")))
        known.update(str(a) for a in (theme.get("aliases") or []))
    known.discard("")
    return known


def _cjk_only(token: str) -> bool:
    return all("\u4e00" <= ch <= "\u9fff" for ch in token)


def _pos_of(token: str, posseg) -> str:
    pair = next(iter(posseg.cut(token)), None)
    return pair.flag if pair else ""


def main() -> None:
    ap = argparse.ArgumentParser(description="发现词典之外的候选术语（人审清单）")
    ap.add_argument("--top", type=int, default=200, help="输出候选数（默认 200）")
    ap.add_argument("--min-freq", type=int, default=8, help="最低出现次数（默认 8）")
    ap.add_argument("--min-units", type=int, default=3, help="最低覆盖单元数（默认 3）")
    ap.add_argument("--max-df-ratio", type=float, default=0.30,
                    help="文档频率上限：超过该比例的块都出现的词视为通用词（默认 0.30）")
    ap.add_argument("--out", default="outputs/候选术语.yaml", help="输出 YAML 路径")
    args = ap.parse_args()

    import jieba
    import jieba.posseg as posseg

    jieba.setLogLevel(60)

    cfg = load_config(Path("config.yaml"))
    lex = get_lexicon(cfg)
    chunks = _load_chunks(Path(cfg["doc"]["store_dir"]))
    known = _known_phrases(lex)

    freq: collections.Counter[str] = collections.Counter()
    df: collections.Counter[str] = collections.Counter()
    units: dict[str, set[str]] = collections.defaultdict(set)
    sample: dict[str, str] = {}

    for c in chunks:
        unit = c.unit_code() or "（前言）"
        seen_here: set[str] = set()
        for tok in jieba.lcut(c.text):
            if not (MIN_CHARS <= len(tok) <= MAX_CHARS) or not _cjk_only(tok):
                continue
            if tok in known:
                continue
            freq[tok] += 1
            seen_here.add(tok)
            units[tok].add(unit)
            if tok not in sample:
                i = c.text.find(tok)
                sample[tok] = c.text[max(0, i - 12): i + len(tok) + 12].replace("\n", " ")
        for tok in seen_here:
            df[tok] += 1

    corpus = max(len(chunks), 1)
    scored: list[tuple[float, str]] = []
    for token, n in freq.items():
        if n < args.min_freq or len(units[token]) < args.min_units:
            continue
        if df[token] / corpus > args.max_df_ratio:
            continue
        if _pos_of(token, posseg) not in ALLOW_POS:
            continue
        scored.append((n * math.log(1 + len(units[token])), token))
    scored.sort(key=lambda x: (-x[0], x[1]))
    picked = [tok for _score, tok in scored[: args.top]]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# 候选术语（机器发现，未人审）：确认后手工并入 lexicon/concepts.yaml",
        "# 字段：name 候选名 / freq 出现次数 / units 覆盖单元数 / context 首次出现例句",
        "candidates:",
    ]
    for tok in picked:
        lines.append(f"  - name: {tok}")
        lines.append(f"    freq: {freq[tok]}")
        lines.append(f"    units: {len(units[tok])}")
        ctx = sample.get(tok, "").replace('"', "＂")
        lines.append(f"    context: \"{ctx}\"")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # 反向清单：词典里配了别名、但全书从未出现的词条（供词典治理参考）
    # 只报含中文的词面：外文别名（Kant、Adorno…）在中文语料里不出现是正常现象
    corpus_text = "\n".join(c.text for c in chunks)
    missed = sorted(
        a for a in known
        if a not in corpus_text and any("\u4e00" <= ch <= "\u9fff" for ch in a)
    )

    print(f"语料 {corpus} 块 · 词典词面 {len(known)} 个 · 候选 {len(picked)} 个 → {out}")
    print("\n前 20 个候选：")
    for tok in picked[:20]:
        print(f"  {tok:8s} 频次 {freq[tok]:4d} · 单元 {len(units[tok])} · {sample.get(tok, '')[:40]}")
    if missed:
        print(f"\n词典中从未出现的中文词面 {len(missed)} 个（可能是笔误或无用别名）：")
        print("  " + "、".join(missed[:40]) + (" …" if len(missed) > 40 else ""))


if __name__ == "__main__":
    main()
