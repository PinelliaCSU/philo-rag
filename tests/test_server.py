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


def test_unit_endpoint_returns_chunks_in_reading_order(client):
    resp = client.get("/api/unit", params={"code": "1-1", "limit": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert body["code"] == "1-1"
    assert body["counts"]["chunks"] > 0
    assert body["title"] and body["volume"]
    assert len(body["items"]) <= 5
    starts = [item["start"] for item in body["items"]]
    assert starts == sorted(starts)
    assert body["concepts"] and body["philosophers"]


def test_unit_endpoint_lists_children_and_rejects_unknown(client):
    body = client.get("/api/unit", params={"code": "1"}).json()
    assert any(child["code"].startswith("1-") for child in body["children"])
    assert body["head"]
    assert client.get("/api/unit", params={"code": "9-9-9"}).status_code == 404


def test_context_returns_neighbour_chunks_and_404(client):
    ask = client.post("/api/ask", json={"question": "什么是字头？【web-ctx】"}).json()
    chunk_id = ask["citations"][0]["chunk_id"]

    resp = client.get("/api/context", params={"chunk_id": chunk_id, "window": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["focus"] == chunk_id
    assert any(item["is_focus"] for item in body["items"])

    assert client.get("/api/context", params={"chunk_id": "不存在"}).status_code == 404


# --------------------------------------------------------------------------- #
# 对比模式（T4）：数据层在 retrieve.build_compare、路由在 server，两处分别改动最易错位，
# 这里从 HTTP 入口把契约锁一次（字段名、units 的 hits 口径、单侧缺失降级）。
# --------------------------------------------------------------------------- #
def test_compare_endpoint_returns_two_sides(client):
    resp = client.get("/api/compare", params={"a": "大他者", "b": "象征界"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"terms", "shared_related", "shared_units",
                         "a_only_related", "b_only_related"}
    left, right = body["terms"]
    assert left["found"] and right["found"]
    assert isinstance(left["definition"], str) and left["definition"]
    assert {"code", "title", "hits"} <= set(left["units"][0])
    assert body["shared_related"] and {"name", "a", "b", "sum"} <= set(body["shared_related"][0])
    assert len(left["quotes"]) <= 3

    missing = client.get("/api/compare", params={"a": "不存在的东西", "b": "象征界"}).json()
    assert missing["terms"][0]["found"] is False and missing["terms"][1]["found"] is True


def test_static_assets_are_served(client):
    """前端拆成 css/ 与 js/ 子目录后，资源按子路径服务。

    旧的两条单文件路径必须 404——它们已随拆分删除，留着 200 会让人误以为还在单文件时代。
    """
    assert client.get("/").status_code == 200
    assert client.get("/assets/css/1-tokens.css").status_code == 200
    assert client.get("/assets/js/00-ns.js").status_code == 200
    assert client.get("/assets/app.js").status_code == 404
    assert client.get("/assets/styles.css").status_code == 404


def test_asset_route_rejects_traversal_and_other_suffixes(client):
    """通用资源路由只放行 web/ 下的 .css/.js，不能变成任意文件读取。"""
    assert client.get("/assets/../config.yaml").status_code == 404
    assert client.get("/assets/js/../index.html").status_code == 404


# --------------------------------------------------------------------------- #
# 会话与追问（T1）：带同一 conversation_id 的第二次提问必须被改写成独立问题
# --------------------------------------------------------------------------- #
def test_stats_reports_conversation_switch(client):
    """/api/stats 要能看到会话开关与 TTL，冒烟时据此确认改写是否真的生效。"""
    body = client.get("/api/stats").json()
    assert body["conversation"] == {"enabled": True, "ttl_sec": 1800}


def test_ask_rewrites_followup_inside_same_conversation(client):
    first = client.post(
        "/api/ask", json={"question": "什么是字头？【conv-followup】"}
    ).json()
    cid = first["conversation_id"]
    assert cid, "首次提问必须带回新会话 id"
    assert first["is_followup"] is False
    assert first["standalone"] == "什么是字头？【conv-followup】"

    second = client.post("/api/ask", json={"question": "继续", "conversation_id": cid}).json()
    # 「继续」在闸门之前被改写成上一轮的独立问题，因此不再落到 gate
    assert second["conversation_id"] == cid
    assert second["skipped"] is False
    assert second["strategy"] != "gate"
    assert second["is_followup"] is True
    assert second["standalone"] == first["standalone"]


def test_ask_stream_meta_carries_conversation(client):
    cid = "stream-conv-1"
    with client.stream(
        "POST",
        "/api/ask_stream",
        json={"question": "什么是字头？【conv-stream-meta】", "conversation_id": cid},
    ) as resp:
        assert resp.status_code == 200
        raw = "".join(resp.iter_text())
    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]
    assert [e["type"] for e in events] == ["meta", "delta", "done"]
    meta = events[0]
    assert meta["conversation_id"] == cid
    assert meta["standalone"] == "什么是字头？【conv-stream-meta】"
    assert meta["is_followup"] is False
