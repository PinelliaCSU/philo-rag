"""唯一入口：`python -m philo_rag`。

只解析 --host / --port / --config，不做子命令——交付形态只有 Web 服务。
"""
from __future__ import annotations

import sys

from .server import main

if __name__ == "__main__":
    sys.exit(main())
