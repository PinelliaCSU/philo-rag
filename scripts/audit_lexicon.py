"""词典数据巡检：词面冲突、引用完整性、零证据条目与死别名。

用法（项目根目录运行）：

    python scripts/audit_lexicon.py             # 汇总 + 明细
    python scripts/audit_lexicon.py --limit 0   # 明细不截断

为什么要单独巡检：块注解全部来自 `lexicon/*.yaml`，三类问题都不会报错，只会静默降低精度——
  1. **词面冲突**：同一词面被两个词条登记时，只有先注册者能命中
     （`lexicon._iter_alias_hits` 按「长别名优先 + 占用区间」扫描），后者永远拿不到注解；
  2. **零证据条目**：标准名与全部别名在语料里 0 次命中，词典看起来比实际更全；
  3. **死别名**：个别通用词别名（「人为」「伪」）会把大量无关块误标成某个概念。

退出码：存在词面冲突 / 悬空引用 / 零证据条目时为 1，便于接进巡检或 CI。
"""
from __future__ import annotations

import argparse
import collections
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from philo_rag.cli import load_config  # noqa: E402

TABLES = (
    ("philosophers", "philosophers.yaml"),
    ("concepts", "concepts.yaml"),
    ("themes", "themes.yaml"),
)


def _load(filename: str, key: str) -> list[dict]:
    data = yaml.safe_load((ROOT / "lexicon" / filename).read_text(encoding="utf-8")) or {}
    return list(data.get(key) or [])


def _forms(entry: dict) -> list[str]:
    return [str(entry["name"]), *(str(a) for a in (entry.get("aliases") or []) if str(a))]


def _print(title: str, items: list[str], limit: int) -> None:
    print(f"\n{title}：{len(items)}")
    shown = items if limit <= 0 else items[:limit]
    for item in shown:
        print("   " + item)
    if limit > 0 and len(items) > limit:
        print(f"   …（其余 {len(items) - limit} 条用 --limit 0 查看）")


def main() -> int:
    ap = argparse.ArgumentParser(description="词典数据巡检")
    ap.add_argument("--limit", type=int, default=20, help="每类明细打印条数，0 = 不限")
    args = ap.parse_args()

    cfg = load_config(ROOT / "config.yaml")
    corpus_path = ROOT / str(cfg["doc"]["source"])
    if not corpus_path.exists():
        print(f"语料不存在：{corpus_path}（先跑 prepare 或修正 config.doc.source）")
        return 2
    corpus = corpus_path.read_text(encoding="utf-8")

    tables = {key: _load(fn, key) for key, fn in TABLES}
    units = _load("哲学大纲_体系.yaml", "units")
    print(f"语料 {len(corpus):,} 字 · 单元 {len(units)} · "
          + " · ".join(f"{k} {len(v)}" for k, v in tables.items()))

    # ---- 1. 词面冲突 ----
    conflicts: list[str] = []
    for key, _fn in TABLES:
        owners: dict[str, set[str]] = collections.defaultdict(set)
        for entry in tables[key]:
            for form in _forms(entry):
                owners[form].add(str(entry["name"]))
        for form, who in owners.items():
            if len(who) > 1:
                conflicts.append(f"{key}: 「{form}」← " + " / ".join(sorted(who)))

    # ---- 2. 引用完整性 ----
    known_phil = {str(e["name"]) for e in tables["philosophers"]}
    known_con = {str(e["name"]) for e in tables["concepts"]}
    known_units = {str(u["code"]) for u in units}
    dangling: list[str] = []
    for entry in tables["concepts"]:
        if entry.get("philosopher") and entry["philosopher"] not in known_phil:
            dangling.append(f"concepts: {entry['name']} → {entry['philosopher']}")
    for theme in tables["themes"]:
        for field, known in (("philosophers", known_phil), ("concepts", known_con), ("units", known_units)):
            for ref in theme.get(field) or []:
                if str(ref) not in known:
                    dangling.append(f"themes: {theme['name']}.{field} → {ref}")

    # ---- 3. 零证据条目 与 4. 死别名 ----
    dead_entries: list[str] = []
    redundant: list[str] = []
    synonyms: list[str] = []
    for key, _fn in TABLES[:2]:
        for entry in tables[key]:
            forms = _forms(entry)
            alive = [f for f in forms if f in corpus]
            if not alive:
                dead_entries.append(f"{key}: {entry['name']}")
                continue
            for alias in (str(a) for a in entry.get("aliases") or []):
                if alias in corpus:
                    continue
                if any(f in alias and f != alias for f in alive):
                    redundant.append(f"{key}: {entry['name']} · {alias}（已被更短词面覆盖）")
                else:
                    synonyms.append(f"{key}: {entry['name']} · {alias}")

    _print("① 词面冲突（先注册者独占命中，必须修）", conflicts, args.limit)
    _print("② 悬空引用（指向不存在的条目，必须修）", dangling, args.limit)
    _print("③ 零语料证据条目（建议移除或补别名）", dead_entries, args.limit)
    _print("④ 死别名 · 冗余超集（可删，注解能力零损失）", redundant, args.limit)
    _print("⑤ 死别名 · 同义变体（保留：查询侧仍可能命中）", synonyms, args.limit)

    hard = [*conflicts, *dangling, *dead_entries]
    print(f"\n硬问题 {len(hard)} 项：冲突 {len(conflicts)} · 悬空 {len(dangling)} · 零证据 {len(dead_entries)}")
    return 1 if hard else 0


if __name__ == "__main__":
    raise SystemExit(main())
