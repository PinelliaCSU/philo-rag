"""pytest 公共装置：索引与词典整场只装载一次。

生成后端统一钉成离线 `template`：用例一旦落到 `api` 后端就要连外部服务与网络。
需要真正走 api 分支的用例，自己在用例里 monkeypatch 后端函数（见 test_answer_pipeline）。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from philo_rag.config import get_lexicon, load_config, open_store

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def cfg() -> dict:
    """完整配置，但生成后端固定为离线 template（保证测试不依赖网络与密钥）。"""
    conf = load_config(ROOT / "config.yaml")
    conf.setdefault("answer", {})["backend"] = "template"
    return conf


@pytest.fixture(scope="session")
def lex(cfg: dict):
    return get_lexicon(cfg)


@pytest.fixture(scope="session")
def store(cfg: dict):
    """索引 + 词典（约 10 秒，整场只装载一次）。"""
    loaded, _lex = open_store(cfg)
    return loaded


@pytest.fixture()
def api_cfg(cfg: dict) -> dict:
    """把后端切到 api 的配置副本；仅在用例自己 monkeypatch 了后端函数时才安全。"""
    return {**cfg, "answer": {**cfg["answer"], "backend": "api", "prompt_style": "quote_first"}}
