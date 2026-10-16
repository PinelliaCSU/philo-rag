"""验证范围查询结果结构在优化后保持一致。"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from philo_rag.cli import get_lexicon, load_config
from philo_rag.index import Store
from philo_rag.theme import theme_search


def main():
    cfg = load_config(Path("config.yaml"))
    lex = get_lexicon(cfg)
    store = Store.load(Path(cfg["doc"]["store_dir"]), lex)

    for q in ["马克思", "精神分析", "康德"]:
        res = theme_search(store, lex, q, cfg)
        a = res["anchors"]
        c = res["counts"]
        print(f"=== {q} ===")
        print(f"  seed_mode: {res['seed_mode']}")
        print(f"  anchors: phil={a['philosophers']}, conc={a['concepts']}")
        print(f"  counts: meta={c['meta']}, literal={c['literal']}, direct={c['direct']}, extended={c['extended']}")
        print(f"  units: {len(res['units'])} kept, {len(res['units_all'])} total")
        print(f"  context_chars: {res['context_chars']}")
        print(f"  lineage: {res['lineage'][:3]}")
        print(f"  eras: {res['eras'][:3]}")
        # 验证 context 非空
        assert res["context"], f"{q} context is empty!"
        assert res["context_chars"] > 0, f"{q} context_chars is 0!"
        assert len(res["units"]) > 0, f"{q} no units!"
        print("  [OK] context and units present")
        print()


if __name__ == "__main__":
    main()
