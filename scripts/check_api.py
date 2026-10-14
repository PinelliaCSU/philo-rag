"""校验生成层 API 配置：读 config.yaml → 发一条最小请求 → 报告连通性与延迟。

用法：
    python scripts/check_api.py
    python scripts/check_api.py --prompt "用一句话解释什么是辩证法"

密钥不会被完整打印，只显示前 6 位与总长度，便于确认「读到的是哪一把 key」。
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from philo_rag.answer import api_answer  # noqa: E402
from philo_rag.cli import load_config     # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="生成层 API 连通性自检")
    ap.add_argument("--config", default="config.yaml", help="配置文件路径")
    ap.add_argument("--prompt", default="请只回复四个字：接口正常")
    args = ap.parse_args()

    cfg = load_config(Path(args.config))
    a = cfg.get("answer", {}) or {}
    key = str(a.get("api_key", "") or "")
    model = a.get("api_model") or a.get("model", "")

    print(f"backend  : {a.get('backend')}")
    print(f"api_base : {a.get('api_base')}")
    print(f"model    : {model}")
    print(f"api_key  : {key[:6] + '…（' + str(len(key)) + ' 位）' if key else '(空)'}")

    if a.get("backend") != "api":
        print("提示：answer.backend 不是 api；本脚本仍按 api 方式直连测试。")
    if not key:
        print("✗ 未读到密钥：请在项目根目录 .env 里设置 DASHSCOPE_API_KEY，或填入 config.yaml。")
        raise SystemExit(1)

    t0 = time.perf_counter()
    try:
        reply = api_answer(args.prompt, cfg)
    except Exception as exc:  # noqa: BLE001
        print(f"✗ 调用失败（{time.perf_counter() - t0:.1f}s）：{exc}")
        raise SystemExit(1)
    print(f"✓ 调用成功（{time.perf_counter() - t0:.1f}s）")
    print(f"  返回：{reply}")


if __name__ == "__main__":
    main()
