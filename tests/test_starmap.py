"""星图数据（scripts/build_starmap.py → philo_rag/web/data/starmap.json）。

星图的失败方式很安静：节点少一个、坐标越界、边不剪枝，界面照样能画出来，
只是「一次提问点亮半张图」。所以把设计文档里的四个硬指标钉成断言。
"""
from __future__ import annotations

import json

import pytest

from philo_rag.server import _STARMAP_PATH


@pytest.fixture(scope="module")
def payload() -> dict:
    assert _STARMAP_PATH.is_file(), "先运行 python scripts/build_starmap.py"
    return json.loads(_STARMAP_PATH.read_text(encoding="utf-8"))


def test_node_count_matches_lexicon_concepts(payload, lex):
    assert len(payload["nodes"]) == 183
    assert len(payload["nodes"]) == len(lex.concepts), "星图节点必须覆盖全部词典概念"


def test_every_node_is_a_queryable_concept(payload, lex):
    """星图上不允许出现不可查询的装饰节点。

    前端只画 nodes，所以「节点 = 词典概念」这条在数据层钉死：
    每个 id 都必须能在词典里查到（/api/concept?term= 也就能查到）。
    """
    unknown = [n["id"] for n in payload["nodes"] if n["id"] not in lex.concepts]
    assert not unknown, f"星图里出现了不可查询的节点：{unknown[:5]}"
    for node in payload["nodes"]:
        card = lex.concept_card(node["id"])
        assert card is not None, node["id"]
        assert card["name"] == node["id"]


def test_coordinates_are_normalized(payload):
    for node in payload["nodes"]:
        assert -1.0 <= node["x"] <= 1.0, node
        assert -1.0 <= node["y"] <= 1.0, node


def test_edges_are_pruned(payload):
    nodes, edges = payload["nodes"], payload["edges"]
    assert edges, "剪枝后仍要保留骨架边"
    assert len(edges) <= len(nodes) * 3
    names = {n["id"] for n in nodes}
    for edge in edges:
        assert edge["source"] != edge["target"], "不能有自环"
        assert edge["source"] in names and edge["target"] in names


def test_payload_carries_lexicon_fingerprints(payload, store):
    hashes = payload["lexicon_hashes"]
    assert hashes["concepts"] and hashes["philosophers"]
    assert hashes == {
        k: store.manifest["lexicon_hashes"][k] for k in ("concepts", "philosophers")
    }, "词典改过就要重跑 build_starmap.py"
    assert payload["layout"] == "spring"
    assert payload["seed"] == 20261018
    assert payload["axes"] == ["场域论", "本体论", "认识论", "目的论"]


def test_nodes_expose_display_metadata(payload):
    node = next(n for n in payload["nodes"] if n["id"] == "大他者")
    assert node["hits"] > 0
    assert isinstance(node["aliases"], list)
    assert {"id", "x", "y", "hits", "school", "era", "aliases"} <= set(node)
