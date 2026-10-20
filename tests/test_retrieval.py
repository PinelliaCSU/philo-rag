"""检索与重排回归：冻结评测基线（Hit@k / MRR），并守住重排的可选性。

基线数字来自 2026-10-15 的实跑，改动分块 / 嵌入 / 融合 / 重排后若下降即为退化。
只允许「不低于」：指标上升不算失败。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from philo_rag.evaluate import evaluate
from philo_rag.rerank import _clip_chunk_text, _load_reranker, _resolve_model_path
from philo_rag.theme import theme_search

BASELINE = {"hit@1": 0.9643, "hit@3": 1.0, "hit@8": 1.0, "mrr": 0.9821}


@pytest.fixture(scope="module")
def metrics(store, lex, cfg):
    return evaluate(store, lex, cfg, top_k=8)


def test_hit_at_1_not_below_baseline(metrics):
    assert metrics["hit@1"] >= BASELINE["hit@1"]


def test_hit_at_3_and_8_not_below_baseline(metrics):
    assert metrics["hit@3"] >= BASELINE["hit@3"]
    assert metrics["hit@8"] >= BASELINE["hit@8"]


def test_mrr_not_below_baseline(metrics):
    assert metrics["mrr"] >= BASELINE["mrr"]


def test_eval_covers_the_whole_golden_set(metrics):
    assert metrics["n"] >= 28
    assert all(row["rank"] is not None for row in metrics["rows"]), "存在完全未命中的标注问题"


def test_clip_chunk_text_keeps_sentence_boundary():
    text = "第一句话。第二句话。第三句话。"
    assert _clip_chunk_text(text, 0) == text           # 0 表示不截断
    assert _clip_chunk_text(text, len(text)) == text
    assert _clip_chunk_text(text, 6) == "第一句话。"    # 切在句末
    assert _clip_chunk_text(text, 3) == "第一句"        # 窗口内没有句末，就按窗口截


def test_resolve_model_path_handles_relative_remote_and_empty(tmp_path):
    (tmp_path / "models" / "m").mkdir(parents=True)
    assert _resolve_model_path("models/m", tmp_path) == str(tmp_path / "models" / "m")
    assert _resolve_model_path("BAAI/bge-reranker-v2-m3", tmp_path) == "BAAI/bge-reranker-v2-m3"
    assert _resolve_model_path("models/m", None) == "models/m"
    assert _resolve_model_path("", tmp_path) == ""


def test_reranker_available_when_model_is_shipped(cfg):
    resolved = _resolve_model_path(
        str(cfg.get("retrieval", {}).get("rerank_model", "")), cfg.get("_root")
    )
    if not resolved or not Path(resolved).exists():
        pytest.skip(f"重排模型未下载：{resolved}")
    assert _load_reranker(cfg) is not None


@pytest.mark.parametrize("topic", ["马克思", "精神分析", "康德"])
def test_theme_search_returns_structural_context(topic, store, lex, cfg):
    """范围查询的召回结构。"""
    res = theme_search(store, lex, topic, cfg)
    assert res["context"] and res["context_chars"] > 0
    assert res["units"], f"{topic} 未聚合出任何单元"
    assert res["units_all"] and res["units_all"][0]["total"] > 0
    assert res["counts"]["direct"] > 0, f"{topic} 的直接命中数为 0"
