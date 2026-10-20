"""词典数据约束：同表词面唯一、引用完整、条条有语料实据。

为什么要单独钉死：块注解全部来自 `lexicon/*.yaml`，而同一词面被两个词条登记时，
只有先注册者能命中（`lexicon._iter_alias_hits` 按「长别名优先 + 占用区间」扫描）。
这类冲突不报错、不崩溃，只会静默丢注解：实测「意识形态批判」全书 24 次出现全被标成
「意识形态」，「二字头」98 块全部标成「字头」。零证据条目同理——词典看起来更全，
检索里却永远不命中。改词典后跑本文件即可。
"""
from __future__ import annotations

import collections
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
LEXICON = ROOT / "lexicon"
CORPUS = ROOT / "data" / "哲学大纲_规范化_全集.txt"


def _table(filename: str, key: str) -> list[dict]:
    data = yaml.safe_load((LEXICON / filename).read_text(encoding="utf-8")) or {}
    return list(data.get(key) or [])


def _forms(entry: dict) -> list[str]:
    """词条登记的全部词面：标准名 + 别名。"""
    return [str(entry["name"]), *(str(a) for a in entry.get("aliases") or [] if str(a))]


@pytest.fixture(scope="module")
def tables() -> dict[str, list[dict]]:
    return {
        "philosophers": _table("philosophers.yaml", "philosophers"),
        "concepts": _table("concepts.yaml", "concepts"),
        "themes": _table("themes.yaml", "themes"),
        "units": _table("哲学大纲_体系.yaml", "units"),
    }


def test_each_surface_form_has_one_owner(tables: dict[str, list[dict]]):
    for key in ("philosophers", "concepts", "themes"):
        owners: dict[str, set[str]] = collections.defaultdict(set)
        for entry in tables[key]:
            for form in _forms(entry):
                owners[form].add(str(entry["name"]))
        clashes = {form: sorted(who) for form, who in owners.items() if len(who) > 1}
        assert not clashes, f"{key} 的同一词面被多个词条登记（只有先注册者能命中）：{clashes}"


def test_concepts_point_to_known_philosophers(tables: dict[str, list[dict]]):
    known = {str(e["name"]) for e in tables["philosophers"]}
    dangling = sorted(
        {str(e["philosopher"]) for e in tables["concepts"] if e.get("philosopher")} - known
    )
    assert not dangling, f"concepts.philosopher 指向不存在的理论家：{dangling}"


def test_themes_reference_existing_anchors(tables: dict[str, list[dict]]):
    known = {
        "philosophers": {str(e["name"]) for e in tables["philosophers"]},
        "concepts": {str(e["name"]) for e in tables["concepts"]},
        "units": {str(u["code"]) for u in tables["units"]},
    }
    for theme in tables["themes"]:
        for field, names in known.items():
            missing = sorted({str(x) for x in theme.get(field) or []} - names)
            assert not missing, f"主题「{theme['name']}」的 {field} 引用了不存在的锚点：{missing}"


@pytest.mark.skipif(not CORPUS.exists(), reason="语料不在工作区（data/ 被删或未 prepare）")
def test_every_entry_has_corpus_evidence(tables: dict[str, list[dict]]):
    """每条理论家 / 概念至少有一个词面在语料里出现过。"""
    corpus = CORPUS.read_text(encoding="utf-8")
    dead = {
        key: [str(e["name"]) for e in tables[key] if not any(f in corpus for f in _forms(e))]
        for key in ("philosophers", "concepts")
    }
    assert not any(dead.values()), f"零语料证据的条目（应移除或补别名）：{dead}"
