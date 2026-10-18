"""运行期装配：配置、词典、索引。

与 `server` 分离，是因为「怎么把配置与索引装配起来」不是 Web 层的事：
服务入口（`python -m philo_rag`）、维护脚本（`scripts/build_index.py`）与测试
都只需要这三个函数，不该为了拿到它们去导入一个带 FastAPI 路由的模块。

原来它们住在 `cli.py`；交付形态收敛为 Web 服务后 CLI 被删，这层装配保留。
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import yaml

from .index import Store
from .lexicon import Lexicon

# 相对路径字段 → 相对 config.yaml 所在目录解析
_PATH_KEYS = [
    ("doc", "raw"),
    ("doc", "source"),
    ("doc", "store_dir"),
    ("lexicon", "philosophers"),
    ("lexicon", "concepts"),
    ("lexicon", "taxonomy"),
    ("lexicon", "themes"),
    ("output", "dir"),
]

# ${ENV_VAR} 占位符：让 config.yaml 里不出现明文密钥，配置文件可安全提交与分享
_ENV_PAT = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")

# 索引缺失时统一的提示：唯一入口是 Web 服务，重建索引走维护脚本
BUILD_HINT = "请先运行：python scripts/build_index.py"


def _load_dotenv(root: Path) -> None:
    """把项目根目录的 .env 读进环境变量（已存在的同名变量不覆盖）。

    只做最朴素的 KEY=VALUE 解析，够用且不引入额外依赖。密钥因此可以只放在
    .env（已在 .gitignore 中）里，而 config.yaml 保持可提交、可分享。
    """
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


def _expand_env(value):
    """递归展开配置里的 ${VAR}：字典 / 列表 / 字符串都支持。"""
    if isinstance(value, str):
        return _ENV_PAT.sub(lambda m: os.environ.get(m.group(1), ""), value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    root = path.resolve().parent
    cfg["_root"] = str(root)
    # 先加载 .env，再展开 ${VAR}：密钥可以只存在于 .env 或系统环境变量中
    _load_dotenv(root)
    cfg = _expand_env(cfg)
    for section, key in _PATH_KEYS:
        sec = cfg.get(section) or {}
        val = sec.get(key)
        if not val:
            continue
        p = Path(val)
        if not p.is_absolute():
            sec[key] = str(root / p)
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
    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    if not (store_dir / "chunks.jsonl").exists():
        raise SystemExit(f"索引不存在：{store_dir}\n{BUILD_HINT}")
    return Store.load(store_dir, lex, cfg), lex
