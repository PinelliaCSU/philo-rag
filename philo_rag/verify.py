"""引用核对层：离线测量任意回答正文「是否来自语料」。

把回答正文逐句与 data/哲学大纲_规范化_全集.txt 做字符级比对，每句分三类：
  grounded   —— 可定位到语料中的连续片段（允许少量标点/空白差异）
  paraphrase —— 高 n-gram 重叠但不连续，或经明显改写
  ungrounded —— 语料中找不到支撑

设计说明（阈值依据见 Thresholds 注释）：
  * 规范化同时作用于回答与语料：去空白、统一/移除引号、去 citation 标记
    （[1] / [E01] 等）、去 Markdown 与列表符号，最后只保留字母/数字/汉字。
    这样「Hegelia n」与「Hegelian」、「4-1-1-1」与「4-1-1-1」等标点/空白差异
    全部归并，而连续匹配仍保持字符级精确。
  * 匹配优先整句 find（CPython 的 Two-Way 快速搜索）。找不到时用「最长前缀 /
    最长后缀」二分搜索估计连续覆盖（覆盖 template 后端最常见的句尾截断），
    再用 4-gram 集合计算整句重叠，区分 paraphrase 与 ungrounded。
  * 4-gram 集合按需惰性构建，并用 16-bit 打包成 int 以控制内存（本语料
    max(ord) < 65536，无打包冲突）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

DEFAULT_CORPUS = "data/哲学大纲_规范化_全集.txt"

# ---- 阈值参数表（全部可被 scripts/check_grounded.py 覆盖）--------------------
#   ngram_n=4              中文 4-gram 起步（建议值；低于 3 噪声大，高于 5 过严）
#   grounded_cover=0.80    单句归一化后 ≥80% 字符落在语料同一连续片段 → grounded
#   grounded_min_chars=10  该连续片段至少 10 个有效字符，避免短句误判
#   para_cover=0.50        最长连续片段覆盖 ≥50% 但 <80% → paraphrase
#   para_ngram_overlap=0.50 整句 4-gram 有 ≥50% 能在语料中找到 → paraphrase
#   min_sentence_chars=6    切句后 <6 字的短句并入相邻句（不单独判定）
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Thresholds:
    ngram_n: int = 4
    grounded_cover: float = 0.80
    grounded_min_chars: int = 10
    para_cover: float = 0.50
    para_ngram_overlap: float = 0.50
    min_sentence_chars: int = 6


@dataclass
class SentenceVerdict:
    index: int
    raw: str
    norm: str
    verdict: str            # grounded | paraphrase | ungrounded | skipped
    coverage: float         # 最长连续片段覆盖比例（0-1）
    match_len: int          # 最长连续片段的有效字符数
    ngram_overlap: float    # 整句 4-gram 命中语料的比例


@dataclass
class TextReport:
    source: str
    sentences: list[SentenceVerdict] = field(default_factory=list)          # 正文
    glossary_sentences: list[SentenceVerdict] = field(default_factory=list)  # 术语注解（无该节则为空）

    @property
    def has_glossary(self) -> bool:
        return bool(self.glossary_sentences)

    @property
    def counted(self) -> list[SentenceVerdict]:
        return [s for s in self.sentences if s.verdict != "skipped"]

    @property
    def glossary_counted(self) -> list[SentenceVerdict]:
        return [s for s in self.glossary_sentences if s.verdict != "skipped"]

    @staticmethod
    def _counts(sentences: list[SentenceVerdict]) -> dict[str, int]:
        out = {"grounded": 0, "paraphrase": 0, "ungrounded": 0, "skipped": 0}
        for s in sentences:
            out[s.verdict] = out.get(s.verdict, 0) + 1
        return out

    @staticmethod
    def _rates(sentences: list[SentenceVerdict]) -> dict[str, float]:
        c = TextReport._counts(sentences)
        n = max(sum(c[k] for k in ("grounded", "paraphrase", "ungrounded")), 1)
        return {
            "grounded": c["grounded"] / n,
            "paraphrase": c["paraphrase"] / n,
            "ungrounded": c["ungrounded"] / n,
        }

    def counts(self) -> dict[str, int]:
        return self._counts(self.sentences)

    def rates(self) -> dict[str, float]:
        return self._rates(self.sentences)

    def glossary_counts(self) -> dict[str, int]:
        return self._counts(self.glossary_sentences)

    def glossary_rates(self) -> dict[str, float]:
        return self._rates(self.glossary_sentences)


# ---- 规范化 -------------------------------------------------------------------
_CITATION = re.compile(r"\[\s*[Ee]?\d+(?:\s*[,，\-—]\s*[Ee]?\d+)*\s*\]")
_QUOTE_TRANS = str.maketrans(
    {"“": "", "”": "", "「": "", "」": "", "『": "", "』": "", "\"": "", "‘": "", "’": ""}
)


def normalize(text: str) -> str:
    """去 citation 标记、去引号，只保留字母/数字/汉字（自动去空白与全部标点）。"""
    t = _CITATION.sub("", text or "")
    t = t.translate(_QUOTE_TRANS)
    return "".join(ch.lower() for ch in t if ch.isalnum())


# ---- 回答正文抽取（本项目 .md 格式）------------------------------------------
_SPLIT = re.compile(r"[。！？；\n]+")
_RE_ANSWER = re.compile(r"^\s*##\s+回答\s*$")
_RE_GLOSSARY = re.compile(r"^\s*##\s+术语注解\s*$")
_RE_END = re.compile(r"^\s*##\s*(?:引用来源|术语注解|问题|聚合概览)\s*$")
_HEADING = re.compile(r"^\s*#{1,6}\s")
_FOOTNOTE = re.compile(r"^\s*>\s*本回答由")
_ITALIC_META = re.compile(r"^\s*\*[^*]*(?:命中|密度)[^*]*\*\s*$")
_META_LIST = re.compile(r"^\s*-\s*(?:锚定理论家|锚定概念|锚定单元|密度分布|覆盖卷|共现理论家|年代分布)")
_CITE_LINE = re.compile(r"^\s*-\s*\*\*\[\s*[Ee]?\d+\s*\]\*\*")
_SRC_LINE = re.compile(r"出处\s*[:：]\s*《?哲学大纲》?")
_BULLET_UNIT = re.compile(r"^\s*-\s*\*\*[^*]+\*\*\s*（\d+\s*块）\s*[:：]?\s*", re.M)
_ROLE_LABEL = re.compile(r"(?:核心含义|形成机制|理论展开|理论张力|体系位置|补充证据)\s*[:：]\s*")


def _clean_section(lines: list[str]) -> str:
    kept: list[str] = []
    for ln in lines:
        if _HEADING.match(ln) or _FOOTNOTE.match(ln) or _ITALIC_META.match(ln):
            continue
        if _META_LIST.match(ln) or _CITE_LINE.match(ln) or _SRC_LINE.search(ln):
            continue
        kept.append(ln)
    body = "\n".join(kept)
    body = _BULLET_UNIT.sub("", body)
    body = _ROLE_LABEL.sub("", body)
    return body


def extract_body(md_text: str) -> str:
    """从本项目 .md 输出里只取「## 回答」正文。

    正文段 = 「## 回答」→「## 术语注解」或「## 引用来源」（先遇到谁算谁）。
    无术语注解节时行为与旧版一致。排除：## 问题 / ## 聚合概览 / 引用来源 /
    分节标题 / 聚合元数据行 / 单元徽标行（**4-1-1-1 …**（N 块）：）/ 后端脚注。
    """
    lines = md_text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        if _RE_ANSWER.match(ln):
            start = i + 1
            break
    if start is None:
        # 非标准文件回退：去掉所有 ## 级章节标题行后全量测量
        body_lines = [ln for ln in lines if not re.match(r"^\s*##\s", ln)]
    else:
        # 只在遇到外层「## 引用来源」或新增的「## 术语注解」时停止；
        # 点查询内部用「## 1、…」做小节标题，不能当作正文结束（由 _HEADING 丢弃）。
        body_lines = []
        for ln in lines[start:]:
            if _RE_END.match(ln):
                break
            body_lines.append(ln)
    return _clean_section(body_lines)


def extract_glossary(md_text: str) -> str | None:
    """单独提取「## 术语注解」→「## 引用来源」之间的词表段；无该节返回 None。"""
    lines = md_text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        if _RE_GLOSSARY.match(ln):
            start = i + 1
            break
    if start is None:
        return None
    kept: list[str] = []
    for ln in lines[start:]:
        if _RE_END.match(ln):
            break
        kept.append(ln)
    text = "\n".join(kept).strip()
    return text or None


def split_sentences(text: str, min_chars: int = 6) -> list[str]:
    """按 。！？；\\n 切分；<min_chars 的短句并入前一句（无前句则并入后句）。

    并入前句而不是后句：template 后端经常在长摘录后跟一个「种类很多。」式的
    短收尾句，它与前文同源；并入后句会把下一段无关摘录粘进来造成假 paraphrase。
    """
    raw = [s.strip() for s in _SPLIT.split(text) if s.strip()]
    if not raw:
        return []
    out: list[str] = []
    for s in raw:
        if len(s) < min_chars:
            if out:
                out[-1] += s
            else:
                out.append(s)
        else:
            out.append(s)
    if len(out) > 1 and len(out[0]) < min_chars:
        out[1] = out[0] + out[1]
        out.pop(0)
    return out


# ---- 语料比对器 ---------------------------------------------------------------
class CorpusVerifier:
    """一次加载语料，反复比对多个回答文本。"""

    def __init__(self, corpus_path: str = DEFAULT_CORPUS,
                 thresholds: Thresholds | None = None) -> None:
        self.thresholds = thresholds or Thresholds()
        self.corpus_path = corpus_path
        self.text = Path(corpus_path).read_text(encoding="utf-8")
        self.norm = normalize(self.text)
        self._ngram_set: set[int] | None = None

    # -- 4-gram 集合（惰性构建，打包为 int 控制内存）--
    def _build_ngram_set(self) -> set[int]:
        n = self.thresholds.ngram_n
        nrm = self.norm
        ln = len(nrm)
        s: set[int] = set()
        if ln < n:
            return s
        max_ord = max(map(ord, nrm)) if nrm else 0
        if max_ord > 0xFFFF:                      # 罕见非 BMP 字符：退回字符串键
            self._ngram_set = {nrm[i:i + n] for i in range(ln - n + 1)}  # type: ignore[assignment]
            return self._ngram_set  # type: ignore[return-value]
        for i in range(ln - n + 1):
            g = nrm[i:i + n]
            v = 0
            for ch in g:
                v = (v << 16) | ord(ch)
            s.add(v)
        self._ngram_set = s
        return s

    @staticmethod
    def _pack(gram: str) -> int:
        v = 0
        for ch in gram:
            v = (v << 16) | ord(ch)
        return v

    def _has_ngram(self, gram: str) -> bool:
        if self._ngram_set is None:
            self._build_ngram_set()
        if not self._ngram_set:
            return False
        sample = next(iter(self._ngram_set))
        if isinstance(sample, str):
            return gram in self._ngram_set
        return self._pack(gram) in self._ngram_set

    def _longest_affix(self, piece: str) -> int:
        """二分搜索 piece 的最长前缀在语料中的连续出现长度。"""
        lo, hi = 1, len(piece)
        ans = 0
        while lo <= hi:
            mid = (lo + hi) // 2
            if self.norm.find(piece[:mid]) >= 0:
                ans = mid
                lo = mid + 1
            else:
                hi = mid - 1
        return ans

    def _longest_contiguous(self, norm: str) -> int:
        """整句未命中时，二分搜索最长「前缀或后缀」连续片段（处理句尾/句首截断）。"""
        if not norm:
            return 0
        best = self._longest_affix(norm)
        best = max(best, self._longest_affix(norm[::-1]))  # 反转串前缀 == 原串后缀
        return best

    def _ngram_overlap(self, norm: str) -> float:
        n = self.thresholds.ngram_n
        if len(norm) < n:
            return 0.0
        grams = {norm[i:i + n] for i in range(len(norm) - n + 1)}
        if not grams:
            return 0.0
        return sum(1 for g in grams if self._has_ngram(g)) / len(grams)

    def classify(self, raw_sentence: str) -> SentenceVerdict:
        th = self.thresholds
        norm = normalize(raw_sentence)
        ln = len(norm)
        if ln == 0:
            return SentenceVerdict(0, raw_sentence, "", "skipped", 0.0, 0, 0.0)
        if ln < th.ngram_n:
            return SentenceVerdict(0, raw_sentence, norm, "skipped", 0.0, 0, 0.0)

        if self.norm.find(norm) >= 0:
            return SentenceVerdict(0, raw_sentence, norm, "grounded", 1.0, ln, 1.0)

        match_len = self._longest_contiguous(norm)
        coverage = match_len / ln if ln else 0.0
        if match_len >= th.grounded_min_chars and coverage >= th.grounded_cover:
            return SentenceVerdict(0, raw_sentence, norm, "grounded",
                                   coverage, match_len, self._ngram_overlap(norm))

        overlap = self._ngram_overlap(norm)
        if coverage >= th.para_cover or overlap >= th.para_ngram_overlap:
            return SentenceVerdict(0, raw_sentence, norm, "paraphrase",
                                   coverage, match_len, overlap)
        return SentenceVerdict(0, raw_sentence, norm, "ungrounded",
                               coverage, match_len, overlap)

    def verify_text(self, body: str) -> TextReport:
        report = TextReport(source="<text>")
        for i, s in enumerate(split_sentences(body, self.thresholds.min_sentence_chars), start=1):
            v = self.classify(s)
            v.index = i
            report.sentences.append(v)
        return report

    def verify_markdown(self, md_path: str | Path) -> TextReport:
        p = Path(md_path)
        text = p.read_text(encoding="utf-8")
        report = self.verify_text(extract_body(text))
        report.source = str(p)
        glossary = extract_glossary(text)
        if glossary:
            for i, s in enumerate(split_sentences(glossary, self.thresholds.min_sentence_chars), start=1):
                v = self.classify(s)
                v.index = i
                report.glossary_sentences.append(v)
        return report

    def verify_markdowns(self, md_paths: Iterable[str | Path]) -> list[TextReport]:
        return [self.verify_markdown(p) for p in md_paths]


def summary_table(reports: list[TextReport]) -> list[dict[str, Any]]:
    """跨文件基线表：正文与术语注解各列三类计数与率。"""
    rows: list[dict[str, Any]] = []
    for r in reports:
        c = r.counts()
        rates = r.rates()
        gc = r.glossary_counts()
        grates = r.glossary_rates()
        rows.append({
            "source": r.source,
            "total": len(r.counted),
            "grounded": c["grounded"],
            "paraphrase": c["paraphrase"],
            "ungrounded": c["ungrounded"],
            "skipped": c["skipped"],
            "grounded_rate": rates["grounded"],
            "paraphrase_rate": rates["paraphrase"],
            "ungrounded_rate": rates["ungrounded"],
            "has_glossary": r.has_glossary,
            "glossary_total": len(r.glossary_counted),
            "glossary_grounded": gc["grounded"],
            "glossary_paraphrase": gc["paraphrase"],
            "glossary_ungrounded": gc["ungrounded"],
            "glossary_skipped": gc["skipped"],
            "glossary_grounded_rate": grates["grounded"],
            "glossary_paraphrase_rate": grates["paraphrase"],
            "glossary_ungrounded_rate": grates["ungrounded"],
        })
    return rows
