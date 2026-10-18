"""pytest 公共装置：索引与词典整场只装载一次。

生成后端统一钉成离线 `template`：用例一旦落到 `api` 后端就要连外部服务与网络。
需要真正走 api 分支的用例，自己在用例里 monkeypatch 后端函数（见 test_answer_pipeline）。

闸门的期望值随用例表放在 `tests/gate_cases.py`（原 `scripts/check_gate.py`）。
"""
from __future__ import annotations

import shutil
import sys
import uuid
from pathlib import Path

import pytest

from philo_rag.bootstrap import get_lexicon, load_config, open_store

ROOT = Path(__file__).resolve().parents[1]

# 系统临时目录在受限环境里可能不可写（沙箱 / 企业策略），pytest 自带的 tmp_path 会整片报错。
# 这里直接用 tempfile.mkdtemp 在仓库内建临时目录：不依赖 %TEMP% 的权限，
# 也不经过 pytest 的「编号目录 + 清理锁」那套机制。
_TMP_ROOT = ROOT / ".tmp"
_TMP_ROOT.mkdir(parents=True, exist_ok=True)


@pytest.fixture()
def tmp_path():
    """一次性的临时目录（替代 pytest 内置实现，见上面的说明）。

    用 Path.mkdir 而不是 tempfile.mkdtemp：后者按 0o700 建目录，在受限环境里
    建出来的目录连写一个文件都会被拒绝，而 mkdir 的默认权限正常。
    """
    base = _TMP_ROOT / f"philo-test-{uuid.uuid4().hex[:8]}"
    base.mkdir(parents=True, exist_ok=False)
    try:
        yield base
    finally:
        shutil.rmtree(base, ignore_errors=True)
TESTS = ROOT / "tests"
if str(TESTS) not in sys.path:          # 用例表 tests/gate_cases.py 以模块方式被导入
    sys.path.insert(0, str(TESTS))


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
