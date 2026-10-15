# -*- coding: utf-8 -*-
"""quote_first + api 后端：6 条抽样题单进程循环，落盘 outputs/quote_first_<主题>.md。

只加载一次索引/嵌入/重排模型；每题的 API 调用在同一个进程内依次完成。
输出文件由 output.write 确定性渲染（含「术语注解」一节与引用来源）。
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
from philo_rag.output import write as output_write  # noqa: E402

QUESTIONS = [
    "什么是字头？",
    "存在者整体",
    "大他者",
    "马克思",
    "精神分析",
    "辩证法",
]


def main() -> None:
    cfg = load_config(ROOT / "config.yaml")
    cfg["_root"] = str(ROOT)
    store, lex = open_store(cfg)

    api_cfg = copy.deepcopy(cfg)
    api_cfg.setdefault("answer", {})["backend"] = "api"
    api_cfg.setdefault("answer", {})["prompt_style"] = "quote_first"

    out_dir = ROOT / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    for q in QUESTIONS:
        res = answer_fn(store, lex, q, api_cfg)
        slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", q)[:16].strip("-") or "q"
        dest = out_dir / f"quote_first_{slug}.md"
        output_write("answer", res, api_cfg, dest=dest)
        n_ann = len(res.get("annotations") or [])
        n_sec = len(res.get("sections") or [])
        print(
            f"{q}\tstrategy={res['strategy']}\tanswer={len(res['answer'])}字"
            f"\tsections={n_sec}\tannotations={n_ann}\t→ {dest.name}"
        )


if __name__ == "__main__":
    main()
