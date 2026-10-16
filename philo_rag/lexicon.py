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
        # 别名守卫：单字别名默认要求整词命中；词条可用 guard.compounds 再排除复合词
        self._token_alias: set[str] = set()
        self._compound_of: dict[str, list[str]] = {}
        self._tok_cache_text: str | None = None
        self._tok_cache_spans: set[tuple[int, int]] | None = None
        self._cmp_cache_text: str | None = None
        self._cmp_cache: dict[str, list[tuple[int, int]]] = {}
        self._layer_names: list[str] = []
        # 实际载入的词典文件（供索引指纹校验：文件内容变更后可比对索引是否过期）
        self.sources: dict[str, Path] = {}
        # 体系目录
        self.title: str = ""
        self.volumes: list[str] = []
        self.axes: dict[str, list[dict[str, Any]]] = {}
        self.units: list[dict[str, Any]] = []
        self._unit_by_code: dict[str, dict[str, Any]] = {}
        # 同码单元：一个编号可能对应多个条目（如各卷的「复习课」），编号不是主键
        self.units_by_code: dict[str, list[dict[str, Any]]] = {}
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
            self._register_aliases(item, self._phil_alias)

        raw = _load_yaml(concepts_path) or {}
        for item in raw.get("concepts", []):
            name = item["name"]
            self.concepts[name] = item
            self._register_aliases(item, self._concept_alias)

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
                self.units_by_code.setdefault(u["code"], []).append(u)
            # 四层名称按编号位序排列，供 unit 编码 → 坐标注解（见 coords_of）
            self._layer_names = [
                str(x.get("name", ""))
                for x in sorted(self.axes.get("四层", []), key=lambda x: str(x.get("code", "")))
            ]

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

        # 记录本次真正读入的文件，供 manifest 指纹与一致性校验使用
        self.sources = {"philosophers": Path(philosophers_path), "concepts": Path(concepts_path)}
        if taxonomy_path and Path(taxonomy_path).exists():
            self.sources["taxonomy"] = Path(taxonomy_path)
        if themes_path and Path(themes_path).exists():
            self.sources["themes"] = Path(themes_path)

    # ---------- 匹配 ----------
    #
    # 别名匹配是「元数据注解」的唯一来源，精度直接决定检索可信度。两条守卫：
    #   * 单字别名（道 / 无 / 空 / 物 / 伪 …）默认要求**整词命中**：只有 jieba 把它切成
    #     一个独立词元才算，避免「道德」里的「道」、「事物」里的「物」这类误配；
    #   * 词条可写 `guard.token: [别名…]` 追加整词别名，`guard.compounds: [复合词…]`
    #     把已知误配的更长复合词整体排除（如 德性 排除 道德性）。
    # 分词不可用或切分不无损时退回旧的子串匹配：宁可多标，不可漏标。

    def _register_aliases(self, item: dict[str, Any], dest: list[tuple[str, str]]) -> None:
        """登记词条的别名并计算守卫（标准名为 item['name']）。"""
        guard = item.get("guard") or {}
        token_alias = {str(a) for a in (guard.get("token") or [])}
        compounds = [str(c) for c in (guard.get("compounds") or [])]
        for alias in [item["name"], *item.get("aliases", [])]:
            if not alias:
                continue
            dest.append((alias, item["name"]))
            if len(alias) == 1 or alias in token_alias:
                self._token_alias.add(alias)
            for comp in compounds:
                if alias in comp:
                    self._compound_of.setdefault(alias, []).append(comp)

    def _token_spans(self, text: str) -> set[tuple[int, int]] | None:
        """jieba 词元区间；文本不含整词守卫别名或切分不无损时返回 None。"""
        if text is self._tok_cache_text:
            return self._tok_cache_spans
        spans: set[tuple[int, int]] | None = None
        if any(a in text for a in self._token_alias):
            import jieba

            spans = set()
            pos = 0
            for tok in jieba.lcut(text):
                if tok:
                    spans.add((pos, pos + len(tok)))
                    pos += len(tok)
            if pos != len(text):  # 切分不无损，守卫失效 → 退回子串匹配
                spans = None
        self._tok_cache_text = text
        self._tok_cache_spans = spans
        return spans

    def _compound_ranges(self, text: str) -> dict[str, list[tuple[int, int]]]:
        """复合词排除区间：别名 → 需要排除的区间列表。"""
        if not self._compound_of:
            return {}
        if text is self._cmp_cache_text:
            return self._cmp_cache
        out: dict[str, list[tuple[int, int]]] = {}
        for alias, comps in self._compound_of.items():
            spans: list[tuple[int, int]] = []
            for comp in comps:
                idx = text.find(comp)
                while idx != -1:
                    spans.append((idx, idx + len(comp)))
                    idx = text.find(comp, idx + 1)
            if spans:
                out[alias] = spans
        self._cmp_cache_text = text
        self._cmp_cache = out
        return out

    def _iter_alias_hits(self, text: str, aliases: list[tuple[str, str]]) -> list[tuple[int, int, str]]:
        """按别名表扫描文本，返回 [(起偏移, 止偏移, 标准名)]（按出现位置排序）。

        长别名优先，已占用区间不重复命中；再叠加整词 / 复合词守卫。
        """
        token_spans = self._token_spans(text) if self._token_alias else None
        compound_ranges = self._compound_ranges(text)
        occupied: list[tuple[int, int]] = []
        hits: list[tuple[int, int, str]] = []
        for alias, std in aliases:
            idx = text.find(alias)
            while idx != -1:
                end = idx + len(alias)
                blocked = token_spans is not None and alias in self._token_alias \
                    and (idx, end) not in token_spans
                if not blocked:
                    for s, e in compound_ranges.get(alias, ()):
                        if s < end and idx < e:
                            blocked = True
                            break
                if not blocked and not any(s < end and idx < e for s, e in occupied):
                    occupied.append((idx, end))
                    hits.append((idx, end, std))
                idx = text.find(alias, idx + 1)
        hits.sort(key=lambda x: x[0])
        return hits

    def match_philosophers(self, text: str) -> list[str]:
        out: list[str] = []
        for _, _, std in self._iter_alias_hits(text, self._phil_alias):
            if std not in out:
                out.append(std)
        return out

    def match_concepts(self, text: str) -> list[str]:
        out: list[str] = []
        for _, _, std in self._iter_alias_hits(text, self._concept_alias):
            if std not in out:
                out.append(std)
        return out

    def match_themes(self, topic: str) -> list[dict[str, Any]]:
        """按主题名/别名匹配，返回命中的主题记录（保序、去重）。"""
        by_name = {t["name"]: t for t in self.themes}
        seen: set[str] = set()
        out: list[dict[str, Any]] = []
        for _, _, name in self._iter_alias_hits(topic, self._theme_alias):
            if name in by_name and name not in seen:
                seen.add(name)
                out.append(by_name[name])
        return out

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
        需要判断「人名离引文有多远」的场景使用。
        """
        return self._iter_alias_hits(text, self._phil_alias)

    def iter_concepts(self, text: str) -> list[tuple[int, int, str]]:
        """概念版 iter_philosophers：保留字符位置，供术语计数使用。"""
        return self._iter_alias_hits(text, self._concept_alias)

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

    def unit_title(self, code: str, chapter_path: list[str] | None = None) -> str:
        """单元标题；同码条目（如 `1-1` 既是「科学实在论」又有「复习课」）按章节路径消歧。

        传入块的 `chapter_path` 时，优先取标题确实出现在章节路径里的那个条目；
        未传（或只有一个条目）时退回目录中的首个条目，与旧行为一致。
        """
        entries = self.units_by_code.get(code) or []
        if not entries:
            u = self._unit_by_code.get(code)
            return u["title"] if u else ""
        if len(entries) > 1 and chapter_path:
            for u in entries:
                title = str(u.get("title", ""))
                if title and any(title in part for part in chapter_path):
                    return title
        return str(entries[0].get("title", ""))

    def duplicate_unit_codes(self) -> dict[str, list[str]]:
        """同码单元清单：编号 → 该编号下的全部标题（只有一个条目的不收录）。

        体系目录共 338 个条目，但唯一编号少于条目数（多卷的「复习课」与所属单元
        共用编号）。这里把重复显式暴露，供 `stats` 诊断与测试固定行为，
        避免「静默取首个条目」这类不可见的数据折损。
        """
        return {
            code: [str(u.get("title", "")) for u in items]
            for code, items in sorted(self.units_by_code.items())
            if len(items) > 1
        }

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

    def coords_of(self, code: str) -> list[str]:
        """数值单元编号 → 四层坐标注解（如 2-3-3 → 场域论=2｜本体论=3｜认识论=3）。

        编号的位序即四层位序；缺失的位不猜（3 位编号只给 3 个坐标）。无编号（前言、
        体例、总纲）返回空列表——坐标不是「默认值」，宁可空着也不编。
        """
        if not code:
            return []
        names = self._layer_names or self.layer_names()
        out: list[str] = []
        for i, digit in enumerate(str(code).split("-")):
            name = names[i] if i < len(names) else f"第{i + 1}层"
            out.append(f"{name}={digit}")
        return out

    def axis(self, name: str) -> list[dict[str, Any]]:
        return self.axes.get(name, [])

    def codes_under(self, prefix: str) -> list[str]:
        """返回某编号下的全部子单元编号（含自身）。"""
        return [u["code"] for u in self.units
                if u["code"] == prefix or u["code"].startswith(prefix + "-")]
