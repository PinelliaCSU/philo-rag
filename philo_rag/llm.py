"""生成层后端：把提示词送出去、把文本拿回来。

三种后端由 config.yaml 的 answer.backend 选择：
  template —— 离线抽取式，不经过本模块（见 answer.template_answer）
  ollama   —— 本地模型，走 /api/generate，数据不出本机
  api      —— 任意 OpenAI 兼容 /chat/completions 接口（默认接阿里云百炼 DashScope）

本模块只管传输：提示词、上下文、返回结构都不在这里决定（见 answer_prompt / answer_evidence）。
api 后端三个工程要点：max_tokens 必须给足（范围查询要 1500—4000 字）、
429/5xx 自动退避重试、HTTP 错误体原样回带（密钥错误 / 模型未开通 / 额度不足一眼可见）。
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any


def _post(url: str, payload: dict, headers: dict[str, str] | None = None, timeout: int = 180) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ollama_answer(prompt: str, cfg: dict[str, Any]) -> str:
    a_cfg = cfg["answer"]
    data = _post(
        f"{a_cfg.get('ollama_base', 'http://localhost:11434').rstrip('/')}/api/generate",
        {
            "model": a_cfg.get("ollama_model") or a_cfg.get("model", "qwen2.5:7b"),
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": float(a_cfg.get("temperature", 0.2))},
        },
    )
    return data.get("response", "").strip()


def _api_error_detail(exc: urllib.error.HTTPError) -> str:
    """把 HTTP 错误体带出来：密钥错误 / 模型未开通 / 额度不足都能一眼看清。"""
    try:
        body = exc.read().decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        body = ""
    body = " ".join(body.split())
    return f"HTTP {exc.code} {exc.reason}" + (f"：{body[:400]}" if body else "")


def _resolve_api_model(cfg: dict[str, Any], strategy: str = "point") -> str:
    """按策略选择模型：点查询优先用 api_model_point（更快），范围查询用 api_model_theme。

    未配置专用模型时退回通用 api_model / model。
    """
    a_cfg = cfg.get("answer", {}) or {}
    if strategy == "theme":
        model = a_cfg.get("api_model_theme") or a_cfg.get("api_model") or a_cfg.get("model", "qwen-plus")
    else:
        model = a_cfg.get("api_model_point") or a_cfg.get("api_model") or a_cfg.get("model", "qwen-plus")
    return model


def _build_api_payload(prompt: str, cfg: dict[str, Any], strategy: str = "point", stream: bool = False) -> tuple[str, dict, dict]:
    """构造 OpenAI 兼容请求的 URL / payload / headers，供流式与非流式共用。"""
    a_cfg = cfg["answer"]
    base = str(a_cfg.get("api_base", "") or "").rstrip("/")
    if not base:
        raise ValueError(
            "answer.api_base 未配置。backend=api 时必须指定服务地址，"
            "例如 https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
    key = str(a_cfg.get("api_key", "") or "").strip()
    if not key:
        raise ValueError(
            "answer.api_key 为空。任选其一：\n"
            "  · 在项目根目录建 .env，写入 DASHSCOPE_API_KEY=sk-xxx，"
            "并让 config.yaml 保留 api_key: ${DASHSCOPE_API_KEY}；\n"
            "  · 或直接把 key 填进 config.yaml 的 answer.api_key。"
        )
    model = _resolve_api_model(cfg, strategy)
    payload: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": float(a_cfg.get("temperature", 0.2)),
        "stream": stream,
    }
    if a_cfg.get("api_max_tokens"):
        payload["max_tokens"] = int(a_cfg["api_max_tokens"])
    extra = a_cfg.get("api_extra")
    if isinstance(extra, dict):
        payload.update(extra)

    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {key}"}
    return url, payload, headers


def api_answer(prompt: str, cfg: dict[str, Any], strategy: str = "point") -> str:
    """调用任意 OpenAI 兼容 /chat/completions 接口（默认阿里云百炼 DashScope）。

    与 ollama 后端的差别只在传输层：提示词、上下文、返回结构完全一致，因此点查询与
    范围查询两条策略都能直接切到云端，检索链路一行都不用改。

    三个工程要点：
      * `max_tokens` 必须显式给足——范围查询要求 1500—4000 字，默认输出上限会把长文
        拦腰截断；
      * 429 / 5xx 与网络抖动自动退避重试，不让偶发失败废掉整次提问；
      * HTTP 错误体原样回带，直接看到「密钥错误 / 模型未开通 / 额度不足」。
    """
    a_cfg = cfg["answer"]
    url, payload, headers = _build_api_payload(prompt, cfg, strategy=strategy, stream=False)
    timeout = int(a_cfg.get("api_timeout", 180))
    retries = max(0, int(a_cfg.get("api_retries", 2)))
    model = payload["model"]

    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            data = _post(url, payload, headers=headers, timeout=timeout)
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError(f"接口返回中没有 choices：{str(data)[:300]}")
            return (choices[0].get("message", {}).get("content") or "").strip()
        except urllib.error.HTTPError as exc:
            last = RuntimeError(f"{model} 调用失败：{_api_error_detail(exc)}")
            if exc.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise last from exc
        except urllib.error.URLError as exc:
            last = RuntimeError(f"无法连接 {url.rsplit('/', 2)[0]}：{exc.reason}")
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise last from exc
    raise last if last else RuntimeError("API 调用失败")


def api_answer_stream(prompt: str, cfg: dict[str, Any], strategy: str = "point"):
    """流式调用 OpenAI 兼容接口，逐块 yield 文本增量。

    用 SSE 协议读取 `stream=True` 的响应体，每个 `data:` 行是一个 JSON chunk，
    其中 `choices[0].delta.content` 是文本增量。遇到 `[DONE]` 结束。

    首个 chunk 到达后即可开始输出——本地检索完成后用户几乎无感等待。
    """
    a_cfg = cfg["answer"]
    url, payload, headers = _build_api_payload(prompt, cfg, strategy=strategy, stream=True)
    timeout = int(a_cfg.get("api_timeout", 180))
    model = payload["model"]

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{model} 调用失败：{_api_error_detail(exc)}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"无法连接 {url.rsplit('/', 2)[0]}：{exc.reason}") from exc

    buf = b""
    with resp:
        for raw in resp:
            buf += raw
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                if line.startswith(b"data: "):
                    data_str = line[6:]
                elif line.startswith(b"data:"):
                    data_str = line[5:]
                else:
                    continue
                if data_str.strip() == b"[DONE]":
                    return
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if choices:
                    delta = choices[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content


def generate_text(prompt: str, cfg: dict[str, Any], strategy: str = "point") -> str:
    """按配置选择后端，把提示词送出去拿回文本。

    供连通性探测（`demo` / `scripts/check_api.py`）复用，避免各处重复判断后端。
    """
    backend = str(cfg.get("answer", {}).get("backend", "template"))
    if backend == "ollama":
        return ollama_answer(prompt, cfg)
    if backend == "api":
        return api_answer(prompt, cfg, strategy=strategy)
    raise ValueError(f"后端 {backend} 不是生成式后端（template 为离线抽取式，无需调用）")
