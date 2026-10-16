"""数据模型：解析块与知识块。"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

RE_UNIT_CODE = re.compile(r"^(\d+(?:-\d+){0,3})\s")
RE_VOLUME = re.compile(r"^第\s*[一二三四五六七八九十百零〇\d]+\s*卷")


@dataclass
class Block:
    """文档解析后的结构单元（分块的原子单位）。"""

    kind: str            # heading | paragraph | quote | footnote
    text: str
    level: int = 0       # heading 层级，0 表示非标题
    start: int = 0       # 在全文中的字符偏移
    end: int = 0
    page: int = 1


@dataclass
class Chunk:
    """进入索引的最小知识单元，携带完整可溯源的元数据。"""

    chunk_id: str
    doc_id: str
    seq: int
    text: str
    chunk_type: str = "body"                      # body | quote | footnote
    chapter_path: list[str] = field(default_factory=list)
    start: int = 0
    end: int = 0
    page: int = 1
    philosophers: list[str] = field(default_factory=list)
    concepts: list[str] = field(default_factory=list)
    eras: list[str] = field(default_factory=list)
    speaker: str = ""                             # 引文的说话人
    char_len: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Chunk":
        return cls(**d)

    # ---------- 体系结构 ----------

    def unit_code(self) -> str:
        """本块所处的最细数值单元编号（如 '1-1-1-4'），无则返回空串。"""
        codes = [m.group(1) for p in self.chapter_path if (m := RE_UNIT_CODE.match(p))]
        return codes[-1] if codes else ""

    def unit_codes(self) -> list[str]:
        """本块所处的全部数值单元编号，含全部上位单元（用于按字头/卷过滤）。"""
        codes = [m.group(1) for p in self.chapter_path if (m := RE_UNIT_CODE.match(p))]
        out: list[str] = []
        for code in codes:
            parts = code.split("-")
            for k in range(1, len(parts) + 1):
                anc = "-".join(parts[:k])
                if anc not in out:
                    out.append(anc)
        return out

    def volume(self) -> str:
        """所属卷名（如 '第 1 卷 实在论'），无则返回空串。"""
        for p in self.chapter_path:
            if RE_VOLUME.match(p):
                return p
        return ""

    def embed_text(self) -> str:
        """用于向量化与 BM25 的文本 = 章节路径 + 元数据标签 + 正文。

        正文保持纯净（用于展示与引用），但检索时把结构信息一并编码进去，
        这样「康德」「宋明理学」这类结构性词面才能命中整节内容。
        """
        head: list[str] = []
        if self.chapter_path:
            head.append(" / ".join(self.chapter_path))
        tags: list[str] = []
        if self.philosophers:
            tags.append("哲学家：" + "、".join(self.philosophers))
        if self.concepts:
            tags.append("概念：" + "、".join(self.concepts))
        if self.eras:
            tags.append("年代：" + "、".join(self.eras))
        if self.speaker:
            tags.append("说话人：" + self.speaker)
        if tags:
            head.append("｜".join(tags))
        return "\n".join([*head, self.text])

    def citation(self, doc_title: str = "") -> str:
        """生成人类可读的引用串，用于答案脚注。"""
        parts: list[str] = []
        if doc_title:
            parts.append(f"《{doc_title}》")
        if self.chapter_path:
            parts.append(" / ".join(self.chapter_path))
        if self.chunk_type == "quote":
            # 只标注**有引述标记**的说话人；philosophers 含上下文人物，不能当说话人展示
            parts.append(f"引文·{self.speaker}" if self.speaker else "引文")
        elif self.chunk_type == "footnote":
            parts.append("脚注")
        if self.page:
            parts.append(f"第 {self.page} 页")
        parts.append(f"字符 {self.start}-{self.end}")
        return " · ".join(parts)
