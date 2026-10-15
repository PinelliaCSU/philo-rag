"""命令行入口。

    prepare  采集清洗语料        build   构建索引
    ask      溯源回答（自动判定点查询 / 范围查询）
    term     术语索引与语义检索  quote   引文检索
    facets   分面统计与体系浏览
    eval     检索质量评测        stats   索引概览
    serve    Web 服务            demo    一键自检

`ask` 是唯一的问答入口：内部按问题诉求自动选择召回策略——
「什么是字头？」走点查询（少而准），「马克思在体系中的位置」走范围查询
（高召回 + 按单元聚合，输出与专题提炼同量级）。需要强制时用 `--strategy`。
"""
from __future__ import annotations

import argparse
import copy
import json
import logging
import os
import re
import sys
import time
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
from .retrieve import facet_summary, quote_payload, term_lookup

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
    if args.no_gate:
        # 调试/对比用：临时关闭问题闸门，强制所有问题进入检索
        cfg.setdefault("gate", {})["enabled"] = False
    if getattr(args, "backend", None):
        # 临时覆盖生成后端，便于对比「离线抽取式」与「云端生成」的回答差异
        cfg.setdefault("answer", {})["backend"] = args.backend
    res = answer_fn(store, lex, args.question, cfg, strategy=args.strategy)
    _emit("answer", res, args, cfg)


def cmd_term(cfg: dict, args: argparse.Namespace) -> None:
    store, lex = open_store(cfg)
    res = term_lookup(store, lex, args.term, cfg, top_k=args.limit)
    _emit("term", res, args, cfg)


def cmd_quote(cfg: dict, args: argparse.Namespace) -> None:
    """引文检索：元数据倒排 + 精确过滤，结果可枚举、可核对。"""
    store, lex = open_store(cfg)
    res = quote_payload(
        store, lex,
        philosopher=args.philosopher, concept=args.concept, era=args.era,
        school=args.school, unit=args.unit, volume=args.volume,
        speaker=args.speaker, keyword=args.keyword, top_k=args.limit,
    )
    _emit("quote", res, args, cfg)


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
    """一键自检：采集 → 建索引 → 跑通三类检索。

    自检的问答环节**固定用离线 template 后端**，这样即使还没配 API Key，
    也能完整验证「索引 → 检索 → 组织证据」这条链路；若 config.yaml 配的是
    云端/本地模型后端，末尾会额外做一次真实的生成调用探测。
    """
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

    # 检索链路自检不依赖任何模型服务：强制离线后端，保证「没配 key 也能跑通」
    demo_cfg = copy.deepcopy(cfg)
    demo_cfg.setdefault("answer", {})["backend"] = "template"

    for q in ["什么是字头？", "四层分别是什么？", "1-1 科学实在论的核心是什么？"]:
        _rule(f"点查询：{q}")
        res = answer_fn(store, lex, q, demo_cfg)
        print(f"  [策略 {res['strategy']}] 回答 {len(res['answer'])} 字")
        print(res["answer"].splitlines()[0] if res["answer"] else "")
        print("  来源：" + " | ".join(c["citation"] for c in res["citations"][:2]))

    for q in ["马克思在体系中的位置", "谈谈精神分析"]:
        _rule(f"范围查询：{q}")
        res = answer_fn(store, lex, q, demo_cfg)
        c = res["theme"]["counts"]
        print(f"  [策略 {res['strategy']}] 回答 {len(res['answer'])} 字　锚点 {res['theme']['anchors']}")
        print(f"  直接命中 {c['direct']} 块（占语料 {c['direct']/c['corpus']:.1%}），"
              f"{c['unit_total']} 个单元")
        top = res["theme"]["units"][:3]
        print("  核心单元：" + "　".join(f"{u['code']} {u['title']}（{u['hits']}块）" for u in top))

    for t in ["大他者", "客体小a", "场域论"]:
        _rule(f"术语：{t}")
        res = term_lookup(store, lex, t, cfg, top_k=2)
        card = res["card"]
        if card:
            print(f"  {card['name']}（{card['philosopher']}，{card['lifespan']}）：{card['definition']}")
        print(f"  精确命中 {res['exact_total']} 块")

    # 生成后端连通性：配置了非离线后端时，额外探测一次真实调用
    backend = str(cfg.get("answer", {}).get("backend", "template"))
    if backend != "template":
        _rule(f"生成后端连通性探测：{backend}")
        try:
            from .answer import generate_text

            t0 = time.perf_counter()
            reply = generate_text("请只回复两个字：就绪", cfg)
            print(f"  ✓ {backend} 可用（{time.perf_counter() - t0:.1f}s）：{reply[:60]}")
        except Exception as exc:  # noqa: BLE001
            print(f"  ✗ {backend} 调用失败：{exc}")
            print("    检索链路自检已通过；请检查 .env / config.yaml 中的 key 与 api_base。")

    _rule("自检通过")


# --------------------------------------------------------------------------- #
def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--format", choices=output_mod.FORMATS, help="输出格式")
    p.add_argument("--out", help="输出到文件（不指定则打印到终端）")


def _add_filters(p: argparse.ArgumentParser) -> None:
    """引文检索的元数据筛选维度（与 facets 的分面一一对应）。"""
    p.add_argument("--philosopher", action="append", help="限定相关理论家（含语境），可重复")
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

    p_ask = sub.add_parser("ask", help="溯源回答（自动判定点查询 / 范围查询）")
    p_ask.add_argument("question")
    p_ask.add_argument("--strategy", choices=["auto", "point", "theme"], default="auto",
                       help="召回策略：auto 自动判定（默认）｜point 强制点查询｜"
                            "theme 强制范围查询（主题综合）")
    p_ask.add_argument("--no-gate", action="store_true",
                       help="关闭问题闸门，强制所有问题进入检索（调试用）")
    p_ask.add_argument("--backend", choices=["template", "ollama", "api"],
                       help="临时覆盖生成后端（默认取 config.yaml 的 answer.backend）")
    _add_common(p_ask)
    p_ask.set_defaults(func=cmd_ask)

    p_term = sub.add_parser("term", help="术语索引与语义检索")
    p_term.add_argument("term")
    p_term.add_argument("--limit", type=int, default=8)
    _add_common(p_term)
    p_term.set_defaults(func=cmd_term)

    p_quote = sub.add_parser("quote", help="引文检索（元数据倒排 + 精确过滤）")
    _add_filters(p_quote)
    p_quote.add_argument("--speaker", action="append",
                         help="限定说话人（只认有引述标记的精确归因），可重复")
    p_quote.add_argument("--keyword", help="引文正文关键词")
    p_quote.add_argument("--limit", type=int, default=20)
    _add_common(p_quote)
    p_quote.set_defaults(func=cmd_quote)

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
    try:
        args.func(cfg, args)
    except (ValueError, RuntimeError) as exc:
        # 配置类错误（缺 key、api_base 为空、接口返回异常…）不必甩堆栈，
        # 直接给出可读原因，退出码非零便于脚本判断。
        print(f"\n[错误] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
