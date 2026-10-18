# -*- coding: utf-8 -*-
"""索引构建（维护脚本，不是用户 CLI）。

唯一运行时入口是 Web 服务（`python -m philo_rag`）；这个脚本只做一件事：
把语料重新切块、打注解、算向量，写回 `store/`。改了语料或词典后跑它，
服务下次启动即读到新索引。

用法：
    python scripts/build_index.py               # 用现有 data/哲学大纲_规范化_全集.txt 重建索引
    python scripts/build_index.py --prepare     # 先从原始语料重新清洗，再重建索引
    python scripts/build_index.py --config my.yaml
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from philo_rag.bootstrap import get_lexicon, load_config  # noqa: E402
from philo_rag.index import Store  # noqa: E402


def _rule(title: str) -> None:
    print(f"\n{'=' * 4} {title} {'=' * 4}")


def main() -> None:
    ap = argparse.ArgumentParser(description="重建索引")
    ap.add_argument("--config", default=str(ROOT / "config.yaml"))
    ap.add_argument("--prepare", action="store_true", help="先从原始语料清洗出规范全集")
    ap.add_argument("--no-embed", action="store_true", help="跳过向量编码（只重建字面索引）")
    args = ap.parse_args()

    cfg = load_config(Path(args.config))
    doc = cfg["doc"]

    if args.prepare:
        from philo_rag.prepare import prepare

        info = prepare(
            Path(doc["raw"]), Path(doc["source"]),
            strip_annotations=bool(doc.get("strip_annotations", False)),
            skip_front_matter=bool(doc.get("skip_front_matter", True)),
        )
        _rule("采集与清洗完成")
        for k, v in info.items():
            print(f"  {k:10s} {v}")

    import jieba

    jieba.setLogLevel(logging.ERROR)
    lex = get_lexicon(cfg)
    store = Store.build(cfg, lex)
    store.save(Path(doc["store_dir"]))
    _rule("索引构建完成")
    for k, v in store.manifest.items():
        print(f"  {k:20s} {v}")


if __name__ == "__main__":
    main()
