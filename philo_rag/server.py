"""Web 服务层：把检索入口暴露为 HTTP API，并托管内置单页界面。

启动：
    python -m philo_rag.cli serve --port 8000
    # 或
    uvicorn philo_rag.server:app --port 8000

接口：
    GET  /                    单页界面（静态资源在 philo_rag/web/ 下）
    GET  /assets/styles.css   界面样式
    GET  /assets/app.js       界面逻辑
    GET  /api/stats           索引概览（含当前生成后端）
    GET  /api/facets          分面统计（筛选维度）
    GET  /api/units           体系目录（卷 → 单元）
    GET  /api/unit?code=      单元导览（单元元信息 + 该单元的块/术语/理论家）
    GET  /api/concepts        术语卡列表
    GET  /api/compare?a=&b=   两个概念的对比（定义 / 共现差异 / 引文）
    POST /api/ask             溯源回答（body 可传 strategy：auto | point | theme）
    POST /api/ask_stream      溯源回答（SSE 流式：meta → delta… → done）
    GET  /api/term?term=      术语索引与语义检索
    GET  /api/quote?...       引文检索（按理论家 / 说话人 / 概念 / 单元精确过滤）
    GET  /api/context?...     取某块及其上下文（用于「查看上下文」）

前后端分离方式：后端只提供 JSON API，界面是 `philo_rag/web/` 下的纯静态文件
（HTML + CSS + 原生 JS，无构建步骤）。二者只通过 HTTP 接口耦合，前端可独立替换。
索引在进程启动时加载一次并常驻内存（BM25 与向量都在内存里，单机场景足够快）。
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from . import conv
from .answer import answer as answer_fn
from .answer import answer_stream as answer_stream_fn
from .index import Store
from .lexicon import Lexicon
from .retrieve import facet_summary, quote_payload, term_lookup
from .schema import Chunk


@dataclass
class Runtime:
    """服务进程内常驻的一份索引与词典：装配一次，所有请求共用。"""

    cfg: dict[str, Any]
    store: Store
    lex: Lexicon


# 模块级 `app` 与 serve() 会各装配一次应用，这里缓存已装配的那一份，
# 避免同一索引被重复载入两次（那要白等一整轮「载入索引 + 加载模型」）。
_RUNTIME: Runtime | None = None

# 前端静态资源目录（随包分发）
_WEB_DIR = Path(__file__).resolve().parent / "web"


def _read_web(name: str) -> str:
    path = _WEB_DIR / name
    if not path.exists():
        raise HTTPException(500, f"前端资源缺失：{path}")
    return path.read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# 应用装配
# --------------------------------------------------------------------------- #
class AskRequest(BaseModel):
    """问答请求。

    只收问题本身与提问方式：溯源回答固定走**全文检索**，不接受元数据筛选——
    筛选会把承载概念定义的段落排除在候选池外，导致内容被截断。
    需要按单元/理论家/概念浏览，请改用 /api/term 与分面接口。

    strategy：auto（默认，按问题自动判定）| point（强制点查询）| theme（强制范围查询）。

    conversation_id：同一会话内「继续 / 详细点 / 那X呢」按上文改写成独立问题。
    首次提问留空，响应会带回新 id；会话状态由 answer 层读写，本层只做转发。
    """

    question: str = Field(..., min_length=1)
    strategy: str = Field("auto", pattern="^(auto|point|theme)$")
    focus: str | None = None
    conversation_id: str | None = Field(None, max_length=32, pattern=r"^[0-9a-zA-Z_-]*$")


def _load(cfg: dict) -> Runtime:
    """装配（或复用）进程内常驻的索引与词典，返回各请求共用的 Runtime。"""
    global _RUNTIME

    from .cli import get_lexicon

    store_dir = Path(cfg["doc"]["store_dir"])

    # 同一个索引已经就绪时直接复用，否则启动要白等一整轮「载入索引 + 加载模型」。
    if _RUNTIME is not None and Path(_RUNTIME.cfg["doc"]["store_dir"]) == store_dir:
        _RUNTIME.cfg = cfg
        return _RUNTIME

    lex = get_lexicon(cfg)
    if not (store_dir / "chunks.jsonl").exists():
        raise SystemExit(f"索引不存在：{store_dir}\n请先运行：python -m philo_rag.cli build")

    t0 = time.perf_counter()
    store = Store.load(store_dir, lex, cfg)
    print(f"[info] 索引已载入：{len(store.chunks)} 块（{time.perf_counter() - t0:.1f}s）", flush=True)
    _RUNTIME = Runtime(cfg=cfg, store=store, lex=lex)

    # 启动即预热：嵌入模型（约 10s）与重排模型（构造约 1s，权重 mmap 懒加载）
    # 都在这里加载一次并常驻进程缓存，之后每次提问只做「编码 + 检索 + 重排」，
    # 不会重新加载模型——提问变慢时先看 _rerank，而不是怀疑模型被重建。
    from .embed import get_embedder
    from .rerank import _load_reranker

    t0 = time.perf_counter()
    get_embedder(cfg["embedding"], cfg.get("_root"))
    print(f"[info] 嵌入模型已加载并常驻内存（{time.perf_counter() - t0:.1f}s）", flush=True)
    if cfg.get("retrieval", {}).get("rerank"):
        t0 = time.perf_counter()
        if _load_reranker(cfg) is not None:
            print(f"[info] 重排模型已加载并常驻内存（{time.perf_counter() - t0:.1f}s）", flush=True)
    return _RUNTIME


def create_app(cfg: dict) -> FastAPI:
    rt = _load(cfg)
    app = FastAPI(title="哲学大纲知识库", version="1.2.0")

    # 生成层出错（缺 key、接口报错、网络不通…）时不要把 500 裸奔给前端，
    # 转成带可读 detail 的 JSON，界面直接显示原因而不是 "Internal Server Error"。
    @app.exception_handler(ValueError)
    async def _on_value_error(_req: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(RuntimeError)
    async def _on_runtime_error(_req: Request, exc: RuntimeError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    # ---------------- 前端静态资源 ----------------
    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return _read_web("index.html")

    @app.get("/assets/styles.css")
    def styles() -> Response:
        return Response(_read_web("styles.css"), media_type="text/css; charset=utf-8")

    @app.get("/assets/app.js")
    def app_js() -> Response:
        return Response(_read_web("app.js"), media_type="application/javascript; charset=utf-8")

    @app.get("/favicon.ico")
    def favicon() -> Response:
        return Response(status_code=204)

    # ---------------- JSON API ----------------
    @app.get("/api/stats")
    def stats() -> dict:
        store, lex, cfg = rt.store, rt.lex, rt.cfg
        a_cfg = cfg.get("answer", {}) or {}
        conv_conf = conv.settings(cfg)
        return {
            "manifest": store.manifest,
            "volumes": lex.volumes,
            "axes": lex.axes,
            "answer": {
                "backend": a_cfg.get("backend", "template"),
                "model": a_cfg.get("api_model") or a_cfg.get("model", ""),
            },
            # 会话能力开关：冒烟时据此确认追问改写是否真的生效
            "conversation": {
                "enabled": bool(conv_conf["enabled"]),
                "ttl_sec": int(conv_conf["ttl_sec"]),
            },
            "counts": {
                "philosophers": len(lex.philosophers),
                "concepts": len(lex.concepts),
                "units": len(lex.units),
            },
        }

    @app.get("/api/facets")
    def facets() -> dict:
        return facet_summary(rt.store, rt.lex)

    @app.get("/api/units")
    def units() -> list[dict]:
        return rt.lex.units

    @app.get("/api/unit")
    def unit(code: str = Query(..., min_length=1), limit: int = 40) -> dict:
        """单元导览：单元元信息 + 该单元（含子单元）的块列表。

        `code` 支持任意层级（'1' / '1-1' / '3-2-1'）；块按阅读顺序返回，
        术语与理论家按该单元内的出现频次排序。编号不是主键——体系目录存在同码的
        「复习课」条目，标题取目录中的首个条目（见 docs/架构设计.md 的索引一节）。
        """
        store, lex = rt.store, rt.lex
        entry = lex.unit(code)
        if entry is None:
            raise HTTPException(404, f"单元不存在：{code}")

        ids: set[str] = set()
        for sub in lex.codes_under(code):
            ids |= set(store.terms["unit"].get(sub, []))
        chunks = [
            store.chunks[i]
            for i in sorted(i for i in (store.index_of(cid) for cid in ids) if i is not None)
        ]

        concepts: dict[str, int] = {}
        philosophers: dict[str, int] = {}
        for c in chunks:
            for t in c.concepts:
                concepts[t] = concepts.get(t, 0) + 1
            for p in c.philosophers:
                philosophers[p] = philosophers.get(p, 0) + 1

        depth = int(entry.get("depth") or 0)
        children: list[dict[str, str]] = []
        seen_codes: set[str] = set()
        for u in lex.units:
            child = str(u["code"])
            if child in seen_codes or int(u.get("depth") or 0) != depth + 1:
                continue
            if child.startswith(str(code) + "-"):
                seen_codes.add(child)
                children.append({"code": child, "title": str(u.get("title", ""))})

        def top(counts: dict[str, int], n: int = 12) -> list[dict[str, Any]]:
            return [{"name": k, "count": v}
                    for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]]

        return {
            "code": code,
            "title": lex.unit_title(code),
            "volume": lex.volume_of(code),
            "depth": depth,
            "head": lex.head_of(code),
            "coords": lex.coords_of(code),
            "children": children,
            "counts": {
                "chunks": len(chunks),
                "quotes": sum(1 for c in chunks if c.chunk_type == "quote"),
            },
            "concepts": top(concepts),
            "philosophers": top(philosophers),
            "items": [_chunk_json(c, lex, store) for c in chunks[: max(0, int(limit))]],
        }

    @app.get("/api/concepts")
    def concepts() -> list[dict]:
        lex: Lexicon = rt.lex
        return [
            {
                "name": name,
                "aliases": info.get("aliases", []),
                "philosopher": info.get("philosopher", ""),
                "definition": info.get("definition", ""),
            }
            for name, info in lex.concepts.items()
        ]

    @app.get("/api/compare")
    def compare(a: str = Query(..., min_length=1), b: str = Query(..., min_length=1)) -> dict:
        """两个概念的对比：定义与归属 / 共现差异 / 引文。

        延迟导入：对比能力由 retrieve 的 build_compare 提供（与本次改动并行落地），
        放在模块顶部会让应用在它尚未存在时直接起不来。
        """
        from .retrieve import build_compare

        return build_compare(rt.store, rt.lex, a, b)

    @app.post("/api/ask")
    def ask(req: AskRequest) -> dict:
        store, lex, cfg = rt.store, rt.lex, rt.cfg
        return answer_fn(store, lex, req.question, cfg, strategy=req.strategy,
                         focus=req.focus, conversation_id=req.conversation_id)

    @app.post("/api/ask_stream")
    async def ask_stream(req: AskRequest):
        """SSE 流式问答：先发 meta 事件（含引用），再逐块发 delta 事件，最后发 done。

        前端用 fetch + ReadableStream 消费，收到 meta 后立即渲染引用面板，
        收到 delta 后逐字追加回答正文——本地检索完成后即可开始输出。

        这里必须把**同步生成器**直接交给 StreamingResponse，而不要在事件循环里
        用 async generator 迭代它：检索、重排、调用生成接口全是阻塞调用，一旦在
        事件循环线程里跑，循环就被占住，传输层的写缓冲要等生成结束才会刷进 socket
        ——前端只能在全流程结束后一次性收到全部事件，「流式」名存实亡。
        交给同步生成器后，Starlette 会用 iterate_in_threadpool 把每次 next() 丢到
        工作线程，事件循环得以在每个事件之间把数据真正发出去。
        """
        import json as _json

        store, lex, cfg = rt.store, rt.lex, rt.cfg

        def event_gen():
            for event in answer_stream_fn(store, lex, req.question, cfg, strategy=req.strategy,
                                         focus=req.focus,
                                         conversation_id=req.conversation_id):
                yield f"data: {_json.dumps(event, ensure_ascii=False)}\n\n"

        # no-cache / X-Accel-Buffering：避免浏览器与反向代理再次把 SSE 攒起来
        return StreamingResponse(
            event_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/term")
    def term(term: str = Query(..., min_length=1), limit: int = 8) -> dict:
        store, lex, cfg = rt.store, rt.lex, rt.cfg
        res = term_lookup(store, lex, term, cfg, top_k=limit)
        return {
            "term": res["term"],
            "card": res["card"],
            "exact_total": res["exact_total"],
            "exact_hits": [_chunk_json(c, lex, store) for c in res["exact_hits"]],
            "semantic_hits": [
                {**_chunk_json(h["chunk"], lex, store), "score": round(h["score"], 6)}
                for h in res["semantic_hits"]
            ],
        }

    @app.get("/api/quote")
    def quote(
        philosopher: str | None = None,
        speaker: str | None = None,
        concept: str | None = None,
        era: str | None = None,
        school: str | None = None,
        unit: str | None = None,
        volume: str | None = None,
        axis: str | None = None,
        keyword: str | None = None,
        limit: int = 30,
    ) -> dict:
        store, lex = rt.store, rt.lex
        return quote_payload(
            store, lex, philosopher=philosopher, speaker=speaker, concept=concept,
            era=era, school=school, unit=unit, volume=volume, axis=axis,
            keyword=keyword, top_k=limit,
        )

    @app.get("/api/concept")
    def concept(term: str = Query(..., min_length=1), limit: int = 8) -> dict:
        """术语概念卡：定义句与出处 + 单元分布 + 共现理论家 + 相关引文。"""
        from .retrieve import build_concept_card

        store, lex = rt.store, rt.lex
        return build_concept_card(store, lex, term, limit)

    @app.get("/api/context")
    def context(chunk_id: str, window: int = 2) -> dict:
        """取某块及其前后各 window 块，用于界面上的「查看上下文」。"""
        store, lex = rt.store, rt.lex
        idx = store.index_of(chunk_id)
        if idx is None:
            raise HTTPException(404, f"chunk 不存在：{chunk_id}")
        lo, hi = max(0, idx - window), min(len(store.chunks), idx + window + 1)
        return {
            "focus": chunk_id,
            "items": [
                {**_chunk_json(store.chunks[i], lex, store), "is_focus": i == idx}
                for i in range(lo, hi)
            ],
        }

    return app


def _chunk_json(c: Chunk, lex: Lexicon, store: Store) -> dict:
    doc_title = store.manifest.get("doc_title", "")
    return {
        "chunk_id": c.chunk_id,
        "text": c.text,
        "chunk_type": c.chunk_type,
        "chapter_path": c.chapter_path,
        "unit": c.unit_code(),
        "unit_title": lex.unit_title(c.unit_code(), c.chapter_path),
        "volume": c.volume(),
        "philosophers": c.philosophers,
        "concepts": c.concepts,
        "eras": c.eras,
        "speaker": c.speaker,
        "citation": c.citation(doc_title),
        "page": c.page,
        "start": c.start,
        "end": c.end,
    }


def serve(cfg: dict, host: str = "127.0.0.1", port: int = 8000, reload: bool = False) -> None:
    import uvicorn

    if reload:
        # reload 模式会重新导入模块、丢掉内存索引，这里退化为非 reload
        print("[warn] --reload 与内存索引不兼容，已按非 reload 启动")
    app = create_app(cfg)
    print(f"哲学大纲知识库已启动 →  http://{host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info")


def _default_app() -> FastAPI | None:
    """供 `uvicorn philo_rag.server:app` 使用：按当前目录的 config.yaml 装配。

    索引缺失或配置找不到时返回 None —— 那种情况请改用
    `python -m philo_rag.cli serve`，它会在启动前给出明确提示。
    """
    try:
        from .cli import load_config

        return create_app(load_config(Path("config.yaml")))
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] 导入时无法装配应用（{exc}）；请用 `python -m philo_rag.cli serve` 启动")
        return None


app = _default_app()
