"""从规范化语料生成「哲学大纲」体系目录，写入 lexicon/哲学大纲_体系.yaml。

体系目录是全书 338 个数值单元（`1` / `1-1` / `1-1-1` / `1-1-1-1`）的完整清单，
检索时用于：① 按字头/卷过滤 ② 展示单元全名 ③ 校验索引覆盖是否完整。

用法：
    python scripts/gen_taxonomy.py            # 读 config.yaml 指定的语料
    python scripts/gen_taxonomy.py <语料> <输出>
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent

# 字头定义（书首体例说明 + 各卷开篇）
AXES = {
    "字头": [
        {"code": "1", "name": "形而下学", "alias": "实在论 / Realism",
         "note": "尚未拥有自身本体论与自然学的状态，默认一个融贯均匀的场，一切皆可被对象化定位"},
        {"code": "2", "name": "形而上学", "alias": "Metaphysics",
         "note": "意识到「存在者整体」与「一切之所在」（场）之间的二分张力"},
        {"code": "3", "name": "观念论", "alias": "Idealism",
         "note": "把握主体性作为符号系统的动力学机制，以「无」为不可填充的匮乏"},
        {"code": "4", "name": "实践", "alias": "Practice",
         "note": "坚持总体与总体化之差异、并随时对哲学姿态保持警惕的辩证唯物主义姿态"},
    ],
    "四层": [
        {"code": "1", "name": "场域论", "alias": "field",
         "note": "编号第一位：存在者整体所处之场如何被设想"},
        {"code": "2", "name": "本体论", "alias": "ontology",
         "note": "编号第二位：存在者整体被如何把握"},
        {"code": "3", "name": "认识论", "alias": "epistemology",
         "note": "编号第三位：知识如何可能、主体以何方式通达对象"},
        {"code": "4", "name": "目的论", "alias": "teleology",
         "note": "编号第四位：体系指向的终极目标或运动方向"},
    ],
    "四话语": [
        {"code": "1", "name": "主人话语", "alias": "master's discourse",
         "note": "以主人能指为动因，命令被划杠的主体去生产知识，其真相是剩余快感"},
        {"code": "2", "name": "大学话语", "alias": "university discourse",
         "note": "以知识为动因，把主体安置为被研究对象，是一字头科学主义的典型结构"},
        {"code": "3", "name": "癔症话语", "alias": "hysteric's discourse",
         "note": "以被划杠的主体为动因，向主人质询「我是什么」，是问题意识的来源"},
        {"code": "4", "name": "分析家话语", "alias": "analyst's discourse",
         "note": "以对象a为动因，反转大学话语，指向剩余快感与症状的真相"},
    ],
}


def parse(corpus: Path) -> tuple[list[str], list[dict]]:
    """单遍扫描语料：按出现顺序记录卷与单元，并把单元归属到当前卷。"""
    volumes: list[str] = []
    units: list[dict] = []
    cur_vol: str | None = None

    for line in corpus.read_text(encoding="utf-8").split("\n"):
        if line.startswith("# ") and not line.startswith("## "):
            cur_vol = line[2:].strip()
            volumes.append(cur_vol)
            continue
        m = re.match(r"^(#{2,5}) (\d+(?:-\d+){0,3}) (.+)$", line)
        if m:
            units.append({
                "code": m.group(2),
                "title": m.group(3).strip(),
                "depth": len(m.group(1)) - 1,   # 卷=1，其后的数值单元层级
                "volume": cur_vol,
            })
    return volumes, units


def main() -> None:
    if len(sys.argv) >= 3:
        corpus, dest = Path(sys.argv[1]), Path(sys.argv[2])
    else:
        cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
        corpus = ROOT / cfg["doc"]["source"]
        dest = ROOT / "lexicon" / "哲学大纲_体系.yaml"

    volumes, units = parse(corpus)
    doc = {
        "title": "哲学大纲",
        "note": "由 scripts/gen_taxonomy.py 从规范化语料自动生成，勿手工编辑单元目录部分",
        "volumes": volumes,
        "axes": AXES,
        "units": units,
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        yaml.safe_dump(doc, allow_unicode=True, sort_keys=False, width=200),
        encoding="utf-8",
    )
    print(f"卷 {len(volumes)} 个，单元 {len(units)} 个 → {dest}")


if __name__ == "__main__":
    main()
