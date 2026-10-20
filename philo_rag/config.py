"""配置加载与本地知识库装配，供 Web 服务与测试共用。"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml

from .index import Store
from .lexicon import Lexicon

_PATH_KEYS = [
    ("doc", "raw"),
    ("doc", "source"),
    ("doc", "store_dir"),
    ("lexicon", "philosophers"),
    ("lexicon", "concepts"),
    ("lexicon", "taxonomy"),
    ("lexicon", "themes"),
]
_ENV_PAT = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _load_dotenv(root: Path) -> None:
    """把项目根目录的 .env 读进环境变量（已存在的同名变量不覆盖）。"""
    env_file = root / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, val)


def _expand_env(value: Any) -> Any:
    """递归展开配置里的 ${VAR}：字典 / 列表 / 字符串都支持。"""
    if isinstance(value, str):
        return _ENV_PAT.sub(lambda match: os.environ.get(match.group(1), ""), value)
    if isinstance(value, dict):
        return {key: _expand_env(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_expand_env(item) for item in value]
    return value


def load_config(path: Path) -> dict:
    """读取 YAML 配置，展开 ${VAR}，并把相对路径解析到配置文件所在目录。"""
    with open(path, encoding="utf-8") as config_file:
        cfg = yaml.safe_load(config_file)
    root = path.resolve().parent
    cfg["_root"] = str(root)
    _load_dotenv(root)
    cfg = _expand_env(cfg)
    for section, key in _PATH_KEYS:
        sec = cfg.get(section) or {}
        value = sec.get(key)
        if value:
            resolved = Path(value)
            if not resolved.is_absolute():
                sec[key] = str(root / resolved)
    return cfg


def get_lexicon(cfg: dict) -> Lexicon:
    root = Path(cfg["_root"])
    lex_cfg = cfg.get("lexicon", {})

    def resolve(key: str, default: str) -> Path:
        return Path(lex_cfg.get(key) or (root / "lexicon" / default))

    return Lexicon(
        resolve("philosophers", "philosophers.yaml"),
        resolve("concepts", "concepts.yaml"),
        resolve("taxonomy", "哲学大纲_体系.yaml"),
        themes_path=resolve("themes", "themes.yaml"),
    )


def open_store(cfg: dict) -> tuple[Store, Lexicon]:
    """按配置载入索引与词典；索引缺失时给出明确错误。"""
    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    if not (store_dir / "chunks.jsonl").exists():
        raise SystemExit(
            f"索引不存在：{store_dir}。请先准备有效的 store 索引后再启动服务。"
        )
    return Store.load(store_dir, lex, cfg), lex
