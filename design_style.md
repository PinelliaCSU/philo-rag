# 星图纸页 · 实施规格 v2

> 本文件是「星图纸页」的唯一实现依据。旧版设计与本文冲突时，以本文为准。
> 目标读者：执行重构的工程师 / 编码代理。读完即可开工，不需要再猜产品决策。

## 0. 一句话

个人使用的哲学 RAG 提问系统：桌面浏览器、暗色雾面、无导航、无输入框；星图只由回答命中的概念点亮；答案收束为一张无边界纸页；引用藏在句末极淡圆点里；收藏按需从底部升起。

## 1. 已锁定决策

| 决策 | 结论 | 影响 |
|---|---|---|
| 端 | 只做桌面 Web，不做移动端 | 最小视口 1024×720；不写触屏手势、虚拟键盘适配 |
| 交付形态 | 只保留 Web 服务 | 删除 CLI 子命令与 md/json/jsonl/csv/txt 导出 |
| 前端 | Svelte 5 + Vite + 原生 Canvas 2D | 允许构建步骤；产物进 `philo_rag/web/dist` |
| 状态 | Svelte 5 Runes（`$state/$derived/$effect`） | 不引 React/Vue/SvelteKit |
| 星图 | 自绘 Canvas 2D | 不用 Cosmos / cobe / WebGL |
| 正文 | 自研轻量 Markdown + 占位符后处理 | 不用 TipTap / ProseMirror；可选 marked 级小库 |
| 流式 | `fetch` + `ReadableStream` 消费现有 SSE | 不改事件顺序 `meta → delta… → done` |
| 存储 | Dexie.js / IndexedDB | localStorage 只留一次性标记 |
| 星图布局 | 剪枝共现图 + `spring_layout`（固定 seed） | 星图不做 4×4、不做 26 个流派分区；体系地图的单元网格另算 |
| 点亮 | 只持久化直接命中；一阶邻域临时低亮 | 邻域不写 `litNodes` |
| clarify | 前端自动回退点查询 | 保留「展开为范围查询」文字链，不显示澄清卡 |
| 既有功能 | 低语层六模式（点/引/脉/读/图/对）+ 原地追问 | 术语/引文/体系地图/单元阅读/对比/追问保留；批注与历史列表不做 UI |
| 动效 | 默认开启；`prefers-reduced-motion` 全关 | 动效不阻塞可读性 |

**不做**：移动端、多用户、登录、云同步、服务端历史、理论家 vs 理论家对比、批注编辑 UI、历史列表、欢迎语、教程弹窗、查询类型选择器、常驻导航、右侧引用卡、卡片堆叠、明显阴影、大按钮、常驻星图标签。

## 2. 项目边界与删除清单

### 2.1 保留

- `philo_rag/server.py`：唯一运行时入口，FastAPI + 静态资源 + JSON/SSE API。
- `philo_rag/answer.py`、`answer_theme.py`、`answer_evidence.py`、`answer_prompt.py`、`citations.py`、`conv.py`、`gate.py`、`rewrite.py`、`routing.py`、`parse.py`、`llm.py`、`verify.py`、`retrieve.py`、`theme.py`、`lexicon.py`、`index.py`、`ingest.py`、`prepare.py`、`embed.py`、`rerank.py`、`schema.py`、`text_rules.py`、`lru.py`：检索与生成链路。
- `lexicon/`、`store/`、`data/`、`config.yaml`：数据与配置。
- `tests/`：回归测试（按下文改造）。
- `philo_rag/evaluate.py`：仅作 pytest 的检索基线工具；不提供 CLI `eval`。

### 2.2 删除

| 对象 | 处理 |
|---|---|
| `philo_rag/cli.py` | 删除多子命令入口；先把 `load_config` / `get_lexicon` / `open_store` 迁到 `philo_rag/bootstrap.py` |
| `philo_rag/output.py` | 删除 md/jsonl/csv/txt 渲染与 `write()`；JSON 由 FastAPI 直接序列化 |
| `[project.scripts] philo-rag = "philo_rag.cli:main"` | 改为 `philo_rag.server:main` |
| `philo_rag/web/index.html`、`web/css/*`、`web/js/*` | 整目录删除，替换为 Vite 产物 `web/dist` |
| CLI 相关文档章节 | README / 使用说明 / 架构设计中的 `python -m philo_rag.cli ...` 全部删除 |
| 仅服务 CLI 的脚本 | `scripts/audit_lexicon.py`、`bench_*.py`、`check_*.py`、`diag_*.py`、`discover_terms.py`、`gen_quote_first_api.py`、`gen_taxonomy.py`、`verify_theme.py` 删除；`test_gate.py` 依赖的 `CASES` / `RELEVANCE_CASES` / `combined_gate` 先迁入 `tests/gate_cases.py` |
| `tests/test_glossary.py` | 随 `output.py` 删除；术语表能力不再对外 |
| 旧 localStorage 键 | 不删除；首次启动迁移进 Dexie，迁移完成后保留一版作备份 |

### 2.3 唯一入口

```powershell
python -m philo_rag                      # 默认 127.0.0.1:8000
python -m philo_rag --port 8800 --config config.yaml
```

- `philo_rag/__main__.py` → `server.main()`；`server.main()` 只解析 `--host/--port/--config`，不做子命令。
- `server.py` 的 `_load` / `_default_app` 改为从 `bootstrap` 导入；`_read_web` 与 `/assets` 改为读 `web/dist`（见 2.4）。
- 代码内错误文案统一清理：`index.py` / `retrieve.py` / `server.py` 里的「请先运行 `python -m philo_rag.cli build`」改为「请先运行 `python scripts/build_index.py`」。
- 索引维护保留 `scripts/build_index.py`（内部调用现有 prepare/ingest/index），它不是用户 CLI，不暴露 `ask/term/quote`。
- 若坚持连构建脚本也删除：索引只能随仓库分发，改语料后无法重建；不建议。

### 2.4 静态资源与打包

- Vite `build.outDir = "../philo_rag/web/dist"`，`emptyOutDir: true`，`base: "/"`。
- 开发：`npm run dev`，Vite 代理 `/api` → `http://127.0.0.1:8000`。
- 生产：FastAPI 用 `StaticFiles` 挂 `web/dist/assets`；`/` 返回 `web/dist/index.html`；未知非 `/api` 路径回 `index.html`。
- `starmap.json` 由 `GET /api/starmap` 返回（推荐，便于缓存与词典指纹校验）；也可放 `dist/data/` 走静态资源，二选一。
- 现有 `/assets/{path}` 只放行 `.css/.js` 的逻辑删除；`StaticFiles` 自带路径穿越防护。
- `pyproject.toml` 的 `package-data` 改为：

```toml
philo_rag = ["web/dist/*", "web/dist/assets/*", "web/data/*.json"]
```

若 Vite 产出多层目录，补 `MANIFEST.in` 或把 `assets` 设为单层；用 `python -m build` 验证产物里确实带前端。
- 字体优先用系统字体栈（思源宋体 / Noto Serif SC / Songti SC），避免额外字体资产；如要自带 `.woff2`，确保被打包。

## 3. 信息架构

四层，自下而上：

1. **星图雾面**：全屏背景，预计算概念节点，初始全暗；只是记忆层，不拦截输入。
2. **输入线**：页面中心唯一入口；无边框、无底色、无按钮。
3. **纸页**：回答 / 概念 / 体系地图 / 单元阅读 / 对比共用同一种无边界正文面。
4. **浮层**：引用薄层、星匣、低语层；按需升起，关闭后不留布局。

没有导航、Logo、欢迎标题、侧栏、历史列表、常驻按钮。

## 4. 首屏

- 背景：极深暖灰/冷灰径向渐变，中心略亮、边缘更暗；叠加 1%–2% 极轻噪点（固定 seed，避免刷新变化）。
- 星图：节点亮度 0，不可见；结构线可极低透明度若隐若现，若干扰则全隐。
- 中心：一个极淡呼吸的哲学符号（建议「○」或「·」的变体，不用竖线输入框），像星图中一个未点亮的点。
- 聚焦后右侧出现一行极淡文字：`问一个点，或描述一片范围……`
- 下方一张半透明示例纸片，只出现一次；关闭状态存 localStorage。
- 除此之外什么都没有。

## 5. 输入线

### 5.1 形态

- 透明 `<textarea>`：`border: 0; background: transparent; outline: 0; resize: none;`；基线一条极淡 1px 线，聚焦/输入时微亮。
- 多行自然向下扩展，最大高度约 40vh，超过后内部滚动。
- 文字直接浮在背景上；无占位符、无边框、无按钮、无发送图标。

### 5.2 键盘

| 键 | 行为 |
|---|---|
| `Enter` | 提交（`e.isComposing` 或 `keyCode === 229` 时不提交） |
| `Shift+Enter` | 换行 |
| `Esc` | 优先关闭最上层浮层；无浮层时清空输入；输入已空时回到空白首屏并重置会话 |
| 直接键入 | 空闲时任意可打印字符进入输入线（忽略 Ctrl/Meta/Alt、忽略可编辑元素与选区） |
| `/` | 输入线为空且无浮层时打开低语层；输入线内按 `/` 仍输入字符 |
| `S` | 收藏当前聚焦对象（仅阅读态、非输入态） |
| `F` | 打开星匣（仅非输入态） |
| `Tab` | 输入线 → 纸页 → 引用点 → 星图 → 星匣触发区（视觉隐藏，聚焦时在右下角显示 6px 微星，Enter 打开） |

### 5.3 空闲引导

- 空闲 6 秒无操作：光标呼吸一次，示例纸片微亮一次；仅一次，不循环。
- 有输入、有滚动、有指针移动、有浮层时不触发。
- `prefers-reduced-motion` 下不呼吸、不微亮。

## 6. 示例纸片

- 位置：中心光标下方，半透明，无边框、无阴影。
- 标题极淡：`可以这样开始`
- 两行：
  - `点：康德说的“先验”到底指什么？`
  - `范围：从笛卡尔到胡塞尔，主体性是如何变化的？`
- 文字可点击回填输入线，不显示按钮感；点击后纸片淡出。
- 输入任意字符即淡出；`Esc` 可关闭；关闭标记写 localStorage。
- 只出现一次；首屏之外不再出现。
- 第二行首次显示时可追加一行更淡的提示：`按 / 可以找一个点、一条引文、一个单元。` 只显示一次。

## 7. 意图确认

- 不出现「点查询 / 范围查询」切换按钮、标签、颜色、图标。
- 提交后纸页顶部只显示一行自然语言确认：
  - `按单点查询理解：解释这个概念。`
  - `按范围查询理解：梳理这条脉络。`
- 行尾低对比文字链：`改成范围查询` / `聚焦到一点`。
- 低置信度默认点查询；不弹提示。
- 后端返回 `meta.strategy === "clarify"` 时：
  1. 前端立即用同一问题、`strategy: "point"` 再请求一次；
  2. 成功且有正文（非 gate/skipped、非空答案）则正常显示点查询纸页，意图行为「按单点查询理解」；
  3. 失败、被闸门跳过或资料不足，显示一行：`这个问题较大，按范围查询展开？`，文字链 `展开为范围查询`；
  4. 只回退一次，不循环；不渲染现有澄清卡、不列选项。
- 「聚焦到一点」：范围查询纸页里用户点击任一术语/概念词，触发 `什么是 X？` 点查询；不要用题干硬猜。

## 8. 流式与定型

### 8.1 渲染管线

```text
SSE delta → incoming 缓冲（不触发渲染）
        → 单一 rAF 循环：每帧最多从 incoming 取 2–6 字符 → committed
        → 只重绘「当前未完成 Markdown 块」
        → done：等待 1.2–2s 收束 → 全量 Markdown 渲染一次（权威版）
```

- 不要每个 delta 写一次 `$state`；不要每帧 `innerHTML = md(全文)`。
- 已完成块（标题/段落/列表）只渲染一次；当前块用文本节点 + 新字符 run 的 `<span>` 做淡入。
- 选区、滚动位置在流式期间保持稳定；用户上滚时停止自动跟随。
- 尾迹由独立 Canvas 叠加层绘制，只取写头附近最后 20–30 个字符的 `Range.getBoundingClientRect()`，300–600ms 衰减。
- 字符不位移、不旋转、不放大；尾迹是独立叠加层，不参与排版。长答案必须稳定可读。
- 星图脉冲、尾迹、文字提交共用同一个 rAF 调度；空闲时停止。

### 8.2 视觉参数

| 项 | 值 |
|---|---|
| 字符淡入 | 80–120ms 到可读，起始透明度 0.15–0.25 |
| 字符尾迹 | 极细，300–600ms 消失 |
| 术语命中连线 | 星点 → 文本中的词，约 600ms 后淡出；节点保持低亮 |
| 流结束收束 | 1.2–2s，尾迹向文本行收拢并消失 |
| 正文不透明度 | 定型后 100% |
| 定型底膜 | 一层极淡径向底膜，无边框、无阴影、无大圆角 |
| 正文列宽 | 680–720px |
| 行高 | 1.75 |
| 字体 | 衬线正文（思源宋体 / Noto Serif SC / Songti SC），UI 混排用无衬线 |

### 8.3 术语命中与星图

- 命中来源：回答正文 + `done.annotations`（权威列表）；范围查询额外使用 `theme.anchors.concepts`。
- 匹配规则：只匹配标准名与多字符别名；单字符别名不参与视觉点亮（沿用词典 guard 思路，避免「道」命中「道德」）。
- 点查询：1 个主节点 + 一阶邻域临时低亮；范围查询：最多 8 个锚点 + 沿剪枝边形成极淡星座轨迹。
- 每次回答最多点亮 8 个**直接命中**节点；同一节点 200ms 内只点亮一次；排队而非并发闪烁。
- 直接命中 → 写 `litNodes`（`firstLitAt/lastHitAt/count`），持久。
- 一阶邻域 → 仅本次会话临时低亮，不写库；下一次提问或 20s 后衰减。
- 引用 `citations[].concepts`、引用薄层文字、星匣文字**不点亮**星图。
- 阅读答案或打开引用薄层时，星图整体降亮 30%–50%。

### 8.4 降级

- `prefers-reduced-motion: reduce`：无淡入、无尾迹、无脉冲、无收拢；文字按帧批量出现，直接 100% 不透明度。
- 低性能设备：尾迹层关闭，只保留节点脉冲；星图空闲停止绘制。
- 流中断：保留已提交文字，显示一行 `输出中断。Enter 重试`。

## 9. 纸页

- 无边界、无卡片、无阴影；最大宽度 680–720px；可滚动；底部渐隐而不是硬切。
- 顶部保留：
  - 极淡问题行（当前问题）；
  - 意图确认行；
  - 追问时追加一行更淡的 `承自：<上一问>`（不显示 chips）。
- 正文：Markdown 渲染；标题、段落、列表、强调、行内代码；不渲染表格/HTML。
- 底部：
  - 范围查询显示一条可折叠的极淡「已点亮星座」细线；展开后列出本次点亮的术语，点击打开概念纸页；
  - 引用提示一次性淡入：`句末圆点看来源 · S 收藏 · F 打开星匣`，3 秒淡出，状态存 localStorage；
  - 收藏星标只在纸页角落、悬停/聚焦时出现。
- 输入线为空且空闲时，纸页下方只显示一行极淡 `上次问到这里：……`，点击回填输入线，不自动提交。

### 9.1 纸页类型

五种纸页共用同一排版与底膜，只换内容：

| 纸页 | 内容 | 入口 |
|---|---|---|
| 回答纸页 | 问题行、意图行、正文、引用点、星座线 | 输入线 / 低语层 `脉` |
| 概念纸页 | 术语、别名、定义、出处、单元分布、理论家、相关概念、所属主题、引文；词典未收录时显示 `/api/term` 语义结果；底部文字链 `问这个点` / `展开为范围查询` | 星图节点 / 低语层 `点` / 正文术语 |
| 体系地图纸页 | 4×4 字头 × 位面单元网格（仅单元浏览，不是星图）、卷/单元统计、未归入网格的单元；点单元进入单元纸页 | 低语层 `图` |
| 单元阅读纸页 | 单元元信息、子单元、本单元术语/理论家、按阅读顺序的原文块、`用该单元提问` | 体系地图 / 低语层 `读` |
| 对比纸页 | 定义与归属 / 共享与独有共现 / 两侧引文，三段纵向排列 | 低语层 `对` |

- 体系地图的 4×4 是**单元分类浏览**，与星图的二维语义布局无关；星图不做 4×4。
- 概念纸页不显示卡片边框；每段之间只用一条极淡分隔线或留白。
- 单元阅读纸页保留字号快捷键 `Ctrl+=` / `Ctrl+-` / `Ctrl+0`，滚动位置写 localStorage；不显示字号按钮。
- 所有纸页都可滚到底部，不出现分页按钮；长列表用滚动与纸页内搜索。

- 禁止：欢迎语、教程弹窗、查询类型选择器、彩色标签、输入框、卡片堆叠、明显阴影、大按钮、常驻星图标签、历史侧栏。

## 10. 引用层

### 10.1 句子映射（必须在文本层完成）

1. 保护代码块、行内代码、Markdown 链接；
2. 按 `。！？；` 与段落切句，保留标点；
3. 收集每句内的 `[n]` / `[E0x]`，从正文移除；
4. 句末插入占位符 `⟦cite:1,3⟧`；
5. 走 Markdown 渲染；
6. 把占位符替换为 `<button class="cite-dot" data-cites="1,3" aria-label="来源：…">`。

- 多个引用先去重再聚合为一个点；悬停显示 `3 条来源`。
- 引用标记只出现在段末时，挂到该段最后一句，并标 `data-scope="paragraph"`；薄层标注「本段来源」。
- 流式阶段只为已结束的句子插点，句号后约 200ms 淡入；`done` 后重渲染权威版本。
- 引用点视觉 3–4px，默认不透明度 0.15–0.25；定型后约 0.25；命中区用伪元素扩到 24×24px。
- 悬停 150ms 显示一行极短来源；点击在底部升起引用薄层。
- 薄层内容：作者（若有）、著作、章节/页码、原文片段、语料库定位（`chunk_id` / 字符区间）、可复制引用格式。
- 薄层可钉住；`Esc` 关闭；无边框、无阴影、半透明极淡底膜；打开时星图降亮 30%–50%。
- 引用点必须可 `Tab` 聚焦、`Enter` 展开；`aria-label` 用短来源名。

### 10.2 数据缺口

- `citations_from_groups` 目前没有 `concepts/philosophers`：薄层默认不显示概念标签；需要时先补后端字段。
- `manifest` 没有作者：薄层只显示《哲学大纲》，或后续加 `doc.author`。
- 引用不点亮星图；不要用 `citations[].concepts` 做视觉匹配。

## 11. 星图

### 11.1 数据

- 节点：183 个概念（`lexicon/concepts.yaml`）；边：块级共现。
- 现状：6316 条边、平均度 69；四个轴概念度 172–178。**必须剪枝**，否则一次查询点亮半张图。
- 构建脚本 `scripts/build_starmap.py`：
  1. 读 `store/chunks.jsonl` 的块级 `concepts`（不用 `section_concepts`）；
  2. 计算共现 / PPMI 或余弦；
  3. 排除自环；四个轴概念边权乘 0.3–0.5（或固定在中心）；
  4. 每个节点保留 top-3 强边（度 <3 的补到 1–3 条，保证连通）；
  5. `networkx.spring_layout(G, seed=20261018, weight="weight")` 或 UMAP；归一化到 `[-1,1]`；若不想新增依赖，用 numpy 实现固定 seed 的 Fruchterman–Reingold；
  6. 输出 `philo_rag/web/data/starmap.json`，记录 `lexicon_hashes`、`layout`、`seed`、`generated_at`。
- JSON 契约：

```json
{
  "version": 1,
  "generated_at": "2026-10-18T00:00:00",
  "layout": "spring",
  "seed": 20261018,
  "lexicon_hashes": {"concepts": "…", "philosophers": "…"},
  "nodes": [
    {"id": "大他者", "x": 0.42, "y": -0.18, "hits": 229,
     "school": "精神分析", "era": "20世纪", "aliases": ["…"]}
  ],
  "edges": [
    {"source": "大他者", "target": "客体小a", "weight": 0.73}
  ],
  "axes": ["场域论", "本体论", "认识论", "目的论"]
}
```

- 布局语义：剪枝共现图 + spring/UMAP；**不做 4×4 字头位面，不做 26 个流派分区**；流派/年代只做悬停标签。
- 真实星图只作视觉语言参考（细线、按星等变化的点、无标签）；背景星用固定 seed 程序生成；若使用公开星表，先确认许可证与署名要求，不要直接拷贝受版权保护的星图。
- 前端通过 `GET /api/starmap` 读取；服务端对文件做内存缓存，并按 `mtime` 失效。
- 词典或块注解变化后重跑脚本；`starmap.json` 的 `lexicon_hashes` 与 `store/manifest.json` 不一致时，界面不报错，只在控制台警告。

### 11.2 渲染

- 三层 Canvas：静态背景星 / 星座线 / 节点与脉冲。静态层离屏缓存。
- 节点初始亮度 0；点亮后低亮；直接命中短暂脉冲后停留低亮。
- 节点尺寸按 `sqrt(hits)`，夹在 1.5–5px；轴节点可略大。
- 标签只在悬停/键盘聚焦时显示；不常驻。
- 星图不拦截输入点击：容器 `pointer-events: none`，节点命中用透明热区或 `pointer-events: auto` 的命中层；空白点击聚焦输入线。
- 阅读答案、打开引用薄层、打开星匣时降亮 30%–50%。
- 空闲时停止 rAF；只在状态变化、脉冲、悬停时重绘。

### 11.3 交互与键盘

- 点击**已点亮/已收藏**节点 → 打开概念纸页，并作为一次直接命中持久点亮；临时低亮的邻域也可点击，点击后转为直接命中并持久。
- 未点亮节点不响应点击、不显示标签，避免误触与暴露整张词表；统一走低语层 `点` 搜索。
- 悬停已点亮节点 → 标签 + 一行极淡定义；不改变点亮状态。
- 星图容器 `tabindex="0"`：聚焦后方向键在已点亮节点间移动，`Enter` 打开，`Esc` 离开；不要给 183 个节点各一个 Tab 停靠点。
- 未点亮节点不能通过星图发现 → 用低语层 `点` 模式或概念索引搜索。

## 12. 收藏与星匣

### 12.1 存储

Dexie schema（版本 1）：

```js
db.version(1).stores({
  answers:   'id, createdAt, pinned',
  citations: 'id, chunkId, answerId, pinned, createdAt',
  concepts:  'name, pinned, createdAt',
  favorites: '++id, type, refId, createdAt',
  litNodes:  'name, firstLitAt, lastHitAt',
  meta:      'key'
});
```

- `localStorage` 只留：示例纸片关闭、首次引用提示已显示、上次问题、阅读位置。
- 迁移：首次打开读取 `philo-notes-v1` / `philo-answers-v1` / `philo-read-pos`，写入 Dexie，`meta.migrated = 1`；旧键保留一版后由用户手动清。
- 历史保留上限 200 条；引用只存坐标不存正文；正文按 `chunk_id` 走 `/api/context` 回捞。
- `answers` 记录问题、意图、答案、引用坐标、点亮节点快照、时间；不提供历史列表 UI，只用于星匣/导出/「上次问到这里」。

### 12.2 对象与微星点

- 四类可收藏：问题、回答、引用、概念。
- 微星点 6px，默认不可见；悬停/键盘聚焦出现；收藏后实心低亮，1 秒微光；不弹 toast。
- 对象级位置：问题行右侧、纸页角落、引用薄层右上、概念词/星图节点聚焦时。
- `S` 收藏当前聚焦对象；没有聚焦对象时不动作。
- 引用收藏保存出处、原文片段、所在问题。
- 概念收藏给星图节点加一圈极淡环。
- 回答收藏保存答案与点亮节点快照；重新打开只展示快照，不写入新的点亮。
- 收藏问题只进星匣，不改变「上次问到这里」。

### 12.3 星匣

- `F` 从底部升起；半透明浮层，无边框、无阴影；`Esc` 关闭。
- 分组：问题 / 回答 / 引用 / 概念；可搜索、删除、跳回。
- 不是历史侧栏：不常驻、不占布局、不显示在首屏。
- 底部保留极淡文字链：`导出 JSON（全部回答）` / `导出 Markdown（收藏）`；JSON 含全部 `answers` / `citations` / `litNodes`，不依赖收藏。
- 批注：不做编辑 UI；旧 `note` 字段迁移到 `citations.legacyAnnotation`，只读展示与导出。若未来恢复，放在引用薄层里，用同款无边框输入线。

## 13. 低语层

### 13.1 触发

- 输入线为空、无浮层、纸页或空白聚焦时按 `/`。
- 屏幕中央偏下一条极淡单行输入；下方最多 5 条结果。
- 上下键选择，`Enter` 打开，`Esc` 关闭并回到原焦点；鼠标点击等价。
- 不常驻、不占布局；关闭后完全消失。

### 13.2 模式

| 前缀 | 模式 | 数据源 | 结果 |
|---|---|---|---|
| 默认 | `点` 概念/术语 | `/api/concepts` 本地过滤 → `/api/concept`；无精确命中时 `/api/term` 语义兜底 | 概念纸页；点亮节点及一阶邻域 |
| `引 ` | 引文 | `/api/quote`（说话人 / 概念 / 单元 / 关键词） | 底部引用薄层或引文列表纸页；不点亮星图 |
| `脉 ` | 主题/范围 | `/api/ask`（`strategy: "theme"`） | 范围查询纸页；星座轨迹 |
| `读 ` | 单元 | `/api/units` 本地匹配 + `/api/unit` | 连续阅读纸页 |
| `图 ` | 体系地图 | `/api/units` + `/api/unit` | 4×4 字头 × 位面单元网格；点单元进入单元纸页 |
| `对 ` | 对比 | `/api/compare` | 双星对照纸页；星图两节点连线 |

- `引` 的 token 解析：按缓存的说话人/概念/单元词表识别，优先级为单元编号（形如 `1-2-3`）→ 说话人 → 概念 → 关键词；命中说话人用 `speaker`，命中概念用 `concept`，命中单元编号用 `unit`，剩余文字作为 `keyword`；都未命中时整体作为 `keyword`。不显示筛选控件。
- `点` 只匹配标准名与多字符别名；单字别名不作为低语层查询词，避免「道」命中「道德」。
- `对` 支持 `A ↔ B`、`A vs B`，或两个空白分隔的词；仍无法拆分时，纸页上提示再选一个概念。
- 对比纸页只保留「定义与归属 / 共享与独有共现 / 两侧引文」三段，不做三栏卡片。
- 低语层不替代输入线；输入线仍是最先入口。
- 首次提示只放在示例纸片或首次引用提示里，不弹教程。

## 14. 追问

- 保留现有服务端会话：提交时带 `conversation_id`；前端只存 id。
- 不显示追问 chips；纸页顶部用 `承自：<上一问>` 一行极淡文字表示上下文。
- 追问成功后继续沿用同一 `conversation_id`；`Esc`（输入为空）回到空白首屏并重置会话。
- 单轮「上次问到这里」只回填输入线，不恢复会话。
- 纯延续（继续/详细点）沿用现有 `rewrite.py` 规则；范围查询后的「继续」降级为点查询，行为不变。

## 15. 状态与错误

| 状态 | 表现 |
|---|---|
| 首屏加载 | 星图淡入；无 spinner |
| 星图加载失败 | 底部一行极淡 `知识图谱未能载入`；输入与问答仍可用 |
| 提问中 | 问题行上移；答案区一行 `正在检索……`；1.5s 后 `正在唤醒索引……`；6s 后 `仍在生成……` |
| 流式中 | 文字按 rAF 出现；`aria-busy="true"` |
| 生成失败 | 一行 `这次没有接通。Enter 重试`；保留已生成文字 |
| 空结果 | 一行 `没有找到相关的原文。` + `换个说法，或按 / 找一个点。` |
| 资料不足 | 正常纸页展示「资料不足」文本，不加红色/卡片 |
| 闸门跳过 | 正常纸页 + 一行极淡 `已跳过检索` |
| clarify | 自动回退点查询；仍无答案才显示「展开为范围查询」 |
| 服务离线 | 一行 `服务没有响应。` |

- 不出现红色错误卡、toast、模态教程、澄清选项卡。

## 16. 可及性与动效

- 只做桌面：最小视口 1024×720；不写触屏手势。
- 焦点可见：1px 极淡轮廓；不出现大焦点环。
- 正文对比度 ≥ 4.5:1；引用点默认低对比，但聚焦/悬停时提升，命中区 24×24px。
- `prefers-contrast: more`：引用点、星图标签、输入基线与极淡文字提高一档不透明度。
- `prefers-reduced-motion`：关闭呼吸、淡入、尾迹、脉冲、收拢、微光。
- 流式容器 `aria-busy`；只在段落完成/回答完成时 `aria-live="polite"` 播报，不逐字播报。
- 星图 Canvas `role="application"` + `aria-label`；提供已点亮节点的文字列表作为替代。
- 引用点 `aria-label` 用短来源名；薄层 `role="dialog"` + 焦点圈定 + `Esc` 关闭 + 焦点归还。
- 中文 IME：所有 `Enter` 处理必须判断 `isComposing`。

## 17. 后端契约

### 17.1 保留的接口

| 接口 | 用途 |
|---|---|
| `GET /api/stats` | 索引/模型/会话能力 |
| `GET /api/facets` | 分面统计 |
| `GET /api/units` | 体系目录 |
| `GET /api/unit?code=` | 单元导览/连续阅读 |
| `GET /api/concepts` | 概念全量（低语层本地搜索） |
| `GET /api/concept?term=` | 概念纸页 |
| `GET /api/compare?a=&b=` | 对比纸页 |
| `GET /api/term?term=` | 低语层 `点` 的语义补充 |
| `GET /api/quote?...` | 低语层 `引` |
| `GET /api/context?chunk_id=` | 引用正文回捞 |
| `GET /api/starmap` | 星图节点/边/坐标/别名/指纹 |
| `POST /api/ask` | 非流式回退 |
| `POST /api/ask_stream` | SSE 主路径 |

### 17.2 SSE 契约不变

- 事件顺序仍为 `meta → delta… → done`；错误用 `{"type": "error"}`。
- **不新增** `term` / `citation` / `lit` 事件；前端在文本层做术语匹配与引用点映射。
- `meta` 继续带 `strategy / citations / sections / annotations / theme / conversation_id / standalone / is_followup`。
- `done` 继续带最终 `answer / sections / annotations`。

### 17.3 可选增补

- `theme` meta 增加 `concepts` 聚合（范围查询星座不依赖 `citations[].concepts`）。
- `doc.author`（引用薄层要显示作者时）。
- `citations_from_groups` 补 `concepts/philosophers`（薄层要显示标签时）。
- `route_confidence`（暂不需要；`route_reason` 已够用）。

## 18. 工程结构

```text
philo-rag/
├─ frontend/                 # Svelte 5 + Vite
│  ├─ index.html
│  ├─ vite.config.js         # outDir → ../philo_rag/web/dist；/api 代理
│  ├─ package.json
│  ├─ src/
│  │  ├─ main.js
│  │  ├─ App.svelte
│  │  ├─ lib/
│  │  │  ├─ api.js           # 唯一出网口（fetch + SSE）
│  │  │  ├─ store.svelte.js  # Runes 状态
│  │  │  ├─ db.js            # Dexie schema + 迁移
│  │  │  ├─ markdown.js      # 轻量 Markdown
│  │  │  ├─ citations.js     # 句子映射 + 占位符
│  │  │  ├─ terms.js         # 术语匹配（多字符别名）
│  │  │  ├─ starmap.js       # 布局读取 + Canvas 渲染
│  │  │  └─ motion.js        # rAF 调度 + reduced-motion
│  │  ├─ components/
│  │  │  ├─ StarField.svelte
│  │  │  ├─ InputLine.svelte
│  │  │  ├─ Paper.svelte
│  │  │  ├─ CitationDot.svelte
│  │  │  ├─ CitationSheet.svelte
│  │  │  ├─ StarBox.svelte
│  │  │  ├─ Whisper.svelte
│  │  │  └─ papers/
│  │  │     ├─ AnswerPaper.svelte
│  │  │     ├─ ConceptPaper.svelte
│  │  │     ├─ SystemMapPaper.svelte
│  │  │     ├─ UnitPaper.svelte
│  │  │     └─ ComparePaper.svelte
│  │  └─ styles/
│  ├─ test/                  # Vitest
│  └─ e2e/                   # Playwright（关键路径）
├─ philo_rag/
│  ├─ __main__.py            # → server.main()
│  ├─ bootstrap.py           # load_config / get_lexicon / open_store
│  ├─ server.py
│  ├─ answer*.py / retrieve.py / …
│  └─ web/
│     ├─ dist/               # Vite 产物（提交进仓库）
│     └─ data/starmap.json
├─ scripts/
│  ├─ build_index.py         # 维护脚本（非用户 CLI）
│  └─ build_starmap.py
└─ tests/
```

- `frontend/` 与 Python 包同仓；`npm run build` 产物进 `philo_rag/web/dist`，提交进仓库，保证 `pip install` 后直接可跑。
- 依赖只保留：`svelte@5`、`@sveltejs/vite-plugin-svelte`、`vite`、`dexie`、`vitest`、`jsdom`、`@playwright/test`；不引 UI 组件库、动画库、状态库。
- 不引入 SvelteKit；不用 TypeScript 也可，但建议 `jsconfig` + JSDoc 保证编辑器提示。

## 19. 测试与验收

### 19.1 自动化

- pytest：
  - `conftest.py` 改从 `philo_rag.bootstrap` 导入；
  - `test_server.py` 保留 SSE 顺序断言；新增静态资源/`dist` 回退断言；
  - 新增 `test_starmap.py`：节点数 183、坐标在 `[-1,1]`、边数 ≤ 节点数×3、`lexicon_hashes` 存在；
  - 删除 `test_glossary.py`；`test_gate.py` 的 cases 迁入 `tests/gate_cases.py`。
- Vitest：
  - `citations.test.js`：多引用聚合、段末引用、占位符替换、代码块保护；
  - `terms.test.js`：单字别名不点亮、长别名优先、重叠词；
  - `db.test.js`：旧 localStorage 迁移、裁剪、导出；
  - `starmap.test.js`：剪枝后平均度、连通性、坐标归一。
- Playwright（关键路径）：
  - 首屏只有星图/光标/提示/示例纸片；
  - 输入 → 意图行 → 流式 → 定型 → 句末引用点 → 薄层；
  - `S` 收藏、`F` 星匣、`/` 低语层；
  - `prefers-reduced-motion` 下无动画；
  - 刷新后点亮持久、示例纸片不再出现。

### 19.2 验收清单

- [ ] 首屏无导航、无 Logo、无欢迎标题、无输入框、无按钮、无历史列表。
- [ ] 输入线无边框/底色；Enter 提交；Shift+Enter 换行；Esc 分级关闭；中文 IME Enter 不误提交。
- [ ] 提交后出现自然语言意图行；无查询类型选择器；clarify 自动回退点查询。
- [ ] 流式文字稳定可读；尾迹只在写头；定型后为无边界纸页（680–720px，行高 1.75）。
- [ ] 星图只由回答正文/注解命中的概念点亮；直接命中持久，邻域临时；引用不点亮。
- [ ] 一次回答点亮 ≤ 8 个直接节点；节点 200ms 内不重复闪烁；空闲时停止 rAF。
- [ ] 含引用的句子句末有 3–4px 圆点；多引用聚合；悬停/点击/键盘均可访问；薄层可钉住。
- [ ] 问题、回答、引用、概念四类可收藏；`S` 只作用于聚焦对象；`F` 星匣可搜索/删除/跳回/导出。
- [ ] 术语/引文/体系地图/单元阅读/对比/追问都能通过低语层或原地操作到达；未点亮概念可通过 `点` 搜到。
- [ ] 体系地图仍是 4×4 单元网格（独立纸页），不是星图布局；星图不做 4×4。
- [ ] 单元阅读保留字号快捷键与滚动位置记忆。
- [ ] 加载/错误/空结果/资料不足/闸门跳过都不出现卡片、toast、红色错误块。
- [ ] 刷新后示例纸片不再出现、点亮状态与收藏仍在、上次问题可回填。
- [ ] 旧 `philo-notes-v1` / `philo-answers-v1` 数据可迁移并导出。
- [ ] 无移动端适配；1024×720 以上布局稳定。

### 19.3 风险与缓解

| 风险 | 缓解 |
|---|---|
| 星图过密、一次点亮半张图 | PPMI/余弦剪枝 top-3；轴节点降权；直接命中上限 8；邻域临时 |
| 流式每帧全量重排、选区丢失 | 块级增量渲染 + rAF 批处理 + 定型后全量重渲染一次 |
| 引用标记映射到错误句子 | 文本层占位符 + 单元测试覆盖多引用/段末/代码块 |
| 删除 CLI 破坏 server 与 tests | 先迁 `bootstrap.py`，再删 `cli.py`；`conftest` 同步改导入 |
| Vite 产物未进 wheel | `package-data` + `python -m build` 后解包检查 `web/dist` |
| 旧 localStorage 数据丢失 | 迁移先写 Dexie 再标记；旧键保留一版；导出兜底 |

## 20. 实施顺序

| 阶段 | 内容 | 产出 |
|---|---|---|
| P0 基础 | 迁 `bootstrap.py`；删 CLI/output/旧前端；Vite 脚手架；静态资源/打包；`starmap.json` 管线；Dexie schema | 可 `npm run build` + `python -m philo_rag` 起一个空白新界面 |
| P1 首屏 | 背景/星图静态、输入线、示例纸片、意图行、状态行 | 能提问、能看到流式文字 |
| P2 纸页 | 流式渲染器、定型、术语命中、星图点亮、引用点/薄层 | 完整单轮问答体验 |
| P3 功能 | 低语层、概念/单元/对比纸页、追问、星匣、收藏、迁移/导出 | 既有能力全部归位 |
| P4 收尾 | 可及性、性能、reduced-motion、测试、文档 | 验收清单全绿 |

**文档同步**：README、`docs/使用说明.md`、`docs/架构设计.md` 中的 CLI 章节、多格式导出、`§11.4 为什么不上框架`、`§16.8 不引入框架` 必须一起改写；否则代码删了文档还在教用户敲旧命令。

## 21. 非目标

- 移动端/触屏；多用户/登录/云同步；服务端历史持久化；理论家 vs 理论家对比；批注编辑 UI；历史列表；TipTap/ProseMirror；Cosmos/cobe；EventSource；新增 SSE 事件；SQLite；图表库；LLM 查询改写。
- 星图的 4×4 / 流派分区不做；体系地图的 4×4 单元网格保留为独立纸页，两者不要混为一谈。

## 22. 决策理由（实现时判断用）

- **Svelte 5 而非 React 19**：这个界面的复杂度集中在星图节点状态、流式文字提交、浮层过渡与焦点管理，属于细粒度响应；Runes 足够，编译后无 VDOM 运行时。React 19 只有在需要复用现成 RAG 流式组件时才更合适，本项目不需要。
- **Canvas 2D 而非 Cosmos**：183 < 2000，Canvas 2D 的逐节点脉冲、200ms 节流、邻域临时低亮都可精确控制；Cosmos v2 没有逐节点动画 API，脉冲要重传整个颜色缓冲。
- **不用 cobe.js**：它是 WebGL 地球仪，marker 需要经纬度，交互模型是旋转球体，与二维星图语汇不匹配。
- **不用 TipTap**：答案只读，不需要编辑器文档模型；引用点是纯视图标记，文本层占位符 + DOM 后处理足够，体积和复杂度都更低。
- **Dexie 而非 localStorage**：收藏要按类型/时间查询、按问题关联引用、按 chunk 去重；localStorage 是同步 key-value，5MB 上限且无事务。localStorage 只保留一次性 UI 标记。
- **SSE 用 fetch 而非 EventSource**：`EventSource` 只能 GET，无法携带 POST body 的 `conversation_id` 与 `strategy`。
- **剪枝而非全图**：当前 6316 条边、平均度 69，四轴节点度 172–178；全图会变成毛线球，且“单节点 + 一阶邻域”会点亮 70 个节点。
- **星图不做 4×4 / 流派分区**：183 个概念平均落在 6.8 个 4×4 单元里，只有 78 个概念有 ≥50% 的主导单元；26 个流派中最大 29、最小 1，还有 9 个单例。分区会制造大量空区与错位，spring/UMAP 更稳。体系地图的 4×4 只服务单元浏览，不承担概念布局。
- **只持久化直接命中**：邻域是解释性的临时光晕，持久化会让几次提问后整张图全亮，失去“记忆层”的克制。

## 23. 开工指令（可直接作为下一步提示词）

按以下顺序执行，先做完 P0 再动 UI：

1. 新建 `philo_rag/bootstrap.py`，迁出 `load_config` / `get_lexicon` / `open_store`；改 `server.py`、`tests/conftest.py`、`tests/gate_cases.py` 的导入。
2. 删除 `philo_rag/cli.py`、`philo_rag/output.py`、`tests/test_glossary.py` 与仅服务 CLI 的 `scripts/*`；新增 `philo_rag/__main__.py` 与 `server.main()`；更新 `pyproject.toml` 入口、`package-data` 与代码内错误文案。
3. 建 `frontend/`（Svelte 5 + Vite），`outDir` 指向 `philo_rag/web/dist`；FastAPI 改为 `StaticFiles` + SPA 回退；`npm run build` 能产出并被打包。
4. 写 `scripts/build_starmap.py`，生成 `philo_rag/web/data/starmap.json`；新增 `GET /api/starmap`；用 pytest 锁定 183 节点、坐标范围、边数上限、词典指纹。
5. 按 §4–§11 实现首屏、输入线、纸页、引用层；按 §12–§14 实现收藏、低语层、追问。
6. 每完成一块，跑 `python -m pytest` 与 `npm run test`；最后逐条跑 §19.2 验收清单。

硬约束：

- 不新增 SSE 事件；不改 `meta → delta → done` 顺序。
- 不引 React / TipTap / Cosmos / EventSource。
- 不恢复导航、侧栏、输入框、卡片、右侧引用卡、历史列表、查询类型选择器。
- 所有「极淡」元素都要有可聚焦、可读的对比度兜底。
- 旧 localStorage 只迁移、不删除。
- 先让服务端与测试在新入口下全绿，再开始视觉实现；不要同时改后端契约与前端渲染。
