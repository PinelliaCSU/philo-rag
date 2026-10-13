"""Web 服务层：把三个检索入口暴露为 HTTP API，并内置单页界面。

启动：
    python -m philo_rag.cli serve --port 8000
    # 或
    uvicorn philo_rag.server:app --port 8000

接口：
    GET  /                    单页界面
    GET  /api/stats           索引概览
    GET  /api/facets          分面统计（筛选维度）
    GET  /api/units           体系目录（卷 → 单元）
    GET  /api/concepts        术语卡列表
    POST /api/ask             引用溯源问答
    GET  /api/term?term=      术语索引与语义检索
    GET  /api/context?...     取某块及其上下文（用于「跳转原文」）

索引在进程启动时加载一次并常驻内存（BM25 与向量都在内存里，单机场景足够快）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

from .answer import answer as answer_fn
from .index import Store
from .lexicon import Lexicon
from .retrieve import facet_summary, term_lookup

_STATE: dict[str, Any] = {"cfg": None, "store": None, "lex": None}


# --------------------------------------------------------------------------- #
# 应用装配
# --------------------------------------------------------------------------- #
class AskRequest(BaseModel):
    """问答请求。

    只收问题本身：溯源问答固定走**全文检索**，不再接受元数据筛选——
    筛选会把承载概念定义的段落排除在候选池外，导致内容被截断。
    需要按单元/理论家/概念浏览，请改用 /api/term 与分面接口。
    """

    question: str = Field(..., min_length=1)


def _load(cfg: dict) -> None:
    from .cli import get_lexicon

    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    if not (store_dir / "chunks.jsonl").exists():
        raise SystemExit(f"索引不存在：{store_dir}\n请先运行：python -m philo_rag.cli build")
    _STATE.update(cfg=cfg, store=Store.load(store_dir, lex), lex=lex)


def create_app(cfg: dict) -> FastAPI:
    _load(cfg)
    app = FastAPI(title="哲学大纲知识库", version="1.0.0")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return INDEX_HTML

    @app.get("/api/stats")
    def stats() -> dict:
        store, lex = _STATE["store"], _STATE["lex"]
        return {
            "manifest": store.manifest,
            "volumes": lex.volumes,
            "axes": lex.axes,
            "counts": {
                "philosophers": len(lex.philosophers),
                "concepts": len(lex.concepts),
                "units": len(lex.units),
            },
        }

    @app.get("/api/facets")
    def facets() -> dict:
        return facet_summary(_STATE["store"], _STATE["lex"])

    @app.get("/api/units")
    def units() -> list[dict]:
        return _STATE["lex"].units

    @app.get("/api/concepts")
    def concepts() -> list[dict]:
        lex: Lexicon = _STATE["lex"]
        return [
            {
                "name": name,
                "aliases": info.get("aliases", []),
                "philosopher": info.get("philosopher", ""),
                "definition": info.get("definition", ""),
            }
            for name, info in lex.concepts.items()
        ]

    @app.post("/api/ask")
    def ask(req: AskRequest) -> dict:
        store, lex, cfg = _STATE["store"], _STATE["lex"], _STATE["cfg"]
        return answer_fn(store, lex, req.question, cfg)

    @app.get("/api/term")
    def term(term: str = Query(..., min_length=1), limit: int = 8) -> dict:
        store, lex, cfg = _STATE["store"], _STATE["lex"], _STATE["cfg"]
        res = term_lookup(store, lex, term, cfg, top_k=limit)
        return {
            "term": res["term"],
            "card": res["card"],
            "exact_total": res["exact_total"],
            "exact_hits": [_chunk_json(c, lex) for c in res["exact_hits"]],
            "semantic_hits": [
                {**_chunk_json(h["chunk"], lex), "score": round(h["score"], 6)}
                for h in res["semantic_hits"]
            ],
        }

    @app.get("/api/context")
    def context(chunk_id: str, window: int = 2) -> dict:
        """取某块及其前后各 window 块，用于界面上的「跳转原文」."""
        store, lex = _STATE["store"], _STATE["lex"]
        idx = next((i for i, c in enumerate(store.chunks) if c.chunk_id == chunk_id), None)
        if idx is None:
            raise HTTPException(404, f"chunk 不存在：{chunk_id}")
        lo, hi = max(0, idx - window), min(len(store.chunks), idx + window + 1)
        return {
            "focus": chunk_id,
            "items": [
                {**_chunk_json(store.chunks[i], lex), "is_focus": i == idx}
                for i in range(lo, hi)
            ],
        }

    return app


def _chunk_json(c, lex: Lexicon) -> dict:
    doc_title = _STATE["store"].manifest.get("doc_title", "")
    return {
        "chunk_id": c.chunk_id,
        "text": c.text,
        "chunk_type": c.chunk_type,
        "chapter_path": c.chapter_path,
        "unit": c.unit_code(),
        "unit_title": lex.unit_title(c.unit_code()),
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
    print(f"哲学大纲知识库已启动 →  http://{host}:{port}")
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


# --------------------------------------------------------------------------- #
# 内置单页界面
# --------------------------------------------------------------------------- #
INDEX_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>哲学大纲 · 知识库</title>
<style>
  :root{
    --bg:#f6f7f9; --panel:#ffffff; --ink:#1c2024; --muted:#5d6672;
    --line:#e3e6ea; --accent:#2f6fd0; --accent-soft:#eaf1fc;
    --quote:#8a5a00; --quote-bg:#fdf6e6; --ok:#1f7a44;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:15px/1.75 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  header{background:var(--panel);border-bottom:1px solid var(--line);
         padding:14px 24px;display:flex;align-items:baseline;gap:16px;position:sticky;top:0;z-index:5}
  header h1{font-size:18px;margin:0;letter-spacing:.5px}
  header .sub{color:var(--muted);font-size:13px}
  .wrap{max-width:1080px;margin:0 auto;padding:20px 24px 80px}
  .tabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
  .tab{padding:7px 16px;border:1px solid var(--line);border-radius:999px;background:var(--panel);
       cursor:pointer;font-size:14px;color:var(--muted)}
  .tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:14px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  input[type=text],select{padding:9px 12px;border:1px solid var(--line);border-radius:8px;
       font-size:14px;background:#fff;color:var(--ink);font-family:inherit}
  input[type=text]{flex:1;min-width:220px}
  button{padding:9px 20px;border:none;border-radius:8px;background:var(--accent);color:#fff;
         font-size:14px;cursor:pointer;font-family:inherit}
  button.ghost{background:#fff;color:var(--accent);border:1px solid var(--accent)}
  button:disabled{opacity:.5;cursor:default}
  .muted{color:var(--muted);font-size:13px}
  .cite{border-left:3px solid var(--accent);padding:2px 0 2px 12px;margin:12px 0}
  .cite .meta{font-size:13px;color:var(--muted);margin-bottom:4px}
  .cite .body{font-size:14px}
  .quote{background:var(--quote-bg);color:var(--quote);border-left:3px solid var(--quote);
         padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0;font-size:14px}
  .tag{display:inline-block;background:var(--accent-soft);color:var(--accent);
       border-radius:5px;padding:1px 8px;font-size:12px;margin-right:6px}
  .unit{font-family:ui-monospace,Consolas,monospace;background:#eef1f4;color:#334;
        border-radius:5px;padding:1px 6px;font-size:12px}
  pre.ans{white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;font-size:14.5px}
  .err{color:#b3261e;background:#fdeceb;border-radius:8px;padding:10px 14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .chip{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 10px;
        font-size:13px;cursor:pointer;display:flex;justify-content:space-between;gap:8px}
  .chip:hover{border-color:var(--accent);color:var(--accent)}
  .chip b{font-weight:600;color:var(--muted);font-size:12px}
  h3{margin:18px 0 8px;font-size:15px}
  .hidden{display:none}
  .ctx-focus{background:var(--accent-soft);border-radius:8px}
  .facet-hero{background:linear-gradient(135deg,#203653,#4779b7);color:#fff;border:0}
  .facet-hero .muted{color:#dbe8f7}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:14px}
  .stat-box{background:rgba(255,255,255,.13);border-radius:10px;padding:12px}
  .stat-box b{display:block;font-size:22px;line-height:1.2}
  .axis-card{border-left:4px solid var(--accent);padding-left:14px}
  .axis-card h3{margin-top:0}
  .bar{height:6px;background:#edf0f4;border-radius:99px;overflow:hidden;margin-top:7px}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#4779b7,#8aaee0);border-radius:99px}
  .unit-card{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:72px}
</style>
</head>
<body>
<header>
  <h1>哲学大纲 · 知识库</h1>
  <span class="sub" id="stat">加载中…</span>
</header>

<div class="wrap">
  <div class="tabs">
    <div class="tab on" data-t="ask">引用溯源问答</div>
    <div class="tab" data-t="term">术语检索</div>
    <div class="tab" data-t="facet">分面 / 体系</div>
  </div>

  <!-- 问答 -->
  <section id="p-ask">
    <div class="card">
      <div class="row">
        <input type="text" id="q" placeholder="例如：什么是字头？四层分别规定什么？大他者是什么意思？">
        <button id="ask-btn">提问</button>
      </div>
      <div class="row" style="margin-top:10px">
        <span class="muted">问答固定对整篇《哲学大纲》做全文检索，不限定单元或概念，避免概念内容被筛选截断。寒暄、系统询问等不适合检索的问题会被自动跳过。</span>
      </div>
    </div>
    <div id="ask-out"></div>
  </section>

  <!-- 术语 -->
  <section id="p-term" class="hidden">
    <div class="card">
      <div class="row">
        <input type="text" id="t" placeholder="例如：大他者 / 客体小a / 场域论 / 存在者整体">
        <button id="term-btn">检索</button>
      </div>
    </div>
    <div id="term-out"></div>
  </section>

  <!-- 分面 -->
  <section id="p-facet" class="hidden">
    <div id="facet-out"></div>
  </section>
</div>

<script>
const $ = s => document.querySelector(s);
const esc = s => (s??'').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  ['ask','term','facet'].forEach(k =>
    $('#p-'+k).classList.toggle('hidden', k !== t.dataset.t));
});

function citeBlock(c){
  const ph = (c.philosophers||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('');
  const cc = (c.concepts||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('');
  return `<div class="cite">
    <div class="meta"><b>[${c.n??''}]</b> ${esc(c.citation)}</div>
    <div style="margin-bottom:4px">${c.unit?`<span class="unit">${esc(c.unit)}</span> ${esc(c.unit_title||'')}`:''} ${ph}${cc}</div>
    <div class="body">${esc(c.text)}</div>
  </div>`;
}

async function jget(url){ const r = await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }

// ---------- 问答 ----------
function askQuestion(q){
  $('#q').value = q;
  document.querySelector('.tab[data-t="ask"]').click();
  $('#ask-btn').click();
  window.scrollTo({top:0,behavior:'smooth'});
}

$('#ask-btn').onclick = async () => {
  const q = $('#q').value.trim(); if(!q) return;
  const out = $('#ask-out');
  out.innerHTML = '<div class="card muted">检索并生成中…（首次提问需加载模型，稍等）</div>';
  $('#ask-btn').disabled = true;
  try{
    const r = await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},
                                      body:JSON.stringify({question:q})}).then(r=>r.json());
    if(r.skipped){
      out.innerHTML = `<div class="card"><h3>已跳过检索</h3><pre class="ans">${esc(r.answer)}</pre>
        <div class="muted">判定类别：${esc((r.gate||{}).category||'')}</div></div>`;
      return;
    }
    out.innerHTML = `<div class="card"><h3>回答</h3><pre class="ans">${esc(r.answer)}</pre></div>`
      + `<div class="card"><h3>引用来源</h3>${(r.citations||[]).map(citeBlock).join('')}</div>`;
  }catch(e){ out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  finally{ $('#ask-btn').disabled = false; }
};
$('#q').addEventListener('keydown', e => { if(e.key==='Enter') $('#ask-btn').click(); });

// ---------- 术语 ----------
$('#term-btn').onclick = async () => {
  const t = $('#t').value.trim(); if(!t) return;
  const out = $('#term-out'); out.innerHTML = '<div class="card muted">检索中…</div>';
  try{
    const r = await jget('/api/term?term=' + encodeURIComponent(t));
    let h = '';
    if(r.card) h += `<div class="card"><h3>${esc(r.card.name)}</h3>
      <div class="muted">别名：${esc((r.card.aliases||[]).join('、')||'—')}　归属：${esc(r.card.philosopher)}（${esc(r.card.lifespan)}，${esc(r.card.era)}）</div>
      <p>${esc(r.card.definition)}</p></div>`;
    else h += `<div class="card muted">词典未收录「${esc(t)}」，以下为语义检索结果。</div>`;
    h += `<div class="card"><h3>精确命中（${r.exact_total} 块）</h3>`
       + r.exact_hits.map(c=>citeBlock({...c,n:''})).join('') + '</div>';
    h += `<div class="card"><h3>语义补充命中</h3>`
       + r.semantic_hits.map(c=>citeBlock({...c,n:'', citation:c.citation+'　score='+c.score})).join('') + '</div>';
    out.innerHTML = h;
  }catch(e){ out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
};
$('#t').addEventListener('keydown', e => { if(e.key==='Enter') $('#term-btn').click(); });

// ---------- 分面 / 体系 ----------
function chipRow(items, onclick){
  return `<div class="grid">` + items.map(([k,n])=>
    `<div class="chip" data-k="${esc(k)}"><span>${esc(k)}</span><b>${n}</b></div>`).join('') + '</div>';
}

async function loadFacets(){
  const [f, u] = await Promise.all([jget('/api/facets'), jget('/api/units')]);
  const byVol = {};
  u.forEach(x => { (byVol[x.volume] ||= []).push(x); });

  let h = `<div class="card facet-hero"><div class="muted">知识结构导航</div><h2 style="margin:4px 0 0">体系 · 卷与单元</h2>
    <div class="stat-grid"><div class="stat-box"><b>${u.length}</b><span>数值单元</span></div>
    <div class="stat-box"><b>${Object.keys(byVol).length}</b><span>卷</span></div>
    <div class="stat-box"><b>${f.concept.length}</b><span>核心概念</span></div></div></div>`;
  for(const v of Object.keys(byVol)){
    h += `<div class="card"><div class="row"><h3 style="margin:0;flex:1">${esc(v)}</h3><span class="tag">${byVol[v].length} 个单元</span></div>
      <div class="grid" style="margin-top:12px">`
       + byVol[v].map(x=>`<div class="chip unit-card" data-unit="${esc(x.code)}"><span class="unit">${esc(x.code)}</span><span>${esc(x.title)}</span></div>`).join('')
       + `</div>`;
  }
  h += `</div>`;

  const names = {philosopher:'理论家', concept:'概念', era:'年代', school:'流派', speaker:'说话人', volume:'卷', unit:'数值单元'};
  for(const k of ['philosopher','concept','era','school']){
    const max = f[k][0]?.[1] || 1;
    h += `<div class="card axis-card"><h3>${names[k]} <span class="muted">· ${f[k].length} 项</span></h3><div class="grid">`
      + f[k].map(([name,n])=>`<div class="chip" data-k="${k}"><span>${esc(name)}<div class="bar"><i style="width:${Math.max(8,Math.round(n/max*100))}%"></i></div></span><b>${n}</b></div>`).join('')
      + `</div></div>`;
  }
  $('#facet-out').innerHTML = h;

  $('#facet-out').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const unit = c.dataset.unit, k = c.dataset.k;
    const spans = c.querySelectorAll('span');
    const name = spans[0]?.textContent.trim() || '';
    // 问答链路已不做筛选，因此这里改为「把卡片转成一个自然语言问题」直接提问，
    // 既保留卡片到问答的联动，又不会因为筛选而截断概念内容。
    if(unit){
      const title = spans[1]?.textContent.trim() || '';
      askQuestion(`${unit}${title ? ' ' + title : ''} 的核心内容是什么？`);
    }
    else if(k === 'philosopher') askQuestion(`${name} 的核心思想是什么？`);
    else if(k === 'concept') askQuestion(`什么是${name}？`);
  });
}

// ---------- 初始化 ----------
(async function init(){
  try{
    const s = await jget('/api/stats');
    const m = s.manifest;
    $('#stat').textContent = `《${m.doc_title}》　${m.chunk_count} 块 · ${m.unit_count} 单元 · ${m.embedding_backend}/${m.vector_dim} 维`;
    loadFacets();
  }catch(e){
    $('#stat').textContent = '初始化失败：' + e.message;
  }
})();
</script>
</body>
</html>
"""
