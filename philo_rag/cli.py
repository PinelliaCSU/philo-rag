"""命令行入口。

    prepare  采集清洗语料        build   构建索引
    ask      引用溯源问答        term    术语索引与语义检索
    facets   分面统计与体系浏览
    eval     检索质量评测        stats   索引概览
    serve    Web 服务            demo    一键自检
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import yaml

try:  # Windows 控制台默认 GBK，强制 UTF-8 以免中文乱码
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from . import output as output_mod
from .answer import answer as answer_fn
from .index import Store
from .lexicon import Lexicon
from .retrieve import facet_summary, term_lookup

# 相对路径字段 → 相对 config.yaml 所在目录解析
_PATH_KEYS = [
    ("doc", "raw"),
    ("doc", "source"),
    ("doc", "store_dir"),
    ("lexicon", "philosophers"),
    ("lexicon", "concepts"),
    ("lexicon", "taxonomy"),
    ("output", "dir"),
]


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    root = path.resolve().parent
    cfg["_root"] = str(root)
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
    )


def open_store(cfg: dict) -> tuple[Store, Lexicon]:
    lex = get_lexicon(cfg)
    store_dir = Path(cfg["doc"]["store_dir"])
    if not (store_dir / "chunks.jsonl").exists():
        raise SystemExit(f"索引不存在：{store_dir}\n请先运行：python -m philo_rag.cli build")
    return Store.load(store_dir, lex), lex


def _rule(title: str) -> None:
    print(f"\n{'=' * 4} {title} {'=' * 4}")


def _emit(kind: str, result: dict, args: argparse.Namespace, cfg: dict) -> None:
    """统一输出：--out 落盘，否则按 --format 打到终端。"""
    fmt = getattr(args, "format", None) or cfg.get("output", {}).get("format", "md")
    if getattr(args, "out", None):
        dest = output_mod.write(kind, result, cfg, fmt, Path(args.out))
        print(f"已写入 {dest}")
        return
    print(output_mod.render(kind, result, fmt, cfg))


# --------------------------------------------------------------------------- #
# 命令
# --------------------------------------------------------------------------- #
def cmd_prepare(cfg: dict, args: argparse.Namespace) -> None:
    from .prepare import prepare

    doc = cfg["doc"]
    info = prepare(
        Path(doc["raw"]), Path(doc["source"]),
        strip_annotations=bool(doc.get("strip_annotations", False)),
        skip_front_matter=bool(doc.get("skip_front_matter", True)),
    )
    _rule("采集与清洗完成")
    for k, v in info.items():
        print(f"  {k:10s} {v}")


def cmd_build(cfg: dict, args: argparse.Namespace) -> None:
    import jieba

    jieba.setLogLevel(logging.ERROR)
    lex = get_lexicon(cfg)
    store = Store.build(cfg, lex)
    store.save(Path(cfg["doc"]["store_dir"]))
    _rule("索引构建完成")
    for k, v in store.manifest.items():
        print(f"  {k:20s} {v}")


def cmd_stats(cfg: dict, args: argparse.Namespace) -> None:
    store, lex = open_store(cfg)
    _rule(f"索引概览 · {store.manifest.get('doc_title', '')}")
    for k in ("doc_id", "chunk_count", "quote_count", "footnote_count",
              "avg_chunk_chars", "unit_count", "embedding_backend", "embedding_model",
              "vector_dim", "built_at"):
        print(f"  {k:20s} {store.manifest.get(k, '')}")
    _rule("体系结构")
    print(f"  卷：{' / '.join(lex.volumes)}")
    for axis in ("字头", "四层", "四话语"):
        items = lex.axis(axis)
        print(f"  {axis}：" + "　".join(f"{x['code']}={x['name']}" for x in items))


def cmd_ask(cfg: dict, args: argparse.Namespace) -> None:
    store, lex = open_store(cfg)
    res = answer_fn(
        store, lex, args.question, cfg,
        philosophers=args.philosopher, era=args.era, concept=args.concept,
        school=args.school, unit=args.unit, volume=args.volume,
    )
    _emit("answer", res, args, cfg)


def cmd_term(cfg: dict, args: argparse.Namespace) -> None:
    store, lex = open_store(cfg)
    res = term_lookup(store, lex, args.term, cfg, top_k=args.limit)
    _emit("term", res, args, cfg)


def cmd_facets(cfg: dict, args: argparse.Namespace) -> None:
    store, lex = open_store(cfg)
    _emit("facets", facet_summary(store, lex), args, cfg)


def cmd_eval(cfg: dict, args: argparse.Namespace) -> None:
    from .evaluate import evaluate

    store, lex = open_store(cfg)
    golden = None
    if args.golden:
        golden = json.loads(Path(args.golden).read_text(encoding="utf-8"))
    res = evaluate(store, lex, cfg, top_k=args.top_k, golden=golden)
    _emit("eval", res, args, cfg)


def cmd_serve(cfg: dict, args: argparse.Namespace) -> None:
    from .server import serve

    serve(cfg, host=args.host, port=args.port, reload=args.reload)


def cmd_demo(cfg: dict, args: argparse.Namespace) -> None:
    """一键自检：采集 → 建索引 → 跑通三类检索。"""
    from .prepare import prepare

    doc = cfg["doc"]
    if args.rebuild or not Path(doc["source"]).exists():
        prepare(Path(doc["raw"]), Path(doc["source"]),
                strip_annotations=bool(doc.get("strip_annotations", False)),
                skip_front_matter=bool(doc.get("skip_front_matter", True)))

    import jieba

    jieba.setLogLevel(logging.ERROR)
    lex = get_lexicon(cfg)
    store = Store.build(cfg, lex)
    store.save(Path(cfg["doc"]["store_dir"]))

    _rule("0. 索引概览")
    for k in ("doc_title", "chunk_count", "quote_count", "embedding_backend", "vector_dim"):
        print(f"  {k:20s} {store.manifest[k]}")

    for q in ["什么是字头？", "四层分别是什么？", "1-1 科学实在论的核心是什么？"]:
        _rule(f"问答：{q}")
        res = answer_fn(store, lex, q, cfg)
        print(res["answer"])
        print("  来源：" + " | ".join(c["citation"] for c in res["citations"][:2]))

    for t in ["大他者", "客体小a", "场域论"]:
        _rule(f"术语：{t}")
        res = term_lookup(store, lex, t, cfg, top_k=2)
        card = res["card"]
        if card:
            print(f"  {card['name']}（{card['philosopher']}，{card['lifespan']}）：{card['definition']}")
        print(f"  精确命中 {res['exact_total']} 块")

    _rule("自检通过")


# --------------------------------------------------------------------------- #
def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--format", choices=output_mod.FORMATS, help="输出格式")
    p.add_argument("--out", help="输出到文件（不指定则打印到终端）")


def _add_filters(p: argparse.ArgumentParser) -> None:
    p.add_argument("--philosopher", action="append",
                   help="限定相关理论家（含语境提及），可重复")
    p.add_argument("--era", help="限定年代")
    p.add_argument("--concept", help="限定概念")
    p.add_argument("--school", help="限定流派")
    p.add_argument("--unit", help="限定数值单元编号（如 1-1 / 3-2-1，或字头 1）")
    p.add_argument("--volume", help="限定卷（如 '第 1 卷 实在论'）")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="philo_rag", description="哲学大纲知识库 · 检索与问答")
    parser.add_argument("--config", default="config.yaml", help="配置文件路径")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("prepare", help="采集并清洗原始语料").set_defaults(func=cmd_prepare)
    sub.add_parser("build", help="构建索引").set_defaults(func=cmd_build)
    sub.add_parser("stats", help="索引概览").set_defaults(func=cmd_stats)

    p_ask = sub.add_parser("ask", help="引用溯源问答")
    p_ask.add_argument("question")
    _add_filters(p_ask)
    _add_common(p_ask)
    p_ask.set_defaults(func=cmd_ask)

    p_term = sub.add_parser("term", help="术语索引与语义检索")
    p_term.add_argument("term")
    p_term.add_argument("--limit", type=int, default=8)
    _add_common(p_term)
    p_term.set_defaults(func=cmd_term)

    p_facets = sub.add_parser("facets", help="分面统计")
    _add_common(p_facets)
    p_facets.set_defaults(func=cmd_facets)

    p_eval = sub.add_parser("eval", help="检索质量回归评测")
    p_eval.add_argument("--top-k", type=int, default=8)
    p_eval.add_argument("--golden", help="自定义标注集 JSON 路径")
    _add_common(p_eval)
    p_eval.set_defaults(func=cmd_eval)

    p_serve = sub.add_parser("serve", help="启动 Web 服务")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--reload", action="store_true")
    p_serve.set_defaults(func=cmd_serve)

    p_demo = sub.add_parser("demo", help="一键自检")
    p_demo.add_argument("--rebuild", action="store_true", help="强制重新采集语料")
    p_demo.set_defaults(func=cmd_demo)

    args = parser.parse_args(argv)
    cfg = load_config(Path(args.config))
    args.func(cfg, args)


if __name__ == "__main__":
    main()
