"""摄取层：文档解析 → 结构识别 → 结构感知分块 → 元数据抽取。

设计要点（针对哲学文本）：
  * 哲学论证常常跨段落延续，固定窗口切分会切断论证，因此以「章节树 + 段落原子」分块；
  * 引文（「」/“”）单独成块，供「按哲学家/概念/年代检索引文」使用；
  * 每个块都带 chapter_path + 字符区间，保证答案可回溯到原文位置。
"""
from __future__ import annotations

import re
from pathlib import Path

from .lexicon import Lexicon
from .schema import Block, Chunk

RE_HEAD_CHAPTER = re.compile(r"^第[一二三四五六七八九十百零〇\d]+[章回篇部]")
RE_HEAD_SECTION = re.compile(r"^[一二三四五六七八九十]+[、.．]")
RE_HEAD_MD = re.compile(r"^(#{1,6})\s+(.*)$")
RE_HEAD_NUM = re.compile(r"^\d+(\.\d+)*[、.．]\s*\S")
RE_FOOTNOTE = re.compile(r"^[\[【〔(（]\s*\d+\s*[\]】〕)）]")
# 可靠引号标记：「…」/“…”（成对、不会误配）
RE_QUOTE = re.compile(r"[「“]([^」”]{4,})[」”]")
# 语料里绝大多数引文用的是 ASCII 直引号 `"`，且同一个字符兼作开闭，
# 因此只能靠「段内交替配对」（第 1、3、5… 个为开引号）来还原，并配合长度与
# 中文含量校验，滤掉纯术语强调（如 "字头"）。
RE_CJK = re.compile(r"[\u4e00-\u9fff]")
RE_PAGE_MARK = re.compile(r"^<<<PAGE\s+(\d+)>>>\s*$")
SENT_END = "。！？；："

# 引文长度的绝对下限：短于此的一律丢弃，无论走哪条抽取规则。
QUOTE_FLOOR = 4

# --------------------------------------------------------------------------- #
# 引文说话人识别
# --------------------------------------------------------------------------- #
# 引述标记：只有它出现在「人名」与「引文」之间，才认定该人名是说话人。
# 语料实测：`说"` 267 处、`所谓"` 101 处、`："` 143 处，是最主要的引述句式。
#
# 注意：单字动词里只有 `说`/`讲` 足够可靠。`道/云/称/曰/念/读/问/答/言` 会与
# 「道德」「观念」「学说」「知道」等普通词混淆（实测「后观念论的"」被误判为
# 「念」），故一律不收；需要它们时只在**紧邻人名**的后缀句式中启用。
QUOTE_VERBS = (
    "说", "讲", "指出", "认为", "提出", "写道", "表示", "强调", "主张",
    "论述", "论证", "引用", "举例", "所谓", "所言", "指明", "断言", "宣告",
    "宣称", "概括", "总结", "比喻", "描述", "解释", "评论", "批判", "提醒",
    "坦言", "直言", "明言", "反问", "追问", "有言", "说过", "讲过", "道出",
    "如下", "以上",
)
QUOTE_VERBS_TAIL = (
    "说", "讲", "指出", "认为", "提出", "写道", "表示", "强调",
    "答道", "回答", "反问", "追问", "坦言", "直言", "宣称", "断言", "说道",
)
# 人名后接这些词时指的是「学说 / 流派」而非本人（如「黑格尔主义说成这样」），
# 不能算作说话人。
DOCTRINE_SUFFIX = ("主义", "学派", "哲学", "思想", "体系", "信徒", "追随者")

GAP_MAX = 16          # 人名与引文之间允许的最大字数
SPEAKER_WINDOW = 28   # 向前 / 向后搜索的字符窗口

# 人名与引文必须处在**同一个句子**里（中间不能有句末标点），否则只是语境提及。
# 同时动词两侧各留 ≤10 字余量，避免「……社会事实。例如某人说"…"」这类跨句误配。
_VERB_ALT = "|".join(sorted(QUOTE_VERBS, key=len, reverse=True))
_TAIL_ALT = "|".join(sorted(QUOTE_VERBS_TAIL, key=len, reverse=True))
RE_GAP_PREFIX = re.compile(rf"^[^。！？]{{0,10}}(?:{_VERB_ALT})[^。！？]{{0,10}}$")
RE_GAP_SUFFIX = re.compile(r"^[^。！？]{0,4}$")
# 后缀句式的动词必须**收尾**（后接标点或窗口结束）：否则「把黑格尔说成中二…」
# 里的 `说` 会被当成引述动词，而它其实是「说成」（把 X 当成 Y）。
RE_NAME_TAIL = re.compile(rf"^(?:{_TAIL_ALT})(?=[，。；：、！？…—\"”]|$)")


def find_speaker(text: str, qs: int, qe: int, lex: Lexicon) -> str:
    """推断引文的说话人；证据不足则返回空串。

    规则：人名必须**紧邻**引文，且二者之间（同一句内）出现引述标记。
    这样能避开两类误配：
      * 语境里偶然提及的人物（如整理者注解「【释：……弗洛伊德……」」）；
      * 例子中嵌套的第三方（如「齐泽克举一个例子：某人的前男友说"…"」）。
    前后各试一次，覆盖 `X 说："…"` 与 `"…"，X 说` 两种句式；后缀句式要求
    人名与引述动词直接相连（更严），因为实测放宽后误配率很高。
    """
    lo = max(0, qs - SPEAKER_WINDOW)
    seg = text[lo:qs]
    for _, e, name in reversed(lex.iter_philosophers(seg)):
        gap = seg[e:]
        if len(gap) > GAP_MAX:
            break
        if gap.startswith(DOCTRINE_SUFFIX):
            continue
        if RE_GAP_PREFIX.match(gap):
            return name

    hi = min(len(text), qe + SPEAKER_WINDOW)
    seg = text[qe:hi]
    for s, e, name in lex.iter_philosophers(seg):
        gap = seg[:s]
        if len(gap) > GAP_MAX:
            break
        if RE_GAP_SUFFIX.match(gap) and RE_NAME_TAIL.match(seg[e:]):
            return name
    return ""


# --------------------------------------------------------------------------- #
# 1. 读源文件
# --------------------------------------------------------------------------- #
def split_pages(text: str) -> list[tuple[int, str]]:
    """按 `<<<PAGE n>>>` 标记切分文本；无标记时视为单页。"""
    if "<<<PAGE" not in text:
        return [(1, text)]
    out: list[tuple[int, str]] = []
    cur, buf = 1, []
    for line in text.split("\n"):
        m = RE_PAGE_MARK.match(line)
        if m:
            if buf:
                out.append((cur, "\n".join(buf)))
            cur, buf = int(m.group(1)), []
        else:
            buf.append(line)
    if buf:
        out.append((cur, "\n".join(buf)))
    return out


def load_segments(path: Path) -> list[tuple[int, str]]:
    """返回 [(页码, 文本), ...]，txt/md/pdf/docx 统一接口。

    txt/md 支持 `<<<PAGE n>>>` 分页标记（由 philo_rag.prepare 产出），
    以便引用能定位到具体页码。
    """
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md", ".markdown"):
        return split_pages(path.read_text(encoding="utf-8-sig", errors="replace"))

    if suffix == ".pdf":
        import fitz  # PyMuPDF

        out: list[tuple[int, str]] = []
        with fitz.open(str(path)) as doc:
            for i, page in enumerate(doc, start=1):
                out.append((i, page.get_text("text")))
        return out

    if suffix == ".docx":
        from docx import Document

        doc = Document(str(path))
        return [(1, "\n".join(p.text for p in doc.paragraphs))]

    raise ValueError(f"暂不支持的格式：{suffix}")


# --------------------------------------------------------------------------- #
# 2. 结构识别
# --------------------------------------------------------------------------- #
def _is_heading(line: str, nxt: str) -> tuple[int, str] | None:
    """判断一行是否为标题，返回 (层级, 标题文本)。"""
    m = RE_HEAD_MD.match(line)
    if m:
        return len(m.group(1)), m.group(2).strip()

    stripped = line.strip()
    if not stripped or len(stripped) > 40:
        return None
    if stripped[-1] in SENT_END:
        return None

    if RE_HEAD_CHAPTER.match(stripped):
        return 1, stripped
    if RE_HEAD_SECTION.match(stripped):
        return 2, stripped
    if RE_HEAD_NUM.match(stripped):
        return 3, stripped
    # 无标号短行 + 下一行是正文 → 视为小标题
    if nxt.strip() and len(stripped) <= 20 and not RE_FOOTNOTE.match(stripped):
        return 3, stripped
    return None


def parse_blocks(segments: list[tuple[int, str]]) -> list[Block]:
    blocks: list[Block] = []
    offset = 0
    for page, text in segments:
        lines = text.split("\n")
        buf: list[str] = []
        buf_start = offset

        def flush_buf(end_offset: int) -> None:
            nonlocal buf, buf_start
            joined = "\n".join(buf).strip()
            if joined:
                blocks.append(Block("paragraph", joined, 0, buf_start, end_offset, page))
            buf = []

        for i, line in enumerate(lines):
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            line_start = offset
            offset += len(line) + 1  # +1 为换行符

            if not line.strip():
                flush_buf(line_start)
                buf_start = offset
                continue

            if RE_FOOTNOTE.match(line.strip()):
                flush_buf(line_start)
                blocks.append(Block("footnote", line.strip(), 0, line_start, offset, page))
                buf_start = offset
                continue

            head = _is_heading(line, nxt)
            if head:
                flush_buf(line_start)
                level, title = head
                blocks.append(Block("heading", title, level, line_start, offset, page))
                buf_start = offset
                continue

            if not buf:
                buf_start = line_start
            buf.append(line)

        flush_buf(offset)
    return blocks


# --------------------------------------------------------------------------- #
# 3. 元数据抽取
# --------------------------------------------------------------------------- #
def fill_meta(chunk: Chunk, lex: Lexicon) -> None:
    chunk.philosophers = lex.match_philosophers(chunk.text)
    chunk.concepts = lex.match_concepts(chunk.text)
    chunk.eras = lex.eras_of(chunk.philosophers)
    chunk.char_len = len(chunk.text)


# --------------------------------------------------------------------------- #
# 4. 结构感知分块
# --------------------------------------------------------------------------- #
RE_SENT_SPLIT = re.compile(r"(?<=[。！？；])")


def pack_sentences(text: str, max_chars: int, min_chars: int) -> list[tuple[str, int, int]]:
    """把超长段落按句子边界切成若干块，返回 [(文本, 段内起偏移, 段内止偏移)]。

    为什么必须切：嵌入模型有输入窗口（bge-small-zh 为 512 token），
    本语料存在 2000 字以上的长段，不切会被静默截断，等于丢掉后半段。
    切点只落在句末标点上，不切断句子。
    """
    sents: list[tuple[str, int, int]] = []
    pos = 0
    for piece in RE_SENT_SPLIT.split(text):
        if piece:
            sents.append((piece, pos, pos + len(piece)))
            pos += len(piece)

    out: list[tuple[str, int, int]] = []
    buf: list[tuple[str, int, int]] = []

    def size() -> int:
        return sum(len(x[0]) for x in buf)

    for s in sents:
        if buf and size() + len(s[0]) > max_chars and size() >= min_chars:
            out.append(("".join(x[0] for x in buf), buf[0][1], buf[-1][2]))
            buf = []
        buf.append(s)
    if buf:
        merged = ("".join(x[0] for x in buf), buf[0][1], buf[-1][2])
        # 尾块过短且能并回上一块 → 并回去，避免产出碎片
        if out and len(merged[0]) < min_chars and len(out[-1][0]) + len(merged[0]) <= max_chars * 1.5:
            prev = out.pop()
            out.append((prev[0] + merged[0], prev[1], merged[2]))
        else:
            out.append(merged)
    return out


def _build_body_chunks(blocks: list[Block], doc_id: str, lex: Lexicon, cfg: dict) -> list[Chunk]:
    max_chars = int(cfg["max_chars"])
    min_chars = int(cfg["min_chars"])
    overlap = int(cfg["overlap_chars"])

    chunks: list[Chunk] = []
    chapter: list[tuple[int, str]] = []
    buf: list[Block] = []

    def path() -> list[str]:
        return [t for _, t in chapter]

    def emit(items: list[Block], kind: str = "body") -> None:
        text = "\n".join(b.text for b in items).strip()
        if not text:
            return
        c = Chunk(
            chunk_id="",
            doc_id=doc_id,
            seq=0,
            text=text,
            chunk_type=kind,
            chapter_path=path(),
            start=items[0].start,
            end=items[-1].end,
            page=items[0].page,
        )
        fill_meta(c, lex)
        chunks.append(c)

    def emit_long(b: Block) -> None:
        """超长段落：按句边界切成多个子块，各自带精确的字符区间。"""
        for piece, rel_s, rel_e in pack_sentences(b.text, max_chars, min_chars):
            emit([Block("paragraph", piece, 0, b.start + rel_s, b.start + rel_e, b.page)])

    def flush(keep_overlap: bool = True) -> None:
        """收尾当前缓冲。

        keep_overlap=True（因长度上限而切分）：把末段带入下一块，避免切断论证；
        keep_overlap=False（因章节标题而切分）：不带入，否则上一节的内容会被
        贴上下一节的 chapter_path，造成元数据污染。
        """
        nonlocal buf
        if not buf:
            return
        emit(buf)
        if keep_overlap:
            tail = buf[-1]
            buf = [tail] if len(tail.text) <= overlap else []
        else:
            buf = []

    for b in blocks:
        if b.kind == "heading":
            cur_len = sum(len(x.text) for x in buf)
            # 章节与小节都强制切分 → 块与「节」对齐，元数据天然干净
            if buf and (b.level <= 2 or cur_len >= min_chars):
                flush(keep_overlap=False)
            while chapter and chapter[-1][0] >= b.level:
                chapter.pop()
            chapter.append((b.level, b.text))
            continue

        if b.kind == "footnote":
            flush(keep_overlap=False)
            emit([b], "footnote")
            continue

        # 单段就超过上限 → 先收尾，再按句边界切分
        if len(b.text) > max_chars:
            flush(keep_overlap=False)
            emit_long(b)
            continue

        cur_len = sum(len(x.text) for x in buf)
        if buf and cur_len + len(b.text) > max_chars and cur_len >= min_chars:
            flush(keep_overlap=True)
        buf.append(b)

    flush(keep_overlap=False)
    return chunks


def extract_quotes(text: str, min_chars: int = 12) -> list[tuple[str, int, int]]:
    """抽取引文，返回 [(引文, 起偏移, 止偏移)]。

    两条规则并用：
      * 可靠标记 `「…」`/`“…”` —— 成对且不会误配，只设绝对下限 `QUOTE_FLOOR`；
      * ASCII 直引号 `"` —— 同一字符兼作开闭，按**段内交替配对**还原
        （第 1、3、5… 个为开引号），并要求长度 ≥ min_chars、中文 ≥ 8 字，
        以滤掉 `"字头"` 这类纯术语强调。

    这里只负责「抽」，长度去留策略交给 `_quote_chunks`。
    注意：调用方应在**整篇文本**上调用一次（见 `_quote_chunks`），
    分段调用会让交替配对的奇偶性翻转。
    """
    out: list[tuple[str, int, int]] = []
    for m in RE_QUOTE.finditer(text):
        inner = m.group(1).strip()
        if len(inner) >= QUOTE_FLOOR:
            out.append((inner, m.start(1), m.end(1)))

    pos = [m.start() for m in re.finditer('"', text)]
    for i in range(0, len(pos) - 1, 2):
        s, e = pos[i] + 1, pos[i + 1]
        inner = text[s:e].strip()
        if len(inner) < min_chars or '"' in inner:
            continue
        if len(RE_CJK.findall(inner)) < 8:
            continue
        out.append((inner, s, e))

    out.sort(key=lambda x: x[1])
    return out


def _page_at(page_index: list[tuple[int, int]] | None, pos: int) -> int:
    """按字符偏移查页码（page_index = [(段起始偏移, 页码)]，递增）。"""
    page = 1
    for off, pg in page_index or []:
        if off <= pos:
            page = pg
        else:
            break
    return page


def _quote_chunks(
    body_chunks: list[Chunk],
    full_text: str,
    lex: Lexicon,
    min_chars: int,
    min_chars_reliable: int = 6,
    page_index: list[tuple[int, int]] | None = None,
) -> list[Chunk]:
    """把**整篇**抽出的引文挂到包含它的正文块上，独立成块。

    为什么必须整篇抽取：ASCII 直引号靠「交替配对」还原，奇偶性依赖起始位置。
    若逐块抽取，块起点落在引号中间会让奇偶翻转，产出张冠李戴的引文
    （实测约 7% 的引文块因此错配）。
    """
    body = [c for c in body_chunks if c.chunk_type == "body"]
    out: list[Chunk] = []
    # 抽取时放宽到 QUOTE_FLOOR，再由下面的规则决定去留 —— 短引文只要有说话人
    # 就保留（「弃圣绝智」「普遍同质化」本身就是有效引文），无归属的短片段
    # （「女性本质」「本卷进度」这类术语强调）才丢弃。
    for inner, qs, qe in extract_quotes(full_text, min_chars):
        speaker = find_speaker(full_text, qs, qe, lex)
        if len(inner) < min_chars_reliable and not speaker:
            continue
        # 归属到重叠最多的正文块。要求覆盖过半，避免把被长段落切分劈开的引文
        # 挂到与它几乎无关的邻块上；覆盖不足的引文仍留在正文里，只是不单独成块。
        owner, best = None, 0
        for c in body:
            ov = min(qe, c.end) - max(qs, c.start)
            if ov > best:
                owner, best = c, ov
        if owner is None or best < 0.5 * (qe - qs):
            continue
        q = Chunk(
            chunk_id="",
            doc_id=owner.doc_id,
            seq=0,
            text=inner,
            chunk_type="quote",
            chapter_path=list(owner.chapter_path),
            start=qs,
            end=qe,
            page=_page_at(page_index, qs),
            speaker=speaker,
        )
        fill_meta(q, lex)
        # speaker 是**精确**字段（只认有引述标记的最近人名），用于展示与严格检索；
        # philosophers 是**过滤**字段，并入「引文正文里提到的人」与「所在正文块的
        # 上下文人物」，否则 2% 的归因率会让「按理论家检索引文」几乎不可用。
        q.concepts = list(dict.fromkeys([*q.concepts, *owner.concepts]))
        q.philosophers = list(dict.fromkeys(
            [*([speaker] if speaker else []), *q.philosophers, *owner.philosophers]))
        q.eras = lex.eras_of(q.philosophers)
        out.append(q)
    return out


def build_chunks(
    blocks: list[Block],
    doc_id: str,
    lex: Lexicon,
    cfg: dict,
    full_text: str | None = None,
    page_index: list[tuple[int, int]] | None = None,
) -> list[Chunk]:
    chunks = _build_body_chunks(blocks, doc_id, lex, cfg)
    if cfg.get("split_quotes", True) and full_text is not None:
        min_chars = int(cfg.get("quote_min_chars", 12))
        min_reliable = int(cfg.get("quote_min_chars_reliable", 6))
        chunks.extend(_quote_chunks(
            chunks, full_text, lex, min_chars, min_reliable, page_index))

    chunks.sort(key=lambda c: (c.start, 0 if c.chunk_type != "quote" else 1))
    for i, c in enumerate(chunks, start=1):
        c.seq = i
        c.chunk_id = f"{doc_id}#c{i:05d}"
    return chunks


# --------------------------------------------------------------------------- #
# 5. 顶层入口
# --------------------------------------------------------------------------- #
def build_document(path: Path, doc_id: str, lex: Lexicon, cfg: dict) -> tuple[list[Chunk], str]:
    segments = load_segments(path)
    blocks = parse_blocks(segments)

    # 还原 parse_blocks 使用的坐标系：段间用 "\n" 连接，偏移即与 blocks 一致。
    # 引文必须在整篇范围内配对（见 _quote_chunks），故这里重建全文与页码索引。
    full_text = "\n".join(text for _, text in segments)
    page_index: list[tuple[int, int]] = []
    off = 0
    for page, text in segments:
        page_index.append((off, page))
        off += len(text) + 1

    # 文档标题：优先取首个标题之前的那行短文本（书名行），否则取首个标题
    title = ""
    for b in blocks:
        if b.kind == "heading":
            title = title or b.text
            break
        if b.kind == "paragraph" and not title:
            text = b.text.strip()
            if 0 < len(text) <= 30:
                title = text
    if not title:
        title = path.stem
    return build_chunks(blocks, doc_id, lex, cfg, full_text, page_index), title
