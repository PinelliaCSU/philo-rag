# 项目长期记忆 · philo-rag

## 检索架构约定（v1.1 起，重要）

- **溯源问答（`answer()`）固定整篇全文检索，不接受元数据筛选。**
  原因：概念的定义句常出现在前言/总纲/其他单元，与块级元数据标注不同处；
  先按单元/概念筛选会缩小候选池并把定义块排除，导致内容被截断。
  → 改问答链路时不要重新引入 `filter_ids` / `filters`；筛选只服务浏览式入口
  （`term_lookup` / `quote_search` / `facet_summary`）。
  `hybrid_search` 的 `filters` 参数保留但问答不使用。
- **问答结果不再包含 `filters` 字段**；新增 `skipped` 与 `gate` 字段。

## 问题闸门（`philo_rag/gate.py`）

- 位置：检索之前。不通过 → 返回 `{skipped:true, backend:"gate", answer:提示, citations:[]}`，不触发检索。
- 拦截类别：social / meta / fragment / too_short / off_topic / no_anchor。
- 放行判据（任一命中）：词典概念或理论家、数值单元编号、哲学域词（`DOMAIN_TERMS`）、提问句式（`RE_ASK`）。
- 设计原则：**宁可放行模糊问题，也绝不误杀真正的哲学提问**。
  非 strict 档下词典未收录的术语一律放行；`gate.strict: true` 才要求必须有锚点。
- 配置段 `gate`：enabled / min_chars(4) / strict(false) / hint。CLI：`ask --no-gate`。
- 巡检：`python scripts/check_gate.py`（26 条正负用例）。扩拦截模式或改词典后必须重跑。

## 项目惯例

- 词典（`lexicon/*.yaml`）是精度的来源；改动词典后需重建索引。闸门/检索参数改动**不需**重建。
- 评测基线：Hit@1=85.71% / Hit@3=100% / MRR=0.9286（top_k=8，6630 块 / 512 维 / bge-small-zh-v1.5）。
- 新增巡检类脚本放在 `scripts/`，风格对齐 `check_speaker.py`（ROOT 注入 sys.path、argparse、中文 docstring）。
- 文档：README 讲用法与流程，`docs/架构设计.md` 讲设计与取舍，`docs/使用说明.md` 讲运维排障；改功能三处都要同步。
- Windows 环境；虚拟环境 `.venv`，用 `.venv/Scripts/python.exe` 运行；控制台已强制 UTF-8。
