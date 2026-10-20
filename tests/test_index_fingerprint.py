"""索引一致性护栏（philo_rag/index.py）：分块参数 / 词典指纹。

守护的是「改了配置或词典却忘了重建索引」这类隐性故障：manifest 记录指纹，
加载时比对告警，`manifest_drift()` 可脚本化判定。
"""
from __future__ import annotations

import pytest

from philo_rag.index import chunk_params, lexicon_hashes, manifest_drift


def test_manifest_records_fingerprints(store):
    assert "chunk_params" in store.manifest
    assert {"philosophers", "concepts", "taxonomy", "themes"} <= set(store.manifest["lexicon_hashes"])


def test_shipped_index_matches_current_config_and_lexicon(store, cfg, lex):
    if "chunk_params" not in store.manifest:
        pytest.skip("索引是旧格式（manifest 无指纹）：运行 cli build 重建后本用例生效")
    assert store.check_consistency(cfg, lex) == []


def test_chunk_param_change_is_detected(store, cfg, lex):
    manifest = {**store.manifest, "chunk_params": {**chunk_params(cfg), "max_chars": 123}}
    problems = manifest_drift(manifest, cfg, lex)
    assert any("分块参数已变更" in p and "max_chars" in p for p in problems)


def test_lexicon_change_is_detected(store, cfg, lex):
    manifest = {
        **store.manifest,
        "lexicon_hashes": {**lexicon_hashes(lex), "concepts": "deadbeef00000000"},
    }
    problems = manifest_drift(manifest, cfg, lex)
    assert any("词典文件已变更" in p and "concepts" in p for p in problems)


def test_legacy_manifest_without_fingerprints_is_reported(store, cfg, lex):
    manifest = {
        k: v for k, v in store.manifest.items()
        if k not in ("chunk_params", "lexicon_hashes")
    }
    problems = manifest_drift(manifest, cfg, lex)
    assert len(problems) == 2
    assert any("分块参数指纹" in p for p in problems)
    assert any("词典指纹" in p for p in problems)


def test_lexicon_records_source_files(lex):
    assert {"philosophers", "concepts", "taxonomy", "themes"} <= set(lex.sources)
    assert all(p.exists() for p in lex.sources.values())
