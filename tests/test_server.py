"""Web 服务层（philo_rag/server.py）：Runtime 装配复用 + 各接口的结构契约。

索引与模型在进程内只装配一次——这是 `_load` 的核心契约（模块级 `app` 与 `serve()`
会各装配一次应用，重复装配要白等一整轮「载入索引 + 加载模型」）。这里用同一对象
断言守住它，顺带跑通主要接口；生成后端仍是离线 template，不联网。
"""
from __future__ import annotations

import json

import pytest


@pytest.fixture(scope="module")
def runtime(cfg):
    from philo_rag.server import _load

    first = _load(cfg)
    second = _load(cfg)
    assert first is second, "同一索引必须复用同一份 Runtime"
    assert first.store is second.store and first.lex is second.lex
    return first


@pytest.fixture(scope="module")
def client(runtime, cfg):
    from fastapi.testclient import TestClient

    from philo_rag.server import create_app

    return TestClient(create_app(cfg))


def test_runtime_exposes_index_and_lexicon(runtime):
    assert len(runtime.store.chunks) > 0
    assert runtime.lex.units


def test_stats_reports_backend_and_counts(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"]["backend"] == "template"
    assert body["counts"]["units"] > 0
    assert body["manifest"]


def test_ask_returns_answer_with_citations(client):
    resp = client.post("/api/ask", json={"question": "什么是字头？【web-ask】", "strategy": "point"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"] and body["citations"]
    assert body["citations"][0]["chunk_id"]


def test_ask_rejects_unknown_strategy(client):
    resp = client.post("/api/ask", json={"question": "什么是字头？", "strategy": "nope"})
    assert resp.status_code == 422


def test_ask_stream_emits_meta_delta_done(client):
    with client.stream(
        "POST",
        "/api/ask_stream",
        json={"question": "什么是字头？【web-stream】", "strategy": "point"},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())
    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]
    assert [e["type"] for e in events] == ["meta", "delta", "done"]
    assert events[0]["citations"]


def test_term_lookup_shape(client):
    resp = client.get("/api/term", params={"term": "字头", "limit": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["term"] == "字头"
    assert "card" in body and body["exact_total"] >= 1
    assert body["exact_hits"] and body["exact_hits"][0]["chunk_id"]


def test_quote_and_facets_return_payloads(client):
    quotes = client.get("/api/quote", params={"limit": 5})
    assert quotes.status_code == 200
    assert isinstance(quotes.json(), dict)

    facets = client.get("/api/facets")
    assert facets.status_code == 200
    assert facets.json()


def test_context_returns_neighbour_chunks_and_404(client):
    ask = client.post("/api/ask", json={"question": "什么是字头？【web-ctx】"}).json()
    chunk_id = ask["citations"][0]["chunk_id"]

    resp = client.get("/api/context", params={"chunk_id": chunk_id, "window": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["focus"] == chunk_id
    assert any(item["is_focus"] for item in body["items"])

    assert client.get("/api/context", params={"chunk_id": "不存在"}).status_code == 404


def test_static_assets_are_served(client):
    assert client.get("/").status_code == 200
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/assets/styles.css").status_code == 200
