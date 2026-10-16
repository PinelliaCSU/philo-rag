"""输出层：把检索/问答结果渲染成可配置的多种格式。

支持的格式：
  md    —— 人类可读的 Markdown（默认，便于直接阅读与归档）
  json  —— 结构化 JSON（供前端或下游程序消费）
  jsonl —— 每行一条记录（供批量结果追加、数据管道）
  csv   —— 表格（引文检索、分面统计这类列表型结果最适用）
  txt   —— 纯文本（无标记）

设计约定：所有渲染函数只吃「结果字典」，不依赖 Store/Lexicon，
因此 CLI、Web 服务、批处理脚本可以共用同一套渲染逻辑。
"""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from typing import Any

FORMATS = ("md", "json", "jsonl", "csv", "txt")


# --------------------------------------------------------------------------- #
# 通用工具
# --------------------------------------------------------------------------- #
def _csv(rows: list[dict[str, Any]], columns: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: _flat(r.get(k, "")) for k in columns})
    return buf.getvalue()


def _flat(v: Any) -> str:
    if isinstance(v, list):
        return "、".join(str(x) for x in v)
    if isinstance(v, (dict, tuple)):
        return json.dumps(v, ensure_ascii=False)
    return "" if v is None else str(v)


def _dump_json(obj: Any, indent: int = 2) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=indent)


# --------------------------------------------------------------------------- #
# 问答
# --------------------------------------------------------------------------- #
def render_answer(res: dict[str, Any], fmt: str, cfg: dict[str, Any] | None = None) -> str:
    if fmt == "json":
        return _dump_json(res)
    if fmt == "jsonl":
        return json.dumps(res, ensure_ascii=False)
    if fmt == "csv":
        return _csv(
            [{"n": c["n"], **{k: c[k] for k in
                              ("chunk_id", "citation", "unit", "chunk_type",
                               "philosophers", "concepts", "start", "end", "page", "text")}}
             for c in res["citations"]],
            ["n", "chunk_id", "citation", "unit", "chunk_type", "philosophers",
             "concepts", "start", "end", "page", "text"],
        )
    if fmt == "txt":
        if res.get("strategy") == "clarify":
            lines = [f"问题：{res.get('topic', '')}"]
            for opt in res.get("options") or []:
                lines.append(f"- {opt.get('label', '')}：{opt.get('question', '')}")
            return "\n".join(lines)
        lines: list[str] = []
        theme = res.get("theme")
        if theme:
            c = theme["counts"]
            lines.append(f"[聚合] 直接命中 {c['direct']} 块（元数据 {c['meta']} + 字面 {c['literal']}），"
                         f"覆盖 {c['unit_total']} 个数值单元")
            top = theme.get("units", [])[:8]
            if top:
                lines.append("[密度] " + "、".join(
                    f"{u['code'] or '前言'} {u['hits']}块" for u in top))
            lines.append("")
        lines += [res["answer"], ""]
        annotations = res.get("annotations") or []
        for a in annotations:
            if isinstance(a, dict) and a.get("term"):
                lines.append(f"[注解] {a['term']}：{a.get('explanation', '')}")
        if annotations:
            lines.append("")
        for c in res["citations"]:
            lines.append(f"[{c['n']}] {c['citation']}")
        return "\n".join(lines)

    # md（默认）
    if res.get("strategy") == "clarify":
        lines = ["## 问题", "", str(res.get("topic", "")), "", "## 请选择方向"]
        for opt in res.get("options") or []:
            lines.append(f"- **{opt.get('label', '')}**：{opt.get('question', '')}")
        return "\n".join(lines) + "\n"
    if res.get("skipped"):
        # 问题闸门判定不适合检索：没有回答与引用，只说明跳过原因
        gate = res.get("gate") or {}
        return (f"## 问题\n\n{res['question']}\n\n"
                f"## 已跳过检索\n\n{res['answer']}\n\n"
                f"> 判定类别：`{gate.get('category', '')}`\n")
    out = [f"## 问题\n\n{res['question']}\n"]
    theme = res.get("theme")
    if theme:
        # 范围查询：先给聚合概览（该主题在全书怎么分布），再给分节论述。
        # 概览不是装饰——它正是「主题集中度」的可核查依据。
        c = theme["counts"]
        out.append("## 聚合概览\n")
        out.append(
            f"- 直接命中 **{c['direct']}** 块（元数据 {c['meta']} + 字面 {c['literal']}），"
            f"占语料 {c['direct'] / max(c['corpus'], 1):.1%}；覆盖 **{c['unit_total']}** 个数值单元"
        )
        if theme.get("seed_mode"):
            out.append("- 主题未登录词典，锚点由种子检索反推")
        top = theme.get("units", [])[:8]
        if top:
            out.append("- 命中密度（前 8 单元）：" + "、".join(
                f"`{u['code'] or '前言'}` {u['hits']} 块" for u in top))
        lin = theme.get("lineage") or []
        if lin:
            out.append("- 共现理论家：" + "、".join(f"{n}（{k}）" for n, k in lin[:10]))
        out.append("")
    out.append(f"## 回答\n\n{res['answer']}\n")
    annotations = res.get("annotations") or []
    if annotations:
        out.append("## 术语注解\n")
        for a in annotations:
            if isinstance(a, dict) and a.get("term"):
                out.append(f"- **{a['term']}**：{a.get('explanation', '')}")
        out.append("")
    show = (cfg or {}).get("output", {}).get("show_citations", True)
    if show and res["citations"]:
        out.append("## 引用来源\n")
        for c in res["citations"]:
            who = "、".join(c["philosophers"]) or "—"
            con = "、".join(c["concepts"]) or "—"
            lines = [f"- **[{c['n']}]** {c['citation']}"]
            coords = c.get("coords") or []
            if coords:
                lines.append("  - 坐标：" + "｜".join(coords))
            lines.append(f"  - 单元：`{c['unit']}` {c.get('unit_title', '')}")
            lines.append(f"  - 理论家：{who}｜概念：{con}｜相关度：{c['score']}")
            matched = [*(c.get("matched_concepts") or []), *(c.get("matched_philosophers") or [])]
            if matched:
                lines.append("  - 命中注解：" + "、".join(matched))
            lines.append(f"  - 原文：{c['text'][:160].replace(chr(10), ' ')}…")
            out.append("\n".join(lines))
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# 术语检索
# --------------------------------------------------------------------------- #
def render_term(res: dict[str, Any], fmt: str) -> str:
    if fmt == "json":
        return _dump_json(res)
    if fmt == "jsonl":
        return json.dumps(res, ensure_ascii=False)
    rows = [{"hit": "exact", "chunk_id": c.chunk_id, "unit": c.unit_code(),
             "chunk_type": c.chunk_type, "text": c.text} for c in res["exact_hits"]]
    rows += [{"hit": "semantic", "chunk_id": h["chunk"].chunk_id,
              "unit": h["chunk"].unit_code(), "chunk_type": h["chunk"].chunk_type,
              "text": h["chunk"].text} for h in res["semantic_hits"]]
    if fmt == "csv":
        return _csv(rows, ["hit", "chunk_id", "unit", "chunk_type", "text"])
    if fmt == "txt":
        out = [f"术语：{res['term']}"]
        card = res["card"]
        if card:
            out.append(f"定义：{card['definition']}")
        out.append(f"精确命中 {res['exact_total']} 块")
        for r in rows:
            out.append(f"  · {r['text'][:80]}")
        return "\n".join(out)

    out = [f"## 术语：{res['term']}\n"]
    card = res["card"]
    if card:
        out.append(
            f"- **标准名**：{card['name']}\n"
            f"- **别名**：{'、'.join(card['aliases']) or '—'}\n"
            f"- **归属**：{card['philosopher']}（{card['lifespan']}，{card['era']}）\n"
            f"- **定义**：{card['definition']}\n"
        )
    else:
        out.append("> 词典未收录该术语，以下为语义检索结果。\n")
    out.append(f"### 精确命中（{res['exact_total']} 块）\n")
    for c in res["exact_hits"]:
        out.append(f"- `[{c.chunk_id}]` {' / '.join(c.chapter_path)}\n  {c.text[:120]}…")
    out.append("\n### 语义补充命中\n")
    for h in res["semantic_hits"]:
        c = h["chunk"]
        out.append(f"- `[{c.chunk_id}]` score={h['score']:.5f}　{c.text[:110]}…")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# 引文检索
# --------------------------------------------------------------------------- #
def render_quote(res: dict[str, Any], fmt: str) -> str:
    quotes = res["quotes"]
    if fmt == "json":
        return _dump_json(res)
    if fmt == "jsonl":
        return "\n".join(json.dumps(q, ensure_ascii=False) for q in quotes)
    # 说话人只认 speaker 字段（有引述标记才赋值）；philosophers 含上下文人物，
    # 是**过滤**维度而非说话人，必须分开呈现，否则会把「顺便提到」误读成「说的」。
    rows = [{"speaker": q["speaker"] or "未署名", "unit": q["unit"],
             "unit_title": q["unit_title"], "philosophers": q["philosophers"],
             "concepts": q["concepts"], "citation": q["citation"],
             "page": q["page"], "text": q["text"]} for q in quotes]
    if fmt == "csv":
        return _csv(rows, ["speaker", "unit", "unit_title", "philosophers",
                           "concepts", "page", "citation", "text"])
    if fmt == "txt":
        return "\n".join(f"「{q['text']}」\n    —— {q['speaker'] or '未署名'}｜{q['citation']}"
                         for q in quotes) + "\n"

    out = [f"## 引文检索（命中 {len(quotes)} 条）\n",
           f"筛选条件：{res['filters']}\n"]
    for q in quotes:
        who = f"**{q['speaker']}**" if q["speaker"] else "未署名"
        rel = "、".join(q["philosophers"][:6])
        out.append(f"> 「{q['text']}」\n>\n> —— {who}｜{q['citation']}"
                   + (f"\n> 相关理论家：{rel}" if rel else "") + "\n")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# 分面统计
# --------------------------------------------------------------------------- #
def render_facets(res: dict[str, Any], fmt: str) -> str:
    if fmt == "json":
        return _dump_json(res)
    if fmt == "jsonl":
        return "\n".join(json.dumps({"facet": k, "value": v, "count": n},
                                    ensure_ascii=False)
                         for k, items in res.items() for v, n in items)
    if fmt == "csv":
        return _csv([{"facet": k, "value": v, "count": n}
                     for k, items in res.items() for v, n in items],
                    ["facet", "value", "count"])
    if fmt == "txt":
        return "\n".join(f"{k}: " + " ".join(f"{v}×{n}" for v, n in items)
                         for k, items in res.items()) + "\n"
    out = ["# 分面统计\n"]
    for k, items in res.items():
        out.append(f"## {k}（{len(items)} 项）\n")
        out.append("　".join(f"`{v}`×{n}" for v, n in items[:60]) + "\n")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# 评测
# --------------------------------------------------------------------------- #
def render_eval(res: dict[str, Any], fmt: str) -> str:
    if fmt == "json":
        return _dump_json(res)
    if fmt == "jsonl":
        return "\n".join(json.dumps(r, ensure_ascii=False) for r in res["rows"])
    if fmt == "csv":
        return _csv(res["rows"], ["q", "must", "rank", "top1"])
    if fmt == "txt":
        lines = [f"Hit@1={res['hit@1']:.2%} Hit@3={res['hit@3']:.2%} MRR={res['mrr']:.4f}"]
        lines += [f"{'OK ' if r['rank'] else 'MISS'} {r['q']}" for r in res["rows"]]
        return "\n".join(lines) + "\n"
    out = [f"# 检索质量评测（{res['n']} 条，top_k={res['top_k']}）\n",
           f"| 指标 | 值 |\n|---|---|\n"
           f"| Hit@1 | {res['hit@1']:.2%} |\n"
           f"| Hit@3 | {res['hit@3']:.2%} |\n"
           f"| Hit@{res['top_k']} | {res['hit@%d' % res['top_k']]:.2%} |\n"
           f"| MRR | {res['mrr']:.4f} |\n",
           "## 逐题结果\n"]
    for r in res["rows"]:
        mark = "✅" if r["rank"] else "❌"
        pos = f"#{r['rank']}" if r["rank"] else "—"
        out.append(f"- {mark} `{pos}` {r['q']}")
    return "\n".join(out) + "\n"


RENDERERS = {
    "answer": render_answer,
    "term": render_term,
    "quote": render_quote,
    "facets": render_facets,
    "eval": render_eval,
}


def render(kind: str, result: dict[str, Any], fmt: str = "md",
           cfg: dict[str, Any] | None = None) -> str:
    fmt = (fmt or "md").lower()
    if fmt not in FORMATS:
        raise ValueError(f"不支持的输出格式：{fmt}（可选 {', '.join(FORMATS)}）")
    fn = RENDERERS[kind]
    return fn(result, fmt, cfg) if kind == "answer" else fn(result, fmt)


def write(kind: str, result: dict[str, Any], cfg: dict[str, Any],
          fmt: str | None = None, dest: Path | None = None) -> Path:
    """渲染并落盘，返回输出文件路径。"""
    o_cfg = cfg.get("output", {})
    fmt = (fmt or o_cfg.get("format", "md")).lower()
    text = render(kind, result, fmt, cfg)
    if dest is None:
        stem = _stem(kind, result)
        out_dir = Path(o_cfg.get("dir", "outputs"))
        if not out_dir.is_absolute():
            out_dir = Path(cfg.get("_root", ".")) / out_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        dest = out_dir / f"{stem}.{fmt}"
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    return dest


def _stem(kind: str, result: dict[str, Any]) -> str:
    import re
    from datetime import datetime

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    raw = result.get("question") or result.get("term") or kind
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", str(raw))[:32].strip("-") or kind
    return f"{kind}_{slug}_{ts}"
