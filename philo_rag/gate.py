"""问题闸门（检索前置过滤）：判断一个问题是否值得进入检索流程。

为什么需要这一层
----------------
引用溯源问答的每一环都有成本：查询扩展 → 稠密嵌入 → BM25 → RRF 融合 → 证据筛选 → 生成。
而实际输入里有相当一部分根本不是「能在这本书里找到答案」的问题——
寒暄、对系统自身的询问、实时信息、通用任务、缺少主题的碎片追问……
对它们跑完整条链路，只会得到「资料不足」这类零信息结果，却照常付出全部算力，
还会把噪声混进评测与日志。

因此把「该不该检索」提到链路最前端，用一个**轻量、可解释、可关闭**的规则闸门裁决：

    ┌──────────┐   不通过   ┌──────────────────────┐
    │  问题    │ ─────────▶ │ 直接跳过，不进入检索  │
    └────┬─────┘            └──────────────────────┘
         │ 通过
         ▼
    混合检索 → 证据筛选 → 生成

闸门只做「粗筛」，不做语义理解。它的取舍是：**宁可放行模糊问题（交给检索与生成去判断），
也绝不误杀真正的哲学提问**。所以拦截面收得很窄——只有命中「明显不属于知识库」的
封闭模式、或既无锚点又无提问句式的碎片时，才判定跳过。

拦截类别（按判定优先级）
------------------------
  social      社交寒暄（你好 / 谢谢 / 再见 …）
  meta        询问系统自身或使用方法（你是谁 / 怎么用 / 帮助 …）
  fragment    无上下文的碎片追问（继续 / 然后呢 / 详细点 …）
  too_short   归一化后短于阈值，未构成可检索的提问
  off_topic   实时信息或通用任务（天气 / 股票 / 翻译 / 写代码 …）
  no_anchor   既无知识库锚点、又无实词（strict 档下凡无锚点即拦）

放行判据（任一命中即放行）
--------------------------
  1. 命中词典：概念 / 理论家（含别名归一）
  2. 命中体系编号：`1` / `3-2` / `1-1-1-4` 这类数值单元编号
  3. 命中哲学域词：字头、场域论、本体论、辩证法、存在、意识形态 …
  4. 命中提问句式：什么是 / 为何 / 如何 / 区别 / 含义 / 主张 …
"""
from __future__ import annotations

import re
from typing import Any

from .lexicon import Lexicon

# --------------------------------------------------------------------------- #
# 归一化
# --------------------------------------------------------------------------- #
RE_WS = re.compile(r"[\s\u3000\u200b-\u200f\ufeff]+")


def normalize(question: str) -> str:
    """折叠空白与零宽字符，保留其余字符（中文标点对判据有意义）。"""
    return RE_WS.sub(" ", (question or "").strip())


# --------------------------------------------------------------------------- #
# 拦截模式
# --------------------------------------------------------------------------- #
# 1) 社交寒暄：整句只是礼貌用语时才拦（用 fullmatch，避免误伤「黑格尔说过谢谢吗」）
RE_SOCIAL = re.compile(
    r"^(?:你好|您好|哈喽|哈啰|嗨|hi|hello|hey|在吗|在不在|"
    r"早上好|中午好|下午好|晚上好|早安|晚安|再见|拜拜|bye|"
    r"谢谢|谢谢你|多谢|感谢|辛苦了|好的|收到|知道了|嗯+|哦+|ok|okk|"
    r"测试|test|随便问问|随便聊聊|闲聊|唠嗑|聊聊)"
    r"[!！。~～,.，、？?…\s]*$",
    re.IGNORECASE,
)

# 2) 询问系统自身 / 使用方法：与书的内容无关
RE_META = re.compile(
    r"(你是谁|你叫什么|你的名字|你是什么|你是哪个|你是人还是|"
    r"你能做什么|你会做什么|你会什么|你有什么功能|你的功能|你的能力|"
    r"自我介绍一下|介绍一下你自己|介绍下你自己|你是谁开发的|你背后|"
    r"你用的什么模型|你是什么模型|你能联网|你能上网|你能看图|你能画图|"
    r"怎么用|如何使用|使用说明|使用手册|帮助文档|怎么启动|如何部署|"
    r"这个系统|这个网站|这个知识库怎么|这个项目|怎么搭建|如何搭建|"
    r"源代码|源码|接口文档|api\s*文档|help)",
    re.IGNORECASE,
)

# 3) 实时信息 / 通用任务：本知识库是封闭语料，答不了也不该硬答
RE_OFFTOPIC = re.compile(
    r"(天气|气温|降雨|下雨|今天几号|现在几点|当前时间|北京时间|星期几|"
    r"股票|股价|基金|彩票|汇率|币价|比特币|新闻|头条|热搜|球赛|世界杯|比分|"
    r"翻译成|翻译为|译成|帮我写|写一篇|写一段|写一首|写首诗|作诗|写个?代码|写代码|编程|python|java|"
    r"作文|情书|简历|邮件|菜谱|做菜|购物|机票|酒店|导航|路线|"
    r"笑话|唱首歌|画一幅|画个|生成图片|做个?表|表格|excel|ppt|幻灯片)",
    re.IGNORECASE,
)

# 4) 碎片追问：脱离上下文就没有主题，检索无从下手
RE_FRAGMENT = re.compile(
    r"^(?:继续|然后呢|然后|接着|再说|展开|详细点|详细说|细说|举例|举个例子|"
    r"为什么|为何|是吗|对吧|还有呢|呢|嗯嗯|就这样|再说说)"
    r"[？?。!！、，,\s]*$"
)

# --------------------------------------------------------------------------- #
# 放行判据
# --------------------------------------------------------------------------- #
# 提问句式 / 内容诉求：出现即说明用户在问「书里的内容」，而非寒暄或派活
RE_ASK = re.compile(
    r"(什么|为何|为什么|如何|怎么|怎样|何谓|何为|哪|谁|几|是否|能否|可否|"
    r"区别|差别|关系|联系|含义|意义|意思|指什么|指的是|意指|意味着|"
    r"主张|核心|观点|立场|评价|看法|解释|阐述|论述|介绍|讲讲|说说|谈谈|"
    r"梳理|分析|比较|对比)"
)

# 哲学域词：不依赖词典也能识别「这是哲学提问」的兜底锚点
DOMAIN_TERMS: tuple[str, ...] = (
    "哲学", "字头", "场域论", "本体论", "认识论", "目的论", "话语", "四层", "四话语",
    "辩证法", "辩证", "存在", "实在", "意识", "主体", "客体", "主体性", "真理",
    "形而上学", "观念论", "唯物", "唯心", "理性", "经验", "先验", "超验", "感性",
    "语言", "符号", "能指", "所指", "精神", "现象学", "伦理学", "政治", "意识形态",
    "乌托邦", "宗教", "科学", "美学", "自由", "必然", "时间", "空间", "因果",
    "本质", "现象", "逻辑", "本体", "认知", "怀疑", "虚无", "意志", "欲望",
    "结构主义", "解构", "批判", "异化", "实践", "伦理", "正义", "真理观", "范式",
)

# 数值单元编号（1 / 3-2 / 1-1-1-4）
RE_UNIT_CODE = re.compile(r"\d+(?:-\d+){1,3}")


def _has_anchor(question: str, lex: Lexicon | None) -> bool:
    """问题里是否存在「指向本书内容」的锚点。"""
    if lex is not None:
        if lex.match_concepts(question) or lex.match_philosophers(question):
            return True
    if RE_UNIT_CODE.search(question):
        return True
    return any(term in question for term in DOMAIN_TERMS)


# --------------------------------------------------------------------------- #
# 裁决
# --------------------------------------------------------------------------- #
SKIP_MESSAGES: dict[str, str] = {
    "too_short": "问题过短，未构成可检索的提问。",
    "social": "这看起来是寒暄，不属于《哲学大纲》知识库能回答的内容。",
    "meta": "这是关于系统自身或使用方法的询问，未指向知识库内容。",
    "fragment": "缺少上下文的碎片追问，没有可检索的主题。",
    "off_topic": "该问题涉及实时信息或通用任务，超出本知识库范围。",
    "no_anchor": "问题中没有识别到知识库的概念、理论家或单元锚点。",
}
DEFAULT_HINT = "请换一个与《哲学大纲》内容相关的问题，例如「什么是字头？」「大他者怎么理解？」"


def _verdict(
    question: str,
    ok: bool,
    category: str,
    reason: str,
    hint: str = "",
) -> dict[str, Any]:
    return {
        "question": question,
        "ok": ok,
        "category": category,
        "reason": reason,
        "hint": hint if not ok else "",
    }


def check_question(
    question: str,
    lex: Lexicon | None = None,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """裁决一个问题是否进入检索流程。

    返回结构（可直接并入问答结果）：
        ok        True 表示放行；False 表示跳过
        category  pass / disabled / too_short / social / meta / fragment / off_topic / no_anchor
        reason    人类可读的裁决理由
        hint      跳过时给出的改写建议
    """
    gate_cfg = (cfg or {}).get("gate", {}) if cfg else {}
    q = normalize(question)

    if not gate_cfg.get("enabled", True):
        return _verdict(q, True, "disabled", "闸门已关闭，所有问题直接进入检索")

    min_chars = int(gate_cfg.get("min_chars", 4))
    strict = bool(gate_cfg.get("strict", False))
    hint = str(gate_cfg.get("hint", "") or DEFAULT_HINT)
    has_anchor = _has_anchor(q, lex)

    # ---- 逐条硬拦截 ----
    # 顺序即优先级：先匹配语义明确的封闭模式，再回落到长度兜底，
    # 这样「你好」被记为 social 而不是笼统的 too_short，裁决理由才对得上。
    if RE_SOCIAL.match(q):
        return _verdict(q, False, "social", SKIP_MESSAGES["social"], hint)
    if RE_META.search(q):
        return _verdict(q, False, "meta", SKIP_MESSAGES["meta"], hint)
    if RE_FRAGMENT.match(q):
        return _verdict(q, False, "fragment", SKIP_MESSAGES["fragment"], hint)
    if len(q) < min_chars:
        # 短句只有在「既无锚点、又无实质内容」时才算退化输入。
        # 「字头」「3-2」这类短术语本身带锚点，应当放行；「什么是」这种只有问句词的才拦。
        residual = RE_ASK.sub("", q).strip(" ?？。！!，,、：:；;…~～")
        if not has_anchor and len(residual) < 2:
            return _verdict(q, False, "too_short", SKIP_MESSAGES["too_short"], hint)
    if RE_OFFTOPIC.search(q) and not has_anchor:
        return _verdict(q, False, "off_topic", SKIP_MESSAGES["off_topic"], hint)

    # ---- 锚点判定 ----
    # 非 strict 档下不因「词典没收录」而拦截：哲学域是开放的，词典只有 105 个概念，
    # 把未登录但合理的提问（如「阿赖耶识」）挡在外面，比放它进检索（最坏得到「资料不足」）更糟。
    # 因此只有「既无锚点、又连一个实词都不剩」的退化输入才判 no_anchor；
    # 想强制要求锚点，把 gate.strict 打开即可。
    if not has_anchor:
        if strict and len(q) >= min_chars:
            return _verdict(q, False, "no_anchor", SKIP_MESSAGES["no_anchor"], hint)
        residual = RE_ASK.sub("", q).strip(" ?？。！!，,、：:；;…~～")
        if len(residual) < 2:
            return _verdict(q, False, "no_anchor", SKIP_MESSAGES["no_anchor"], hint)

    return _verdict(q, True, "pass", "通过闸门，进入检索")


def skip_answer(gate: dict[str, Any]) -> str:
    """把跳过裁决渲染成给用户的答复文本。"""
    parts = [gate.get("reason", "该问题不适合检索回答。")]
    hint = gate.get("hint") or DEFAULT_HINT
    if hint:
        parts.append(hint)
    return "".join(parts)
