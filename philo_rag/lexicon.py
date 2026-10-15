"""词典层：别名归一、术语索引、查询扩展、年代计算。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def _load_yaml(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class Lexicon:
    """哲学家词典 + 概念词典 + 主题词典 + 体系目录的统一入口。

    职责：
      1. 文本 → 标准哲学家名 / 标准概念名（别名归一）
      2. 查询扩展（术语 → 别名、外文名）
      3. 哲学家 → 年代 / 世纪 / 流派
      4. 数值单元编号 → 单元名 / 卷 / 字头（哲学大纲体系目录）
      5. 主题词 → 流派/思潮锚点（哲学家 / 概念 / 单元三路展开）
    """

    def __init__(
        self,
        philosophers_path: Path,
        concepts_path: Path,
        taxonomy_path: Path | None = None,
        themes_path: Path | None = None,
    ) -> None:
        self.philosophers: dict[str, dict[str, Any]] = {}
        self.concepts: dict[str, dict[str, Any]] = {}
        self.themes: list[dict[str, Any]] = []
        self._phil_alias: list[tuple[str, str]] = []
        self._concept_alias: list[tuple[str, str]] = []
        self._theme_alias: list[tuple[str, str]] = []
        # 体系目录
        self.title: str = ""
        self.volumes: list[str] = []
        self.axes: dict[str, list[dict[str, Any]]] = {}
        self.units: list[dict[str, Any]] = []
        self._unit_by_code: dict[str, dict[str, Any]] = {}
        self._load(philosophers_path, concepts_path, taxonomy_path, themes_path)

    def _load(
        self,
        philosophers_path: Path,
        concepts_path: Path,
        taxonomy_path: Path | None,
        themes_path: Path | None,
    ) -> None:
        raw = _load_yaml(philosophers_path) or {}
        for item in raw.get("philosophers", []):
            name = item["name"]
            self.philosophers[name] = item
            for alias in [name, *item.get("aliases", [])]:
                if alias:
                    self._phil_alias.append((alias, name))

        raw = _load_yaml(concepts_path) or {}
        for item in raw.get("concepts", []):
            name = item["name"]
            self.concepts[name] = item
            for alias in [name, *item.get("aliases", [])]:
                if alias:
                    self._concept_alias.append((alias, name))

        # 长别名优先匹配，避免「理念」抢先于「理念论」
        self._phil_alias.sort(key=lambda x: len(x[0]), reverse=True)
        self._concept_alias.sort(key=lambda x: len(x[0]), reverse=True)

        if taxonomy_path and taxonomy_path.exists():
            tax = _load_yaml(taxonomy_path) or {}
            self.title = tax.get("title", "")
            self.volumes = list(tax.get("volumes", []))
            self.axes = tax.get("axes", {}) or {}
            self.units = list(tax.get("units", []))
            for u in self.units:
                self._unit_by_code.setdefault(u["code"], u)

        # 主题词典（流派/思潮级）；cli.get_lexicon 未透传时按词典同目录回退，
        # 该目录与 config.yaml 中 lexicon.themes 的配置路径一致。
        if themes_path is None:
            themes_path = philosophers_path.parent / "themes.yaml"
        if themes_path.exists():
            raw = _load_yaml(themes_path) or {}
            for item in raw.get("themes", []):
                name = item["name"]
                self.themes.append(item)
                for alias in [name, *item.get("aliases", [])]:
                    if alias:
                        self._theme_alias.append((alias, name))
            self._theme_alias.sort(key=lambda x: len(x[0]), reverse=True)

    # ---------- 匹配 ----------

    @staticmethod
    def _scan(text: str, aliases: list[tuple[str, str]], occupied: list[tuple[int, int]]) -> list[str]:
        """在文本中扫描别名，返回命中的标准名（去重、保序）。

        occupied 记录已被更长别名占用的区间，避免「理念论」命中后「理念」重复命中。
        """
        hits: list[tuple[int, str]] = []
        for alias, std in aliases:
            idx = text.find(alias)
            while idx != -1:
                end = idx + len(alias)
                if not any(s < end and idx < e for s, e in occupied):
                    occupied.append((idx, end))
                    hits.append((idx, std))
                idx = text.find(alias, idx + 1)
        hits.sort(key=lambda x: x[0])
        out: list[str] = []
        for _, std in hits:
            if std not in out:
                out.append(std)
        return out

    def match_philosophers(self, text: str) -> list[str]:
        return self._scan(text, self._phil_alias, [])

    def match_concepts(self, text: str) -> list[str]:
        return self._scan(text, self._concept_alias, [])

    def match_themes(self, topic: str) -> list[dict[str, Any]]:
        """按主题名/别名匹配，返回命中的主题记录（保序、去重）。"""
        names = self._scan(topic, self._theme_alias, [])
        by_name = {t["name"]: t for t in self.themes}
        return [by_name[n] for n in names if n in by_name]

    def theme_anchors(self, topic: str) -> tuple[list[str], list[str], list[str]]:
        """主题词 → (philosophers, concepts, units) 三锚点。

        按首个命中主题展开其理论家/概念/单元；无命中返回 ([], [], [])。
        仅保留在对应词典中真实存在的标准名与单元编码。
        """
        matches = self.match_themes(topic)
        if not matches:
            return [], [], []
        theme = matches[0]
        phils = [str(p) for p in theme.get("philosophers", []) if p in self.philosophers]
        concs = [str(c) for c in theme.get("concepts", []) if c in self.concepts]
        units = [str(u) for u in theme.get("units", []) if str(u) in self._unit_by_code]
        return (
            list(dict.fromkeys(phils)),
            list(dict.fromkeys(concs)),
            list(dict.fromkeys(units)),
        )

    def iter_philosophers(self, text: str) -> list[tuple[int, int, str]]:
        """返回 [(起偏移, 止偏移, 标准名)]，按出现位置排序。

        与 match_philosophers 的区别是保留了字符位置，供「引文说话人归因」这类
        需要判断「人名离引文有多远」的场景使用。长别名优先，已占用区间不重复命中。
        """
        occupied: list[tuple[int, int]] = []
        hits: list[tuple[int, int, str]] = []
        for alias, std in self._phil_alias:
            idx = text.find(alias)
            while idx != -1:
                end = idx + len(alias)
                if not any(s < end and idx < e for s, e in occupied):
                    occupied.append((idx, end))
                    hits.append((idx, end, std))
                idx = text.find(alias, idx + 1)
        hits.sort(key=lambda x: x[0])
        return hits

    def iter_concepts(self, text: str) -> list[tuple[int, int, str]]:
        occupied: list[tuple[int, int]] = []
        hits: list[tuple[int, int, str]] = []
        for alias, std in self._concept_alias:
            idx = text.find(alias)
            while idx != -1:
                end = idx + len(alias)
                if not any(s < end and idx < e for s, e in occupied):
                    occupied.append((idx, end))
                    hits.append((idx, end, std))
                idx = text.find(alias, idx + 1)
        hits.sort(key=lambda x: x[0])
        return hits

    # ---------- 年代 ----------

    def era_of(self, philosopher: str) -> str:
        return self.philosophers.get(philosopher, {}).get("era", "")

    def school_of(self, philosopher: str) -> str:
        return self.philosophers.get(philosopher, {}).get("school", "")

    def century_of(self, philosopher: str) -> str:
        """由生年推算世纪标签，用于「按年代」检索与排序。"""
        info = self.philosophers.get(philosopher)
        if not info or info.get("birth") is None:
            return ""
        year = int(info["birth"])
        if year < 0:
            n = (-year - 1) // 100 + 1
            return f"公元前{n}世纪"
        return f"{year // 100 + 1}世纪"

    def eras_of(self, philosophers: list[str]) -> list[str]:
        out: list[str] = []
        for p in philosophers:
            era = self.era_of(p)
            if era and era not in out:
                out.append(era)
        return out

    def lifespan(self, philosopher: str) -> str:
        info = self.philosophers.get(philosopher)
        if not info:
            return ""
        b, d = info.get("birth"), info.get("death")

        def fmt(y: int | None) -> str:
            if y is None:
                return "?"
            return f"前{-y}" if y < 0 else str(y)

        return f"{fmt(b)}—{fmt(d)}"

    # ---------- 查询扩展 ----------

    def expand_query(self, query: str) -> list[str]:
        """把查询中的术语替换/扩展为其别名与外文名，提升召回。"""
        terms: list[str] = []
        for alias, std in self._concept_alias:
            if alias in query and std not in terms:
                terms.append(std)
        for alias, std in self._phil_alias:
            if alias in query and std not in terms:
                terms.append(std)

        expansions: list[str] = []
        for std in terms:
            if std in self.concepts:
                expansions.extend(self.concepts[std].get("aliases", []))
            if std in self.philosophers:
                expansions.extend(self.philosophers[std].get("aliases", []))
        extra = [e for e in expansions if e not in query]
        return extra

    def concept_card(self, term: str) -> dict[str, Any] | None:
        """术语卡：标准名 → 定义 / 首见哲学家 / 别名。"""
        std = term
        if term not in self.concepts:
            for alias, name in self._concept_alias:
                if alias == term:
                    std = name
                    break
        info = self.concepts.get(std)
        if not info:
            return None
        return {
            "name": std,
            "definition": info.get("definition", ""),
            "philosopher": info.get("philosopher", ""),
            "aliases": info.get("aliases", []),
            "lifespan": self.lifespan(info.get("philosopher", "")),
            "era": self.era_of(info.get("philosopher", "")),
            "school": self.school_of(info.get("philosopher", "")),
        }

    # ---------- 体系目录 ----------

    def unit(self, code: str) -> dict[str, Any] | None:
        return self._unit_by_code.get(code)

    def unit_title(self, code: str) -> str:
        u = self._unit_by_code.get(code)
        return u["title"] if u else ""

    def volume_of(self, code: str) -> str:
        u = self._unit_by_code.get(code)
        return u.get("volume", "") if u else ""

    def head_of(self, code: str) -> str:
        """数值编号的首位数字对应的字头名（1 形而下学 … 4 实践）。"""
        if not code:
            return ""
        for item in self.axes.get("字头", []):
            if item["code"] == code.split("-")[0]:
                return item["name"]
        return ""

    def layer_names(self) -> list[str]:
        """四层的名称，按编号位序：场域论 / 本体论 / 认识论 / 目的论。"""
        return [x["name"] for x in self.axes.get("四层", [])]

    def axis(self, name: str) -> list[dict[str, Any]]:
        return self.axes.get(name, [])

    def codes_under(self, prefix: str) -> list[str]:
        """返回某编号下的全部子单元编号（含自身）。"""
        return [u["code"] for u in self.units
                if u["code"] == prefix or u["code"].startswith(prefix + "-")]
