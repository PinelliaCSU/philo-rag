"""数据采集与清洗层（L0）。

把「哲学大纲」原始语料（PDF 或已抽取的纯文本）处理成一份**结构可识别**的规范化
文本，交给摄取层（ingest）分块。整条链路的输入口径只在这里定义，因此想换语料、
改清洗规则，只动这一个文件。

清洗动作（每一步都是为检索质量服务的）：
  1. 抽页         —— PDF 逐页抽取，保留**打印页码**（引用要能定位到页）
  2. 去页眉       —— 删掉每页重复的「《哲学大纲》规范化文本（全集） · 第 N 页」
  3. 段落重排     —— PDF 会把一个自然段硬折成多行；按「上一行是否以句末标点收尾」
                     判断是否换段，把折行重新接回去，避免一句话被切碎
  4. 结构标注     —— 把「第 N 卷」「1-1-1 物理主义」这类结构行转成 Markdown 标题，
                     让摄取层直接复用通用标题解析（卷=一级，数值深度=层级）
  5. 归一化       —— 全角空格、零宽字符、多余空行、行首缩进
  6. 可选去注释   —— 【释：】【按：】【补：】是整理者标注，可保留（默认）或剔除

输出格式（UTF-8，`<<<PAGE n>>>` 是页边界标记，供摄取层还原页码）::

    <<<PAGE 3>>>
    # 第 1 卷 实在论
    ## 1 实在论
    本节所论为"哲学大纲"之"1"。……
"""
from __future__ import annotations

import re
from pathlib import Path

# 页眉：每页首行的固定水印
RE_PAGE_HEADER = re.compile(r"^《哲学大纲》规范化文本（全集）\s*[·・]\s*第\s*(\d+)\s*页\s*$")
RE_PAGE_MARK = re.compile(r"^<<<PAGE\s+(\d+)>>>\s*$")

# 结构行
RE_VOLUME = re.compile(r"^第\s*([一二三四五六七八九十百零〇\d]+)\s*卷\s*(\S.*?)\s*$")
RE_UNIT = re.compile(r"^(\d+(?:-\d+){0,3})\s+(\S.{0,27})$")

# 整理者标注
RE_ANNOT = re.compile(r"【(?:补|释|按)[:：][^】]*】")

# 句末标点：一行以这些字符收尾，说明是完整句，下一行应另起一段
SENT_END = "。！？…"
# 收尾符号：判定句末时要先剥掉这些尾随符号（引号/括号是「包裹」而非「句末」）
CLOSERS = "\"'”’」』】〕)）"
# 行首出现这些标点 → 一定是上一行的续写（中文段落不会以标点开头）
CONT_PUNCT = "，。、；：）】〕」』,;:)]}"
# 以这些虚词开头的短行不是标题（正文折行的后半截）。只收「几乎不会作为标题首字」
# 的虚词 —— 像「在」「有」「无」「之」都是标题里的常见首字（如「在场形而上学」），不能收。
TITLE_STOPWORDS = ("即", "与", "乃", "则", "若", "故", "但", "而", "且", "其", "此", "该")

_ZW = dict.fromkeys(map(ord, "\u200b\u200c\u200d\ufeff"), None)


def _ends_sentence(s: str) -> bool:
    """判断一行是否以完整句收尾。

    先剥掉尾随的引号/括号——`……。"` 是句末，而 `……之前"` 不是（下一行仍是本句延续）。
    """
    s = s.rstrip()
    i = len(s) - 1
    while i >= 0 and s[i] in CLOSERS:
        i -= 1
    return i >= 0 and s[i] in SENT_END


def _is_cjk(ch: str) -> bool:
    return bool(ch) and ("\u3000" <= ch <= "\u9fff" or "\uff00" <= ch <= "\uffef")


def _open_annot(text: str) -> int:
    """未闭合的注解括号数（【…】/〔…〕）。>0 说明段落被注解截断，必须续行。"""
    return (text.count("【") - text.count("】")) + (text.count("〔") - text.count("〕"))


def _join_wrapped(parts: list[str]) -> str:
    """把折行的多行接回一段：中文之间不插空格，拉丁词之间才插。"""
    out = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if out and not _is_cjk(out[-1]) and not _is_cjk(p[0]) and out[-1].isalnum() and p[0].isalnum():
            out += " "
        out += p
    return out


# --------------------------------------------------------------------------- #
# 1. 采集
# --------------------------------------------------------------------------- #
def extract_pdf(path: Path) -> list[tuple[int, str]]:
    """PDF → [(打印页码, 页面文本)]。打印页码取自页眉，缺失时回退到物理页序。"""
    import pymupdf

    pages: list[tuple[int, str]] = []
    with pymupdf.open(str(path)) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text")
            m = RE_PAGE_HEADER.search(text)
            pages.append((int(m.group(1)) if m else i, text))
    return pages


def extract_txt(path: Path) -> list[tuple[int, str]]:
    """已抽取的纯文本 → [(页码, 文本)]，支持 `<<<PAGE n>>>` 分页标记。"""
    raw = path.read_text(encoding="utf-8-sig", errors="replace")
    if "<<<PAGE" not in raw:
        return [(1, raw)]

    pages: list[tuple[int, str]] = []
    cur_no, buf = 1, []
    for line in raw.split("\n"):
        m = RE_PAGE_MARK.match(line)
        if m:
            if buf:
                pages.append((cur_no, "\n".join(buf)))
            cur_no, buf = int(m.group(1)), []
        else:
            buf.append(line)
    if buf:
        pages.append((cur_no, "\n".join(buf)))
    return pages


def load_source(path: Path) -> list[tuple[int, str]]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix in (".txt", ".md", ".markdown"):
        return extract_txt(path)
    raise ValueError(f"不支持的源格式：{suffix}（支持 .pdf / .txt / .md）")


# --------------------------------------------------------------------------- #
# 2. 结构识别
# --------------------------------------------------------------------------- #
def _unit_depth(code: str) -> int:
    """数值编号深度：'1'→2，'1-1'→3，'1-1-1'→4，'1-1-1-1'→5（卷占一级）。"""
    return code.count("-") + 2


def _as_heading(line: str) -> str | None:
    """把结构行转成 Markdown 标题；不是结构行则返回 None。"""
    s = line.strip()
    if len(s) > 44:
        return None

    m = RE_VOLUME.match(s)
    if m:
        return f"# 第 {m.group(1)} 卷 {m.group(2)}"

    m = RE_UNIT.match(s)
    if m:
        code, title = m.group(1), m.group(2).strip()
        # 排除正文折行：正文句首很快会出现逗号/句号/成对括号，标题则不会。
        # 冒号与感叹号在标题里合法（如「辩证法——黑格尔：走向绝对精神的历史走向」），予以放行。
        if re.search(r"[，。？；（）【】]", title):
            return None
        if title.startswith(TITLE_STOPWORDS):
            return None
        # 标题被截断的特征：以顿号/破折号/空格收尾
        if title[-1] in "、—- ":
            return None
        if len(title) > 30:
            return None
        return f"{'#' * _unit_depth(code)} {code} {title}"

    return None


# --------------------------------------------------------------------------- #
# 3. 清洗 + 重排
# --------------------------------------------------------------------------- #
def _clean_line(line: str) -> str:
    line = line.translate(_ZW)
    line = line.replace("\u3000", " ").replace("\xa0", " ")
    return line.rstrip()


def clean(pages: list[tuple[int, str]], *, strip_annotations: bool = False) -> str:
    """把逐页文本清洗、重排成带结构标题与页码标记的规范化文本。

    页标记 `<<<PAGE n>>>` 落在「段落起始处」而非物理页首：这样跨页的长句不会被
    页边界劈成两段，同时每个段落仍能归属到它开始的那一页。
    """
    out: list[str] = []
    para: list[str] = []              # 当前段落缓冲（已折行的多行）
    para_page: int | None = None      # 当前段落起始页
    last_marked: int | None = None    # 最近一次落下的页标记

    def mark(page: int | None) -> None:
        nonlocal last_marked
        if page is not None and page != last_marked:
            out.append(f"<<<PAGE {page}>>>")
            last_marked = page

    def flush() -> None:
        nonlocal para_page
        if para:
            text = _join_wrapped(para)
            text = re.sub(r"[ \t]{2,}", " ", text)
            if text:
                mark(para_page)
                out.append(text)
                out.append("")   # 段落之间留空行 —— 摄取层靠空行识别段落边界
            para.clear()
            para_page = None

    for page_no, raw in pages:
        lines = [_clean_line(x) for x in raw.split("\n")]
        # 页眉可能出现在页首或页脚，统一剔除（保留页码供定位）
        lines = [x for x in lines if not RE_PAGE_HEADER.match(x.strip())]
        # 页首/页末的空行是分页产物，不是段落边界 —— 不剥掉会把跨页的句子劈开
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()

        for line in lines:
            s = line.strip()
            if not s:
                flush()
                continue

            head = _as_heading(s)
            if head:
                flush()
                mark(page_no)
                out.append(head)
                continue

            joined = _join_wrapped(para)
            if para and (not _ends_sentence(joined) or _open_annot(joined) > 0
                         or s[0] in CONT_PUNCT):
                para.append(s)      # 上一行没写完（或注解未闭合）→ 折行延续
            else:
                flush()
                para_page = page_no
                para.append(s)

    flush()

    text = "\n".join(out)
    if strip_annotations:
        text = RE_ANNOT.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


# --------------------------------------------------------------------------- #
# 4. 顶层入口
# --------------------------------------------------------------------------- #
def prepare(source: Path, dest: Path, *, strip_annotations: bool = False,
            skip_front_matter: bool = True) -> dict:
    """采集 → 清洗 → 落盘。返回统计信息。

    `skip_front_matter=False` 会保留正文之前的体例说明与体系总纲（那里有
    「首位数字即字头」这类关键定义），并给它加上 `# 前言 体例与体系总纲` 标题，
    使其在索引里也有明确的章节归属。
    """
    pages = load_source(source)
    preface: list[tuple[int, str]] = []

    if skip_front_matter:
        # 丢掉正文（首个「第 N 卷」）之前的封面与体例说明
        for i, (_, text) in enumerate(pages):
            if any(RE_VOLUME.match(x.strip()) for x in text.split("\n")):
                pages = pages[i:]
                break
    else:
        for i, (_, text) in enumerate(pages):
            if any(RE_VOLUME.match(x.strip()) for x in text.split("\n")):
                preface, pages = pages[:i], pages[i:]
                break

    text = clean(pages, strip_annotations=strip_annotations)
    if preface:
        front = clean(preface, strip_annotations=strip_annotations)
        # 体例说明与体系总纲也纳入索引，给它一个显式章节归属
        text = "# 前言 体例与体系总纲\n\n" + front + "\n" + text

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")

    n_vol = len(re.findall(r"^# ", text, flags=re.M))
    n_unit = len(re.findall(r"^#{2,5} \d", text, flags=re.M))
    n_page = len(re.findall(r"^<<<PAGE", text, flags=re.M))
    return {
        "source": str(source),
        "dest": str(dest),
        "pages": n_page,
        "volumes": n_vol,
        "units": n_unit,
        "chars": len(text),
    }
