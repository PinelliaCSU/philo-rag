# 优化方向 · 评审结论与施工任务书

> 状态：**已评审，可直接开工**（本文档即任务书，供编程 Agent 逐条执行）。
> 评审基线：仓库 main，`pytest tests/test_gate.py tests/test_routing.py tests/test_lru.py -q` → **57 passed**（全量 `pytest -q` 需加载 bge 模型，本机约 1–3 分钟，改动前请先跑一次留基线）。
> 原始三条方向（P0 多轮追问 / P1 历史与收藏 / P2 对比与连续阅读）保留原有意图，但**方案已做实质修订**——标「修订」处按本文执行，不要按原文实现。

---

## 0. 给编程 Agent 的硬约束（先读这一节）

1. **技术栈红线**：不新增任何第三方依赖（`pyproject.toml` 的 `dependencies` 不动）；前端继续是 HTML + CSS + 原生 JS，**无构建步骤、无框架**；持久层本轮只用「进程内存 + 浏览器 localStorage」，**不引入 SQLite / 任何 DB / 向量库 / 图表库**。
2. **分层红线**：`answer.py` 只做编排（见其文件头 answer.py:33-39 的职责表）。新逻辑一律落**新模块**（本轮新增 `conv.py`、`rewrite.py`），不得把会话/改写逻辑堆回 `answer.py`。
3. **依赖方向**：`server → answer → {rewrite, conv, routing, gate, retrieve}`；`rewrite` 只依赖 `gate.normalize` / `text_rules` / `Lexicon`，不得反向 import `answer`（避免循环导入）。
4. **禁止改提示词占位符**：`answer_prompt.py` 的模板在 6 处被 `.format(...)` 调用（answer.py:171、178、424、465；answer_theme.py:220、394），新增占位符必然漏改一处并抛 `KeyError`。本轮所有「补充上文信息」一律**前置拼进 context 字符串**，模板零改动。
5. **提交节奏**：T1→T5 顺序提交，每个任务自成一个可回滚提交；每任务结束必须 `ruff check . && pytest -q` 全绿。
6. **回报格式**（每个任务都要给）：改动文件清单（含行号区间）→ 新增/变更的接口契约 → 测试输出 → 手工冒烟步骤与结果。只给结论不给证据视为未完成。
7. 注释与文档用中文，与现有代码风格一致；`from __future__ import annotations` 照抄同级模块写法；线程安全按 `lru.py:3-10` 的既有教训处理。

---

## 1. 现状速览（只列与本次相关的部分）

| 模块 | 职责 | 与本次需求的关系 |
|---|---|---|
| server.py | FastAPI 装配、`/api/*` 路由、静态资源 | `AskRequest` 只有 question/strategy/focus（server.py:73-85），**无会话概念**；`/api/ask_stream` 是前端主路径（server.py:264-291） |
| answer.py | 编排：闸门→相关性→澄清→点/范围→生成 | `_plan()` 是两条路径共用的前置决策（answer.py:194-245）；LRU 键 = `(question, strategy)`（answer.py:87、270） |
| gate.py | 检索前置规则闸门 | `fragment` 把「继续/详细点/为什么」整类拦死（gate.py:96-100、191-192）——**这是 P0 的根因** |
| routing.py | 点/范围判定 + 裸主题澄清 | `clarify_broad_topic` 对裸主题反问方向（routing.py:148-177），与多轮会互撞 |
| answer_theme.py | 范围查询分支 | `theme_answer(..., focus)`（:241-244）→ `_theme_generate(..., focus)`（:200-220） |
| retrieve.py | 混合检索/术语/引文/概念卡 | `build_concept_card` 已给 definition/units/philosophers/**related(块内共现)**/themes/quotes（retrieve.py:698-723）——**P2 对比模式的数据已现成** |
| web/app.js | 单页前端（约 1300 行） | 单视图 + 四面板（index.html:15-20）；笔记只收藏「块」（app.js:1085-1145）；已有全局动作 `data-ask / data-bookmark / data-ctx / term-link`（app.js:1249-1280） |
| lru.py | 线程安全 LRU | 会话存储必须用同款「单锁包住多步操作」模式 |

**关键事实（决定方案走向）：**

- 前端回答正文是 SSE 流式渲染，`done` 事件才拿到最终 `answer/sections/annotations`（app.js:522-536）；`/api/ask` 非流式只作兜底（app.js:544-557）。
- `answer_stream()` **完全不读写 LRU**（answer.py:355 起无缓存调用）；只有 `answer()` 有缓存。→ 前端主路径其实**没有缓存**，原方案未意识到（见 §5 R1）。
- `answer()` 的缓存键**不含 `focus`**（answer.py:270），而 `focus` 会改变主题生成侧重（answer_prompt.py:267-269 的 `focus_guide`）→ 现存缺陷（R2）。
- `gate` 的 skipped 结果也写进缓存（answer.py:287）→ 会话改写后必须让键区分，否则拿回旧的「已跳过」（R3）。
- 引用卡片的「正文懒加载」已实现：`toggleCite()` 在 body 为空/被截断时会 `GET /api/context` 取中块正文（app.js:406-446）。→ 历史记录**可以只存瘦身引用**，正文按需回捞，不需要新接口（R6 的对策成立）。
- `/api/unit?code=&limit=200` 已返回整单元按阅读顺序的块（server.py:186-244）；`/api/units` 返回全部 338 单元（server.py:181-183）→ 连续阅读**不需要后端改动**。
- `lex.concept_card()` 只覆盖**概念**；理论家没有卡片端点（只有 `/api/quote?philosopher=`）→ 「康德 vs 黑格尔」不能照搬对比模式（R11）。
- `_plan()` 仅在 answer.py 内部被调用（answer.py:276、374），测试未直接引用 → 给它加参数是安全的。

---

## 2. 总体判断

| 方向 | 可行性 | 真实成本 | 收益 | 结论 |
|---|---|---|---|---|
| **P0 多轮追问** | 高（改动面小、无新依赖） | 1.5–2 人日 | 最大（解除「追问即被拦」的断层） | **做，但按修订方案**（改写前置 + 服务端会话 + 缓存键升级） |
| **P1 问答历史与收藏** | 高 | 1 人日 | 大（个人研究最常用） | **做**，必须做引用瘦身与容量裁剪（R6） |
| **P2-1 对比（概念 vs 概念）** | 高（后端数据现成） | 0.5–1 人日 | 中 | **做**（新增 `/api/compare` + 前端面板） |
| **P2-1' 对比（理论家 vs 理论家）** | 中（缺数据源，需新聚合） | +1–1.5 人日 | 中 | 二期（T4b，本轮可跳过） |
| **P2-2 连续阅读** | 高（端点齐全，纯前端） | 0.5–1 人日 | 中高 | **做**（注意术语加链接的实现陷阱 R10） |
| **P2-3 关系图 / 时间线** | 低（投入产出比最差） | 3+ 人日 | 低 | **不做**（图表库 = 新依赖） |

合计：**T1–T3 + T4 + T5 ≈ 3.5–4.5 人日**，T4b 另计。

---

## 3. 关键决策（ADR：为什么这样做，为什么不那样做）

**D1 会话状态放服务端进程内存（TTL 30 分钟），前端只持有 `conversation_id`。**

- 为什么：① 改写需要**结构化**的一轮信息（原问题 / 改写后独立问题 / 策略 / 主题 / 结论摘要），不是一串文本；② 流式答案有 4000 字，让前端每轮回传会让请求体膨胀，并让 `app.js` 的 `askSeq/stale` 竞态（app.js:451-461）复杂化；③ 单用户内存足够，`LruCache` 的锁模式可复用。
- 为什么不：不上 SQLite（P1 的历史留在浏览器，见 D5）；不把整段历史喂给模型（只喂上一轮 ≤300 字摘要，R13）。

**D2 改写只做规则，v1 不接 LLM 兜底。**

- 为什么：规则覆盖「继续/详细/为什么/举例/那X呢/和X比」，命中率高且 <1ms；LLM 改写引入 1–3s 首字延迟，且在 `answer.backend=template`（测试/离线模式，conftest.py:30-34 固定）下根本不可用，会造成「测试通过、线上行为不同」。
- 规则未命中时的**兜底**：若存在上文且本轮问题既无词典锚点也无提问句式 → 直接继承上一轮 `standalone`（等价于「又问了一遍」），仍然安全（宁放行不误杀，与 gate 的设计哲学一致，gate.py:20-22）。
- 何时再引入 LLM 改写：规则实测命中率 <80% 时（先在 `scripts/` 加一个 30 条样本的命中率巡检脚本）。本轮不做，也不加配置项（不留死开关）。

**D3 追问不重新做「点/范围」判定——改写出来的句子本身就携带意图。**

- 例：「那黑格尔呢」→ 上一轮 `theme+position` 时改写为「黑格尔在体系中的位置」→ 自然路由成 theme；上一轮 `point` 时改写为「黑格尔的核心定义是什么？」→ 自然路由成 point。
- 唯一例外（**必须做**）：上一轮是 `theme` 且本轮是纯延续（继续/详细/为什么/举例）时，**降级为 point** 并注入上文摘要。否则会以数千字重跑一遍范围查询，既慢又难读，还烧 token。

**D4 缓存键升级为 `(standalone, strategy, focus_or_empty, S|F)`，并给流式路径补上同样的缓存。**

- 为什么必须补流式：前端主路径是 `/api/ask_stream`，它现在完全不查缓存。只改 `answer()` 的键，等于让「缓存键含改写后问题」这句要求落空。
- 为什么带 `S|F`：追问会注入上文摘要，答案与「首次提问」不同，必须区分，否则首问的答案会被追问复用、反之亦然。

**D5 历史与收藏留在浏览器 localStorage，不上后端、不建库。**

- 为什么：个人项目零运维；现有「笔记」已是这个模式（app.js:1085-1099）。
- 代价与对策：换浏览器/清缓存会丢 → 提供「导出 JSON（可备份）/ 导出 Markdown（可阅读）」；localStorage 单域约 5MB → **必须**瘦身引用 + 限条裁剪（R6）。
- **不要把 P0 的会话存储与 P1 的历史存储合并**：一个是运行期状态（有 TTL、可丢），一个是长期记录（要持久）——合并会顺手把数据库引进来。

**D6 对比模式 v1 只做「概念 vs 概念」。**

- 为什么：`build_concept_card` 已产出 definition / units / related(共现) / quotes，只差一个「双卡 + 交集」的组装端点；理论家没有卡片数据源，需要从 chunk 元数据重新聚合（philosophers/speaker/eras），列为 T4b。

---

## 4. 任务书

### T1 · 会话与追问底座（后端，0.5–0.75 人日）

**目标**：一条追问不再被 `fragment` 拦死；同一会话内「继续/详细点/那X呢/和Y比呢」能基于上文变成可检索的独立问题；非流式与流式两条入口行为一致。

**边界（可动）**：新建 `philo_rag/conv.py`、`philo_rag/rewrite.py`；修改 `philo_rag/answer.py`、`philo_rag/server.py`、`philo_rag/answer_theme.py`、`config.yaml`；`philo_rag/gate.py` 仅允许改注释与文案，**不得改判定逻辑**。
**禁止**：改 `theme.py` / `retrieve.py` 的检索逻辑；改 `answer_prompt.py` 的模板占位符；关闭 social/meta/off_topic 拦截。

**(1) `conv.py`（新，约 90 行）**

    @dataclass
    class Turn:
        question: str          # 用户原话
        standalone: str        # 改写后的独立问题（= 实际检索用的问题）
        strategy: str          # point | theme
        topic: str = ""        # theme_topic() 结果（theme 时用于聚合）
        focus: str | None = None
        digest: str = ""       # 给下一轮的「上一轮要点」≤300 字
        ts: float = 0.0

    class ConversationStore:
        """conversation_id → [Turn...]，TTL + 容量双约束，单锁保护。"""
        def __init__(self, maxsize: int = 64, ttl_sec: int = 1800) -> None: ...
        def get(self, cid: str | None) -> list[Turn]     # 过期/不存在 → []
        def append(self, cid: str, turn: Turn) -> None   # 单会话最多保留 max_turns 轮
        def new_id(self) -> str                          # secrets.token_hex(6)
        def clear(self) -> None                          # 供测试

- 阈值进 `config.yaml` 新增段：`conversation: {enabled: true, ttl_sec: 1800, max_turns: 4, digest_chars: 300, max_conversations: 64}`。
- `digest` 生成规则（**别把 4000 字答案塞进去**）：
  - `strategy == "point"`：`answer` 去掉引用标记后取前 `digest_chars` 字；
  - `strategy == "theme"`：**用结构化字段**——`theme.units[:3]` 的 `code+title`、`theme.lineage[:5]` 的名称、`theme.counts.direct`，拼成一句 ≤300 字（`theme_answer` 返回体已带 `theme` 字段）。

**(2) `rewrite.py`（新，约 130 行）**

    @dataclass
    class Rewrite:
        standalone: str
        is_followup: bool
        hint: str = ""           # 给提示词的一句侧重（拼进 context 前置块，不给模板加占位符）
        downgrade: bool = False  # True 时强制 strategy = point

    def rewrite_followup(question: str, turns: list[Turn], lex: Lexicon) -> Rewrite

规则表（**顺序即优先级**，全部作用于 `normalize(question)`）：

| # | 形态（示例） | 判定 | standalone | hint / downgrade |
|---|---|---|---|---|
| 1 | 继续 / 然后呢 / 接着 / 再说 / 展开 / 细说 | fullmatch 于 continue_pat | `last.standalone` | hint=继续展开、不重复上文；downgrade = (last.strategy=="theme") |
| 2 | 详细点 / 具体点 / 展开讲讲 / 说得更清楚些 | 同上 | `last.standalone` | hint=把上文论点讲细、指出分歧；同上 downgrade |
| 3 | 为什么 / 为何 / 凭什么 / 怎么证明 | 同上 | `last.standalone` | hint=说明上文结论在原文中的论证依据；同上 |
| 4 | 举个例子 / 举例 / 出处 / 原文在哪 | 同上 | `last.standalone` | hint=给出原文中的具体例子与引文 |
| 5 | 那 X 呢 / 那么 X 呢 / X 呢 / 换成 X / 那 X | `^(?:那|那么)?\s*(?P<x>[^，。？！]{1,12})\s*呢$` 或 `^那(?P<x>.{1,12})$` | 见下（意图模板） | 按上一轮意图合成 |
| 6 | 和 X 比呢 / 与 X 有何不同 / 对比 X / X 和 Y 的区别 | `(?:和|与|跟)\s*(?P<x>.{1,12})\s*(?:比|比较|有什么不同|有何不同|区别)` | `f"{last.topic or last.standalone}与{x}的异同与关键分歧"` | hint=对比二者的定义、体系位置与分歧 |
| 7 | 含指代且无锚点：他 / 它 / 这 / 那（「这段话什么意思」「它到底指什么」） | `re.search(r"(他|它|这|那|上面|刚才|前面|上一)")` 且无词典锚点 | `last.standalone` | hint 沿用 #2 |
| 8 | 兜底：存在上文、问题无锚点、无提问句式 | `len(q) >= 2` | `last.standalone` | hint = "" |

规则 #5 的意图模板（由 `last.focus` / `last.strategy` 决定；**无 `last` 时** `standalone = x`，交给系统自己路由/澄清）：

| 上一轮 | standalone 合成 |
|---|---|
| `point`（或无 focus） | `f"{x}的核心定义是什么？"` |
| `theme + position` | `f"{x}在体系中的位置"` |
| `theme + mechanism` | `f"{x}的思想机制与论证路径"` |
| `theme + lineage` | `f"{x}的谱系与后继影响"` |
| `theme + critique` | `f"书中对{x}的张力与批判"` |

- `x` 的清洗：去掉首尾「那/那么/呢/的」；清洗后为空 → 落回规则 #8。
- **不要因为词典未收录就放弃改写**：`x` 未登录词典时仍合成（如「阿赖耶识的核心定义是什么？」），否则未登录主题永远接不上上文。
- 纯延续类（#1–#4）但**没有上文** → 不生效（`is_followup=False`），保持现状让 gate 拦，仍返回原 `fragment` 文案。

**(3) `answer.py` 接入（最小侵入，约 20 行净增）**

- `_plan(store, lex, question, cfg, strategy, turns=None)` 开头插入：

      rw = rewrite_followup(question, turns or [], lex)
      question = rw.standalone     # 之后所有闸门/锚点/检索/路由都用改写后的句子

  改写在 gate **之前**，于是 `fragment` 自然不再命中（改写后的句子不匹配 `RE_FRAGMENT`），**不需要改 gate.py**；`check_relevance` 也自然作用于有主题的句子，不必特判。这是本方案能保持最小侵入的关键。
- `data` 增加 `standalone`、`is_followup`、`hint`、`downgrade`；`strat` 计算处：`if rw.downgrade: strat = "point"; reason = "追问纯延续：避免重跑范围查询"`。
- 缓存键（answer.py:270 附近）改为 `(question, strategy, focus or "", "F" if is_followup else "S")`——**同时修好 R2**。
- 上文摘要注入（**不改模板**）：`context = _prior_block(digest, hint) + "\n\n" + build_context(hits, doc_title)`；`_prior_block` 产出形如「【上一轮已答要点，本轮请勿重复，只做增量】\n{digest}\n【本轮侧重】{hint}」，无上文时返回空串。
- `answer_stream()`（answer.py:355 起）：**补齐与非流式同键的 LRU 读写**（`done` 之前 `_cache_put`），并在 `meta` 事件带上 `conversation_id`、`standalone`、`is_followup`；在 `done` 之后写 `ConversationStore`（只写成功生成的轮次；`gate`/`clarify` 分支只记 `topic` + `standalone`，不记 digest）。
- `theme_answer` / `_theme_answer_stream` 增加关键字参数 `prior: str = ""`，在各自组装 context 处前置（answer_theme.py:200-220、:320-400）。

**(4) `server.py`**

    class AskRequest(BaseModel):
        question: str = Field(..., min_length=1)
        strategy: str = Field("auto", pattern="^(auto|point|theme)$")
        focus: str | None = None
        conversation_id: str | None = Field(None, max_length=32, pattern=r"^[0-9a-zA-Z_-]*$")

- 两个端点都传给 `answer*_fn(..., conversation_id=req.conversation_id)`；会话读写由 `answer*` 负责，**server 层不持有会话逻辑**。
- `meta` 新增字段：`conversation_id`、`standalone`、`is_followup`。

**验收（必须新增两个测试文件）**

- `tests/test_rewrite.py`（纯函数，不加载模型）：
  - 无上文时「继续」→ `is_followup=False`；
  - 有上文（point+definition）时「继续」→ `standalone == 上一轮 standalone`；
  - 「那黑格尔呢」+ 上文(theme+position) → 「黑格尔在体系中的位置」；
  - 「和康德比呢」+ 上文(主题=大他者) → 结果同时含「大他者」与「康德」；
  - 上一轮 theme + 「详细点」→ `downgrade=True`；
  - 完整独立问句（「什么是字头？」）→ `is_followup=False` 且 `standalone` 原样返回。
- `tests/test_conv.py`：TTL 过期、`max_turns` 截断（保留最近 N）、`get(None) → []`、20 线程并发 append 不丢轮次。
- `tests/test_server.py` 追加：带同一 `conversation_id` 连发两次 `/api/ask`（第二问「继续」），断言第二次**不是** skipped、`strategy != "gate"`、返回同一 `conversation_id`；`/api/ask_stream` 的 meta 含 `conversation_id`。
- **不得**改 `tests/test_gate.py` 的 fragment 期望值（无会话时的拦截行为不变）。

---

### T2 · 前端多轮交互（0.5 人日）

**边界**：只改 `philo_rag/web/app.js`、`index.html`、`styles.css`。

1. `state` 增加 `conv: { id: null, turns: [] }`（`turns` 仅用于显示最近 N 条提问 chips，**不作为改写数据源**——以服务端为准）。
2. `doAsk()`：请求体加 `conversation_id: state.conv.id`；收到 `meta` 时 `state.conv.id = event.conversation_id`；若 `event.is_followup && event.standalone` 则在回答卡上方渲染一行灰字「已按上文改写为：{standalone}」。
3. 新增「新对话」按钮：重置 `state.conv = {id:null, turns:[]}`，清空 `#ask-out` 回初始提示卡、清空引用面板、`state.ask = null`。**把初始提示卡的 HTML 抽成常量**（现在硬编码在 index.html:44-54，被骨架渲染覆盖后需要能复原）。
4. 澄清卡点选（app.js:597-612、1252-1253）：必须复用**当前** `conversation_id`（同一会话的一轮），`done` 后往 chips 追加一条。
5. chips 只做展示 +「点一下填入输入框」，不做点击回滚（避免前端持有状态与服务端不一致）。
6. `askSeq/stale`（app.js:451-461）：**会话追加只发生在 `done`**；`stale()` 分支直接 return，不得写 `state.conv.turns`。`conversation_id` 赋值可无条件执行（重复赋同值无害）。

**验收**：手工冒烟 6 步（见 §7）；流式中途被新提问打断后，新答案不被旧流覆盖（既有行为不得回退）。

---

### T3 · 问答历史与收藏（前端，1 人日）

**边界**：`app.js` + `index.html` + `styles.css`；**后端零改动**。

数据结构（新键 `philo-answers-v1`，与块级笔记 `philo-notes-v1` **分开**）：

    {
      id, ts, conversation_id, question, standalone,
      strategy, route_reason, backend,
      answer, sections, annotations,
      citations: [{ n, chunk_id, citation, unit, unit_title }],   // 刻意不含 text
      cite_count, pinned
    }

- **瘦身是硬要求**：`citations[].text` 在 point 答案里被截到 1200 字、theme 答案有几十条引用，全存几轮就撑爆 5MB。去掉 text 后，引用卡正文由既有懒加载回捞（app.js:406-446）——**不需要新接口**。
- 写入时机：`done` 事件且 `event.answer` 非空且 `strategy !== 'clarify'` 且 `!skipped`。
- 裁剪：`MAX_HISTORY = 120`；每次写入后若 `JSON.stringify(list).length > 3_000_000`，从尾部丢到 2_000_000 字符以下（`pinned` 条目最后丢）。
- UI：
  - 新面板 `history`（第 5 个 tab）：列表项显示 `question` + 策略标签 + 时间 + `cite_count`，带「★ 收藏」（置 `pinned`）与「删除」；
  - 点条目 → `renderAnswer(entry)` + `renderCitations(entry)`（两者都是纯渲染函数，直接喂即可）；
  - 顶部输入框做**本地过滤**（匹配 `question` / `standalone`），不请求后端；
  - 两个导出按钮：「导出 JSON（备份）」「导出 Markdown」，复用 `exportNotes()` 的 Blob 下载模式（app.js:1180-1201）；
  - 「收藏本条回答」按钮只在 `renderAnswer()` 里加（回答卡 h3 右侧），**不要在 `renderAnswerSkeleton` 里加**（流式期间会被 `renderAnswer` 覆盖，两处维护必然漂移）。

**验收**：连问 3 轮 → 历史面板可见 3 条 → 点第 1 条能复原回答与引用卡 → 刷新后仍在 → 导出 JSON 可被 `JSON.parse` → 引用卡「展开全文」能回捞出正文（或给出明确提示而非空白）。

---

### T4 · 对比模式（概念 vs 概念，0.5–1 人日）

**(1) 后端：`retrieve.py` 新增 `build_compare`（约 70 行）**。先把 `build_concept_card` 里「命中块 + 概念计数」那段抽成 `_concept_hit_stats(store, lex, std, names) -> (hits, related_counts)` 供两处复用（**不要复制粘贴**）。

`GET /api/compare?a=大他者&b=客体小a` →

    {
      "terms": [
        {"term": "大他者", "found": true, "definition": "...", "units": [...],
         "philosophers": [...], "themes": [...],
         "related": [{"name": "象征界", "count": 7}], "quotes": [...]}
      ],
      "shared_related":    [{"name": "象征界", "a": 7, "b": 4, "sum": 11}],
      "shared_units":      [{"code": "3-2-1", "title": "...", "a": 3, "b": 2}],
      "a_only_related":    [{"name": "...", "count": 5}],
      "b_only_related":    [{"name": "...", "count": 3}]
    }

- 每侧 `quotes` 限 3 条；`shared_related` 取 `sum` 前 12；某侧 `found=false` 时另一侧照常返回（前端显示「词典未收录」，不要整页失败）。
- 复用 `_tagged_ids` / `_candidate_indices` 的候选集机制，**不要**对全库逐块扫正则（retrieve.py:582-605 已给出正确做法）。

**(2) 前端：新面板 `compare`**：两个输入框 +「对比」→ 三栏：

- 栏 1「定义与归属」：两侧 `definition` + 单元/理论家标签；
- 栏 2「共现与差异」：`shared_related` 用高亮 chip（点 chip → `openConcept(name)`，走既有全局动作）、两侧独有概念分列；
- 栏 3「引文」：两侧各 3 条引文卡（复用 `citeCard` 风格 + `data-bookmark`）。

CSS 只需一条 `.compare-grid { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px }`，窄屏改单列。

**(3) T4b（可选，二期）理论家对比**：需新端点 `/api/philosopher?name=`，从 chunk 元数据（`philosophers`）、引文块（`speaker`）、`eras`、`units` 聚合，外加 `lexicon/philosophers.yaml` 的别名/生卒年/流派。**本轮不实现**，只留契约定稿。

**验收**：`tests/test_compare.py` 断言两侧 `found`、`shared_related` 非空、顺序稳定可复现；`a=b` 不报错；`a` 不存在时 `terms[0].found == false` 且 HTTP 200。前端手工冒烟：chip 点击能打开概念卡。

---

### T5 · 连续阅读模式（0.5–1 人日，纯前端）

**边界**：`app.js` + `index.html` + `styles.css`；后端零改动（`/api/unit`、`/api/units`、`/api/context` 已够）。

1. 新视图 `#v-read`（全宽，替代侧栏形式——侧栏宽度不适合长文阅读）：入口在体系地图的单元详情里加「连续阅读」按钮；顶部工具条：`上一单元 / 单元标题 / 下一单元 / 字号- / 字号+ / 返回地图`。
2. 数据：`GET /api/unit?code=..&limit=200` 一次拉完单元内所有块；前后单元从已缓存的 `state.units`（`/api/units`）按数组下标取——**不要新增后端接口**。
3. 术语自动加链接（唯一有技术风险的部分，按此实现）：

        // 输入：已 esc 的文本、该块的 concepts 数组
        // 规则：① 概念按长度降序；② 每个概念全局匹配但只替换第一次出现；
        //      ③ 用 \u0001 包裹已替换片段做占位，避免「大他者」把「大他者性」里的子串二次替换；
        //      ④ 占位回填为 <button class="term-link" data-term="...">…</button>
        function linkTerms(escapedText, concepts) { ... }

   - 只处理 `chunk_type === 'body' | 'quote'` 的块，脚注不链接；
   - 替换前必须 `esc`（否则原文的 `<`/`&` 会破坏 HTML），替换后**不得**再走 `mdToHtml`（避免双重解析）；
   - `data-term` 用词典标准名（块的 `concepts` 已是标准名），点击走既有 `.term-link` 全局处理（app.js:1254-1255）。
4. 每块底部工具条：`☆ 收藏`（`data-bookmark`）、`查看上下文`（`data-ctx`）、`就这段提问`（`data-ask`，全局处理已在 app.js:1264-1265）。`data-ask` 的问题合成：取 `c.concepts[0]`，有概念则 `f"{c.unit} 中关于「{概念}」的论述是什么？"`，无概念则退化为 `f"{c.unit} 这一节的核心论点是什么？"`——**不要**把原文 100 字直接塞进问题（会触发 `off_topic`/`no_anchor` 噪声判定，引号也会污染输入）。
5. 阅读位置记忆：`localStorage['philo-read-pos']` 存 `{code, scrollTop}`，进入同一单元时恢复。

**验收**：手工冒烟——从体系地图 3-2-1 进入阅读 → 全部块按阅读顺序显示且无重复 → 术语点击能开概念卡 → 能翻到下一单元 → 收藏后笔记面板可见 → 刷新后回到同一位置。

---

## 5. 风险与可能遗漏的问题

| # | 问题（含证据） | 对策 |
|---|---|---|
| **R1** | **流式路径没有缓存**：`answer_stream()` 全程未调 `_ANSWER_CACHE`（answer.py:355-492），而前端主路径就是它。只改 `answer()` 的键等于白改。 | D4：两条路径共用同一键与同一读写位置；若因 SSE 复杂性决定不缓存，**必须在文档与代码注释里写明**，不能默认它已生效。 |
| **R2** | **缓存键漏 `focus`**（answer.py:270），而 `focus` 会改变主题写作侧重（answer_prompt.py:267-269）。 | 键改为 `(standalone, strategy, focus or "", S/F)`，顺手修掉。 |
| **R3** | **skipped/clarify 也进缓存**（answer.py:287、299）：会话改写后若键不变，会拿回旧的「已跳过」。 | 同 R2：键的第一项必须是 `standalone`（改写后的问题），而不是原始 `question`。 |
| **R4** | **追问被重新判成 theme 的代价**：theme 一轮召回数百块、生成 1500–4000 字（config 的 `theme_*`），CPU 上 20–60s + 显著 token。原方案未提。 | D3 的 `downgrade`：上一轮 theme + 纯延续 → 强制 point。 |
| **R5** | **澄清卡与追问互撞**：`clarify_broad_topic` 对 1–12 字裸主题反问方向（routing.py:110-177）。若「那黑格尔呢」被改写成裸词「黑格尔」会再次澄清，形成「点了方向又被反问方向」的死循环。 | 改写 #5 的意图模板**总是**把主题包进完整问句（含「什么/位置/机制」），从而被 `RE_CLARIFY_BLOCKED` 挡掉；只有 `turns` 为空时才允许产出裸词。 |
| **R6** | **localStorage 配额**：引用正文每条最长 1200 字（app.js:329-330 的判断即基于此），theme 答案几十条引用 → 单条记录可达 60KB。 | T3 的瘦身（只存 chunk_id/citation/unit/unit_title）+ 120 条上限 + 3MB 水位裁剪；正文靠既有懒加载回捞（app.js:406-446）。 |
| **R7** | **会话过期后的体验断层**：TTL 到点后「继续」又会被判 `fragment`，用户看到「缺少上下文的碎片追问」。 | `conv.get()` 返回空时 `rewrite_followup` 返回 `is_followup=False`；在 `answer()` 的 gate 分支里若问题匹配 `RE_FRAGMENT` **且**请求带了 `conversation_id` → 把 `hint` 换成「对话已过期（30 分钟无操作），请把问题重新完整描述一次」。只换文案，不改拦截逻辑。 |
| **R8** | **线程安全**：FastAPI 同步端点跑在线程池（server.py:259-262），`ConversationStore` 的 get/append 是多步操作。 | 复用 `lru.py` 的单锁模式；`tests/test_conv.py` 用 20 线程并发 append 断言不丢轮次。 |
| **R9** | **模板 `.format` 的 KeyError**：6 处调用点（answer.py:171/178/424/465、answer_theme.py:220/394），漏改一处即 500。 | 硬约束 #4：不加占位符，上文信息拼进 `context`。 |
| **R10** | **术语自动加链接的替换陷阱**：未 esc 直接拼 HTML 会被原文里的 `<`/`&` 破坏；按顺序替换会让「大他者」吃进「大他者性」；全量替换会让一段文字变成按钮森林。 | T5 的四条规则（先 esc、长词优先、每词一次、占位符回填，替换后不再走 mdToHtml）。 |
| **R11** | **「康德 vs 黑格尔」无法照搬概念对比**：`lex.concept_card()` 只认概念，理论家没有卡片端点，`/api/quote?philosopher=` 只给引文。 | T4 只做概念版；理论家版单列 T4b 并先定契约。**不要**用「把理论家当概念查」的伪实现（会返回 found=false 的空页）。 |
| **R12** | **文档漂移**：`answer.py:11-21` 的链路图、`docs/架构设计.md` 的「8.1 问题闸门」「十四、分阶段实施路线」「十五、风险与取舍」，以及 `docs/使用说明.md`（用户手册，多轮/历史/阅读器都是用户可见功能）。 | 每个任务收尾同步改：链路图加「0. 追问改写」一步；架构文档加一节「会话与追问」；使用说明加 3 段操作步骤。**不写文档视为未交付**。 |
| **R13** | **不要把整段历史塞进提示词**：几轮 4000 字 theme 答案会撑爆上下文，并让模型复述上文。 | 只注入上一轮 ≤300 字 `digest` + 一句 `hint`（D1/T1）。 |
| **R14** | **`digest` 取正文前 300 字对 theme 无效**（theme 开头是「聚合概览」式套话，信息量低）。 | theme 的 digest 从 `theme.units/lineage/counts` 结构化字段合成（T1 已写明）。 |
| **R15** | **版本与统计失真**：`pyproject.toml` 与 `server.py:128` 的 version 都是 1.1.0，`/api/stats` 不含会话能力开关。 | 版本升 1.2.0（两处同步）；`/api/stats` 增 `conversation: {enabled, ttl_sec}`，便于冒烟确认开关生效。 |
| **R16** | **前端零测试**：本仓库没有前端测试设施，前端 bug 只能靠手工发现。 | 把**可判定逻辑下沉为 Python 纯函数**（rewrite/conv/compare 都是），前端只留渲染与事件；§7 的冒烟步骤逐条记录结果。 |

---

## 6. 明确不做（YAGNI，写下来是为了防止顺手扩大范围）

- 不引入 SQLite / DuckDB / Redis / Chroma / FAISS / 任何新 pip 依赖；
- 不引入前端框架、打包器、TypeScript；
- 不做图表库（ECharts/D3/mermaid）→ 概念关系图与时间线**本轮不做**；
- 不做登录、多用户、会话隔离、权限；
- 不做服务端历史持久化（历史留在浏览器）；
- 不做 LLM 查询改写（D2，等命中率实测数据再定）；
- 不改检索/融合/重排参数（与本轮三档需求正交，改了失去基线可比性）；
- 不重写 `app.js` 的组织方式（仍用 `state` 单对象 + 全局事件委托；拆模块会引入构建步骤）。

---

## 7. 回归与手工冒烟清单

**每次提交前**

    ruff check .
    pytest tests/test_gate.py tests/test_routing.py tests/test_lru.py -q   # 秒级，必须先绿
    pytest -q                                                            # 全量，含模型加载，1–3 分钟

预期：现有 57 个 gate/routing/lru 用例全绿（**一个都不许改期望值**），新增用例全绿。

**手工冒烟（T1/T2 完成后依次做，全部通过才算完成）**

1. `python -m philo_rag.cli serve --port 8000` → 问「什么是字头？」得到回答与引用；
2. 直接追问「继续」→ 不再是「已跳过检索」，且顶部显示「已按上文改写为：…」；
3. 追问「那黑格尔呢」→ 返回黑格尔相关内容（说明意图被继承），而不是空泛的范围查询；
4. 点「新对话」→ 再问「继续」→ 恢复为「缺少上下文的碎片追问」（证明会话真的被清空）；
5. 问「你好」→ 仍被 `social` 拦（证明闸门没被放松）；
6. 连问两轮后刷新页面 → 历史面板能看到两轮（T3 完成项）。

**T4/T5 冒烟**：对比「大他者 / 象征界」三栏都有内容、点 chip 能开概念卡；从体系地图进阅读器、翻上下单元、点术语、收藏、刷新保持位置。

---

## 8. 执行顺序与交付物

| 顺序 | 任务 | 预估 | 依赖 | 交付物 |
|---|---|---|---|---|
| 1 | T1 会话与追问底座 | 0.5–0.75 人日 | 无 | `conv.py`、`rewrite.py`、`answer.py`/`answer_theme.py`/`server.py`/`config.yaml` 改动、`tests/test_rewrite.py`、`tests/test_conv.py`、`tests/test_server.py` 追加 |
| 2 | T2 前端多轮 | 0.5 人日 | T1 | `web/app.js`、`index.html`、`styles.css` |
| 3 | T3 历史与收藏 | 1 人日 | T2 | 同上（新增 history 面板 + `philo-answers-v1`） |
| 4 | T4 对比模式 | 0.5–1 人日 | 无（可与 T1–T3 并行） | `retrieve.py` 的 `build_compare`、`server.py` 的 `/api/compare`、`tests/test_compare.py`、前端 compare 面板 |
| 5 | T5 连续阅读 | 0.5–1 人日 | 无（与 T1–T4 无耦合） | 前端 read 视图 + `linkTerms` |
| 6 | 文档与版本 | 0.25 人日 | 全部 | `docs/架构设计.md`、`docs/使用说明.md`、`answer.py` 链路图、`pyproject.toml` + `server.py` 版本号 |

**并行建议**：T4、T5 与 T1–T3 无耦合（只碰 `retrieve.py`/`server.py` 的新端点与 `web/` 的新面板），可并行；T2 必须等 T1 的 `meta` 契约定稿。
**每个任务完成后**：更新 `docs/架构设计.md` 对应小节，并在提交信息里写「验收证据」一节（粘贴测试输出）。

---

## 附：新增/变更接口契约汇总

    POST /api/ask           {question, strategy?, focus?, conversation_id?}
                            → {question, backend, strategy, skipped, gate, route_reason,
                               answer, citations, sections, annotations,
                               standalone, is_followup, conversation_id, _cached?}

    POST /api/ask_stream    meta 事件新增：conversation_id / standalone / is_followup

    GET  /api/compare       ?a=<概念>&b=<概念>  → 见 T4(1)

    GET  /api/stats         新增 conversation: {enabled, ttl_sec}

    config.yaml 新增段：
    conversation:
      enabled: true
      ttl_sec: 1800          # 30 分钟无活动即过期（过期后追问降级为普通提问，文案见 R7）
      max_turns: 4           # 单会话保留轮次（改写只需最近 1–2 轮，其余留给显示）
      digest_chars: 300      # 上一轮要点注入上限
      max_conversations: 64

    localStorage 键：
    philo-notes-v1    既有：块级书签与批注（不改结构）
    philo-answers-v1  新增：整条回答历史（T3 结构，引用已瘦身）
    philo-read-pos    新增：阅读位置 {code, scrollTop}

---

## 9. 实施状态（v1.2 · 已按本任务书落地）

| 任务 | 状态 | 关键落点 | 验收证据 |
|---|---|---|---|
| T1 会话与追问底座 | ✅ | 新增 `conv.py`（190 行：Turn / ConversationStore / make_digest / with_prior）、`rewrite.py`（182 行：8 条规则）；`answer.py` 改写前置 + 缓存键 `(standalone, strategy, focus, S/F)` + **流式路径补齐缓存**；`answer_theme.py` 三处 `prior` 参数；`server.py` 的 `conversation_id` / meta 三字段 / `/api/stats` / `/api/compare`；`config.yaml` 的 `conversation` 段 | `tests/test_rewrite.py`(8) + `tests/test_conv.py`(10) + `tests/test_server.py`(+4) 全绿 |
| T2 前端多轮 | ✅ | `state.conv`；`doAsk` 携带 `conversation_id`；meta 落 id（早于 clarify 分支）；`rewriteNoteHTML` 显示「已按上文改写为：…」；`ASK_INTRO_HTML` + 「新对话」+ 提问 chips；done 才追加 chips | 无头 DOM 冒烟 30/30；HTTP 实测两轮追问 `is_followup=true` 且 standalone 继承 |
| T3 历史与收藏 | ✅ | `philo-answers-v1`（与 `philo-notes-v1` 隔离）；引用白名单 `{n,chunk_id,citation,unit,unit_title}`（**不存正文**）；120 条 + 3MB 水位（收藏项最后丢）；历史面板（过滤 / 复原 / ★ / 删除 / JSON+MD 导出）；引用卡无正文时走既有 `/api/context` 回捞 | DOM 冒烟覆盖键隔离、字段白名单、水位裁剪、pinned 最后丢 |
| T4 对比模式（概念版） | ✅ | `retrieve.py` 抽出 `_concept_hit_stats` 等共用助手（`build_concept_card` 32 组新旧深度比对零差异）+ 新增 `build_compare`；`server.py` 的 `/api/compare`（函数体内 import）；前端三栏面板 | `tests/test_compare.py`(6) + 本轮新增的路由级集成断言；HTTP 实测两侧 + 12 条共现 |
| T5 连续阅读 | ✅ | `#v-read` 全宽视图；`linkTerms` 四条替换规则；上下单元按 `state.units` 下标；字号夹紧；滚动位置记忆 | DOM 冒烟 + `/api/unit` 真实 200 块渲染 |
| T6 文档与版本 | ✅ | `docs/架构设计.md`：§8.1 增「第零道：追问改写」、§10.1 模块表增 conv/rewrite、§14 增 P4、§15 增 3 条风险、新增 **§16 会话、历史与阅读体验**；`docs/使用说明.md` 增追问 / 历史 / 对比 / 连续阅读四段；版本号 1.1.0 → **1.2.0**（`pyproject.toml` + `server.py`） | 见下 |

**验收基线（本机实测）**

- `ruff check .` → **All checks passed**（无 noqa）
- `pytest -q` → **190 passed, 7 errors**；7 个 ERROR 全部发生在 pytest 自身的 `tmp_path` fixture（`os.scandir` 对沙箱临时目录 WinError 5），**未进入任何项目代码**，沙箱外跑应为全绿
- HTTP 冒烟（`serve --port 8012`）：`/api/stats` 带 `{enabled:true, ttl_sec:1800}`；`/` 与 `/assets/app.js` 200；首问 `point` + 8 条引用；同 `conversation_id` 追问「继续」→ `skipped=false, is_followup=true` 且 standalone 继承上一轮；「那黑格尔呢」→ 改写为完整问句；陌生 `conversation_id` + 「继续」→ 命中 R7 的「对话已过期…」文案；`/api/compare` 返回两侧 + 12 条共现（`units` 用 `hits` 口径）

**遗留（按 §6 明确不做或二期）**

- T4b 理论家 vs 理论家对比（缺卡片数据源，契约定稿后再做）
- 概念关系图 / 时间线、SQLite、前端框架 / 图表库、LLM 查询改写

**已知环境限制**

- **本沙箱下 `tmp_path` 系列用例必然 ERROR，与被测代码无关。** 证据链：① 报错栈全在 `_pytest/tmpdir.py` → `pathlib.py` 的 `os.scandir`，未进入项目代码；② 改用工作区内 `--basetemp` 仍被拒；③ 先用 shell 建好 `.ptbase` 再跑同样被拒，而**同一个目录 shell 能枚举、python 子进程不能**——说明是沙箱对子进程的目录枚举限制。全量 `pytest -q` 因此表现为 **190 passed / 0 failed / 7 errors**，沙箱外（普通终端）复跑应为全绿。
- 残留空目录 `.basetemp-t4`、`.tmp-pytest-t4`、`.pt`、`.ptbase` 在沙箱内删不掉，已加入 `.gitignore`；沙箱外 `rd /s /q` 即可清掉
