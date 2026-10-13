# 哲学大纲 · 知识库（Philo-RAG）

把《哲学大纲》（四卷合一，约 200 万字）做成一个**可检索、可溯源、可问答**的  
本地知识库。全部产物都在本机，不需要联网、不需要 API Key 就能跑通完整链路。

四个使用入口，各自解决一类问题：

| 入口            | 回答什么问题                 | 机制                           |
| ------------- | ---------------------- | ---------------------------- |
| **引用溯源问答**    | 「什么是字头？」「大他者怎么理解？」     | 问题闸门 → 全文向量 + BM25 混合检索 → 生成，每个论断回跳原文 |
| **专题提炼**      | 「马克思在书里是什么位置？」「精神分析怎么被处理的？」 | 高召回该主题全部相关块 → 按数值单元聚合 → 分节成文 |
| **术语索引与语义检索** | 「场域论」「客体小a」是什么意思、在哪儿出现 | 概念词典精确命中 + 语义检索兜底            |
| **分面 / 体系浏览** | 按卷、单元、理论家和概念浏览知识库 | 统计卡片、层级单元卡片与问答联动 |

> **点查询与范围查询是两条链路（v1.2 起）**
>
> 「引用溯源问答」是**点查询**：优化「单条结果准不准」，`final_top_k = 8`，回答「这句话出自哪里」。
> 「专题提炼」是**范围查询**：优化「该主题覆盖全不全、组织得有没有结构」，召回数百块并按单元聚合，
> 回答「全书如何论述某主题」。
>
> 两者**不可能靠调参互相转换**——差距在召回量、组织维度、上下文预算、提示词长度约束四个环节上
> 系统性存在。诊断过程与实测数据见 [`docs/检索问答与专题提炼的差距诊断.md`](docs/检索问答与专题提炼的差距诊断.md)。

> **两条前置约定（v1.1 起）**
>
> 1. **问答固定全文检索**：溯源回答不再接受单元 / 概念 / 理论家等筛选条件，直接对整篇语料召回。
>    原因是筛选会先缩小候选池，而「概念的定义句」常常不在被筛中的单元里（例如「字头」的定义
>    在前言总纲、「存在者整体」的定义在第 1 卷），一筛就把答案截断了。
>    需要按维度浏览，请走「术语检索」与「分面 / 体系」两个入口。
> 2. **问题先过闸门**：不适合检索的问题（寒暄、问系统自身、实时信息、无主题的碎片追问…）
>    在检索之前就被跳过，不再空跑一遍检索与生成。见 §十二。


---

## 一、快速开始

```bash
cd philo-rag

# 1) 建虚拟环境并装依赖
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2) 一键跑通：采集语料 → 建索引 → 问答与术语自检
python -m philo_rag.cli demo

# 3) 起 Web 界面
python -m philo_rag.cli serve
# 浏览器打开 http://127.0.0.1:8000
```

默认使用项目内自带的 `models/bge-base-zh-v1.5`（中文语义向量，768 维，约 390 MB）与  
`data/哲学大纲_规范化_全集.txt`（已清洗语料），**离线即可运行**。

> 首次 `build` 需要给 6000 多个知识块做向量化，CPU 上约 3–6 分钟，之后查询是毫秒级。

---

## 二、分步运行

```bash
# ① 采集与清洗：读原始 PDF，产出规范化语料
python -m philo_rag.cli prepare
#   → data/哲学大纲_规范化_全集.txt

# ② 构建索引
python -m philo_rag.cli build
#   → store/{chunks.jsonl, vectors.npy, terms.json, manifest.json}

# ③ 看索引概览
python -m philo_rag.cli stats
```

> **想先验证链路、不想等 3 分钟？** 把 `config.yaml` 的 `doc.source` 临时指向  
> `data/sample_哲学史纲要.txt`（1.3 万字的演示语料，39 块 / 15 引文块），  
> `build` 几秒就能跑完，三类检索都能通。验证完改回全集路径重建即可。

---

## 三、命令一览

| 命令          | 用途                | 常用参数                                                                                                    |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `prepare`   | 采集 + 清洗原始语料       | —                                                                                                       |
| `build`     | 构建索引              | —                                                                                                       |
| `stats`     | 索引概览与体系结构         | —                                                                                                       |
| `ask "问题"`  | 引用溯源问答（点查询）      | `--no-gate` `--format json` `--out x.md`                                                                  |
| `theme "主题"` | 专题提炼（范围查询，按单元聚合） | `--format json` `--out x.md`                                                                             |
| `term "术语"` | 术语卡 + 精确命中 + 语义补充 | `--limit 8` `--format csv`                                                                              |
| `facets`    | 分面统计（筛选维度）        | `--format json`                                                                                         |
| `eval`      | 检索质量回归评测          | `--top-k 8` `--golden my.json`                                                                          |
| `serve`     | 启动 Web 服务         | `--host` `--port` `--reload`                                                                            |
| `demo`      | 一键自检              | `--rebuild`                                                                                             |

### 例子

```bash
# 溯源问答（对整篇语料全文检索，附引用）
python -m philo_rag.cli ask "谢林和黑格尔的分歧在哪？"

# 关闭问题闸门，强制把问题送进检索（调试用）
python -m philo_rag.cli ask "随便问问" --no-gate

# 专题提炼（主题聚合检索 + 分节成文）
python -m philo_rag.cli theme "马克思"
python -m philo_rag.cli theme "精神分析"           # 词典未收录 → 种子模式自动锚定
python -m philo_rag.cli theme "辩证法" --out outputs/专题_辩证法.md

# 导出为 Markdown / JSON / CSV
python -m philo_rag.cli ask "什么是存在者整体？" --format md --out out/存在者整体.md
python -m philo_rag.cli term "客体小a" --format json

# 浏览分面与体系统计
python -m philo_rag.cli facets
```

---

## 四、配置（`config.yaml`）

六段全部可调，改完直接重跑 `build` 即可：

```yaml
doc:                          # 1. 数据加载
  raw: ../哲学大纲_规范化_全集.pdf   # 采集入口（原始语料）
  source: data/哲学大纲_规范化_全集.txt  # 索引入口（清洗产物）
  store_dir: store
  strip_annotations: false    # 是否剔除【释：】【按：】【补：】
  skip_front_matter: false    # false 则保留前言（含「字头」等关键定义）

lexicon:                      # 2. 词典（决定元数据抽取质量）
  philosophers: lexicon/philosophers.yaml
  concepts: lexicon/concepts.yaml
  taxonomy: lexicon/哲学大纲_体系.yaml

chunk:                        # 3. 分块
  max_chars: 480
  min_chars: 140
  overlap_chars: 120
  split_quotes: true          # 引文单独成块
  quote_min_chars: 12         # ASCII 直引号成对抽取的最小长度
  quote_min_chars_reliable: 6 # 「」/“” 可靠标记的最小长度
  enrich_embed_text: true     # 向量输入 = 章节路径 + 元数据标签 + 正文

embedding:                    # 4. 向量化
  backend: sentence_transformer   # sentence_transformer | hashing | api
  model: models/bge-base-zh-v1.5
  device: cpu

retrieval:                    # 5. 检索
  dense_top_k: 40
  sparse_top_k: 40
  fusion: rrf
  entity_boost: 0.004
  definition_boost: 0.02
  final_top_k: 8
  expand_query: true
  rerank: true
  rerank_model: models/bge-reranker-v2-m3
  rerank_top_k: 12
  rerank_max_chars: 256

answer:                       # 6. 生成（问答固定全文检索，不接受筛选条件）
  backend: template           # template | ollama | api
  model: qwen2.5:7b
  max_context_chunks: 8
  max_answer_chars: 700       # 点查询：短，定位一句出处
  theme_min_chars: 1500       # 范围查询：长，写一份专题
  theme_max_chars: 4000

theme:                        # 6c. 专题提炼（范围查询，与点式问答并列的另一条链路）
  seed_top_k: 60              # 未登录主题：种子检索条数（用于反推锚点）
  semantic_top_k: 40          # 语义补充条数（直接命中之外的「结构层」关联块）
  group_gap: 3                # 块序差 ≤ 此值视为连续，合并为一个段落群
  max_units: 12               # 参与组装的单元数上限（按命中数排序）
  groups_per_unit: 3          # 每个单元取几个段落群
  max_group_chars: 1500       # 单个段落群进入上下文的字符上限
  context_budget: 24000       # 上下文总字符预算（喂给 LLM）
  core_units: 6               # 离线后端：详写的核心单元数
  extended_units: 6           # 离线后端：简述的衍生单元数
  answer_chars_per_unit: 340  # 离线后端：每个核心单元的主题句群字符上限

gate:                         # 6b. 问题闸门（检索前置过滤）
  enabled: true               # false 则所有问题都进入检索
  min_chars: 4                # 归一化后短于此长度、且无锚点无实词时判为退化输入
  strict: false               # true 时「无词典/体系锚点」的问题一律拦截

output:                       # 7. 结果输出
  format: md                  # md | json | jsonl | csv | txt
  dir: outputs
  show_citations: true
```

---

## 五、Web 服务

```bash
python -m philo_rag.cli serve --host 127.0.0.1 --port 8000
```

内置单页界面（无前端构建步骤），四个页签对应问答、专题提炼、术语检索和体系浏览：

| 接口                                      | 说明                                           |
| --------------------------------------- | -------------------------------------------- |
| `GET /api/stats`                        | 索引概览                                         |
| `GET /api/facets`                       | 分面统计（理论家、概念、年代、流派）                       |
| `GET /api/units`                        | 体系目录（338 单元）                                 |
| `GET /api/concepts`                     | 概念词典列表                                       |
| `POST /api/ask`                         | 问答，body：`{"question": "..."}`（全文检索，无筛选字段）    |
| `GET /api/theme?topic=马克思`               | 专题提炼（主题聚合检索 + 分节成文）                          |
| `GET /api/term?term=大他者`                | 术语检索                                         |
| `GET /api/context?chunk_id=...`         | 取某块及上下文（跳转原文）                                |

---

## 六、接上大模型（可选）

默认 `answer.backend: template` 是**离线抽取式**——不调用任何模型，直接从检索结果中筛选并分组原文要点。
适合快速检索、自检和模型不可用时的降级。它不会真正重写哲学论证，因此复杂问题的逻辑综合能力有限。

如果希望回答具备“核心定义—形成机制—理论张力—体系位置”的连贯论述，建议只让本地模型负责最后一步组织，
而不是让模型重新学习整个语料库。查询时送入模型的仍是少量已检索证据，速度和可控性都明显好于每次重新提取主题。

想用真正的生成式回答，二选一：

```yaml
# A. 本地 Ollama（数据不出本机）
answer:
  backend: ollama
  model: qwen2.5:7b
  ollama_base: http://localhost:11434
```



```yaml
# B. 任意 OpenAI 兼容接口
answer:
  backend: api
  model: qwen-plus
  api_base: https://dashscope.aliyuncs.com/compatible-mode/v1
  api_key: sk-xxx
```

三种后端返回结构完全一致，切换只改 `config.yaml` 一行。

---

## 七、换更强的嵌入模型（可选）

默认的 `bge-base-zh-v1.5`（768 维）已经够用。追求极致效果可再上 `bge-large-zh-v1.5`（1024 维）
或 `bge-m3`（1024 维、8192 长文本），下载与配置方式相同：

```bash
python -c "
from huggingface_hub import snapshot_download
snapshot_download('BAAI/bge-large-zh-v1.5', local_dir='models/bge-large-zh-v1.5')"
```

> 直连 huggingface.co 不通时，可先 `export HF_ENDPOINT=https://hf-mirror.com` 走镜像；
> 若镜像报「Distant resource does not seem to be on huggingface.co」，说明本地
> huggingface_hub 版本与镜像的 HEAD 元数据不兼容，改回直连或升级/降级 huggingface_hub。

```yaml
embedding:
  model: models/bge-large-zh-v1.5   # 1024 维，效果更强、更慢
```

换模型后**必须全量重建索引**（向量空间变了）；检索层会校验模型维度与索引是否一致，
不一致时给出明确报错而不是静默算错。

### 7.1 cross-encoder 重排

默认已开启（`retrieval.rerank: true`），使用本地 `models/bge-reranker-v2-m3`。
离线部署必须先下载该模型，否则会自动退回融合结果：

```bash
python -c "
from huggingface_hub import snapshot_download
snapshot_download('BAAI/bge-reranker-v2-m3', local_dir='models/bge-reranker-v2-m3')"
```

```yaml
retrieval:
  rerank: true
  rerank_model: models/bge-reranker-v2-m3    # 本地路径；有网环境也可填 BAAI/bge-reranker-v2-m3
  rerank_top_k: 12                           # 只重排前 N 个候选（> final_top_k），调小可降延迟
  rerank_max_chars: 256                      # 每个候选只喂前 N 个字符（0 = 不截断）
```

重排会提升排序精度、增加延迟。**每次提问的耗时几乎全在这一步**，所以做了三件事：

* 重排实例与嵌入模型都在**服务启动时预热加载一次**并常驻进程缓存，提问时不会重新加载模型；
* 只对前 `rerank_top_k` 个融合候选打分（其余保持原序接在末尾），而不是全部候选；
* 每个候选只把前 `rerank_max_chars` 个字符喂给重排器，并把「问题 + 候选块 → 分数」
  记进 LRU，同一个问题重复提问直接命中缓存。

CPU 上 `bge-reranker-v2-m3` 约 0.3~0.6 秒/候选（随文本长度增长），因此
`16 个候选 × 整块文本` 的每次提问要 10 秒以上。默认值（12 个候选 × 前 256 字符）
在 28 条标注问题上的实测结果：

| 配置 | Hit@1 | Hit@3 | Hit@8 | MRR | 每次提问 |
|---|---|---|---|---|---|
| 16 候选 · 整块（旧默认） | 0.929 | 1.000 | 1.000 | 0.958 | 11.1 s |
| 12 候选 · 前 256 字符（新默认） | 0.964 | 1.000 | 1.000 | 0.982 | 4.6 s |
| 12 候选 · 前 256 字符（同一个问题再问一次） | — | — | — | — | 0.1 s |

`python -m philo_rag.cli eval` 复现：质量持平略升（差异在 ±1 题的噪声内），延迟降到约 1/2.4，
重复提问近即时（命中重排缓存）。候选窗口别小于 `final_top_k`：实测 8 候选会让 Hit@3 掉到 0.964。
模型目录缺失时只告警一次并退回融合结果，不会反复触发联网下载。想关掉改 `rerank: false` 即可。

---

## 八、数据管线：采集与清洗

`prepare` 做的事（实现见 `philo_rag/prepare.py`，输入口径只在这一个文件里定义）：

1. **抽页** — PDF 逐页抽取，保留**打印页码**（引用要能定位到页）
2. **去页眉** — 删掉每页重复的「《哲学大纲》规范化文本（全集） · 第 N 页」
3. **段落重排** — PDF 会把自然段硬折成多行；按「上一行是否以句末标点收尾」把折行接回去，  
   并处理三类边界情况：跨页长句、跨行注解 `【释：…】`、引号内感叹号后接逗号续写
4. **结构标注** — 把「第 N 卷」「1-1-1 物理主义」转成 Markdown 标题，供摄取层复用通用标题解析
5. **归一化** — 全角空格、零宽字符、多余空行

实测产出：**1183 页 / 4 卷 / 338 个数值单元 / 约 201 万字**，段落起始异常 0 处，  
338 个单元标题全部识别（含跨行标题）。

换成自己的文本：把 `doc.raw` 指向新文件，重跑 `prepare` + `build` 即可。

---

## 九、词典维护（检索精度的来源）

`lexicon/` 下三份纯人工可维护的 YAML：

| 文件                  | 内容                       | 作用                        |
| ------------------- | ------------------------ | ------------------------- |
| `philosophers.yaml` | 154 位理论家：别名、生卒年、年代、流派    | 别名归一、年代/流派过滤、实体加权、引文说话人识别 |
| `concepts.yaml`     | 105 个概念：别名、归属、定义         | 术语卡、查询扩展、概念过滤             |
| `哲学大纲_体系.yaml`      | 字头 / 四层 / 四话语 / 338 单元目录 | 按字头与数值单元过滤、体系浏览           |

> `哲学大纲_体系.yaml` 的单元目录由 `python scripts/gen_taxonomy.py` 从语料自动生成，勿手改。
>
> 理论家表按语料实际提及频次维护。补录时注意**歧义别名**：例如「莫斯」在本书里几乎  
> 只出现在「莫斯科」中，收作 Marcel Mauss 的别名会制造大量误匹配；而「维纳」是  
> 「列维纳斯」的子串，靠「长别名优先 + 区间占用」的匹配规则才不会误命中。

**扩充词典是性价比最高的优化**：元数据覆盖率上升 → 实体加权生效 → 精确检索变准。

### 引文与说话人归因

引文块有两个理论家字段，**语义不同，不要混用**：

- `philosophers`（**过滤**维度）＝ 说话人 + 引文正文提到的人 + 所在正文块的上下文人物。  
  实测覆盖率 47%，用于「按理论家检索引文」这类浏览式检索。
- `speaker`（**精确**字段）＝ 只有「人名紧邻引文、且同一句内出现引述标记（说/指出/所谓/…）」  
  才赋值。实测覆盖率仅 2%，但**宁可置空也不误配**——语料中绝大多数引文是举例、假想对话  
  或整理者旁述，本身没有归属。

归因规则刻意排除了三类典型误配（实现见 `philo_rag/ingest.py: find_speaker`）：

| 误配情形      | 例子                          | 排除手段                    |
| --------- | --------------------------- | ----------------------- |
| 跨句的语境提及   | 「……社会事实。例如某人说"…"」           | 人名与引文之间不得有句末标点          |
| 学说名而非本人   | 「把黑格尔**主义**说成这样"…"」         | 人名后接 主义/学派/哲学/思想 时不算说话人 |
| 普通词冒充引述动词 | 「后观**念**论的"…"」「把黑格尔**说成**…」 | 单字动词只保留 说/讲；后缀句式的动词必须收尾 |

巡检命令：

```bash
python scripts/check_speaker.py -n 20     # 覆盖率统计 + 抽样人工核对
python scripts/check_speaker.py --all     # 打印全部归因结果
```

---

## 十、评测与迭代

```bash
python -m philo_rag.cli eval          # 28 条标注问题，Hit@k / MRR
```

当前基线（top_k=8）：

| 指标    | 值       |
| ----- | ------- |
| Hit@1 | 85.71%  |
| Hit@3 | 100.00% |
| Hit@8 | 100.00% |
| MRR   | 0.9286  |

标注方式用「必须命中的关键词」而非 `chunk_id`，这样调整分块粒度后标注不会失效。  
自定义标注集：

```bash
python -m philo_rag.cli eval --golden my_golden.json --format json
```

迭代顺序（按性价比）：

1. **扩充词典** → 元数据覆盖率上升，实体加权生效
2. **换语义嵌入** → 开放语义问题召回上升
3. **加 cross-encoder 重排**（`retrieval.rerank: true`）→ 排序精度上升，延迟 +50~200 ms
4. **调分块粒度** → 边际收益递减，放最后

---

## 十一、目录结构

```
philo-rag/
├── config.yaml                 全部可调参数
├── requirements.txt
├── README.md                   本文件
├── docs/架构设计.md             技术选型与设计取舍
├── docs/使用说明.md             分步操作与故障排查
├── data/                       语料（prepare 的产物）
├── lexicon/                    词典（理论家 / 概念 / 体系目录）
├── models/                     离线模型（随项目分发）
│   ├── bge-base-zh-v1.5/       嵌入模型（768 维）
│   └── bge-reranker-v2-m3/     重排模型（可选，retrieval.rerank 开启时用）
├── store/                      索引产物（chunks / vectors / terms / manifest）
├── outputs/                    检索与问答的导出结果
├── scripts/
│   ├── gen_taxonomy.py         从语料生成体系目录
│   ├── check_speaker.py        引文说话人归因巡检
│   ├── check_gate.py           问题闸门巡检（放行 / 拦截用例）
│   ├── diag_theme.py           主题集中度诊断（top-k 分散度 vs 语料真实分布）
│   └── diag_compare.py         点式问答 vs 专题综合的指标对比
└── philo_rag/                  Python 包
    ├── prepare.py   采集与清洗（L0）
    ├── ingest.py    解析 → 结构识别 → 分块 → 元数据抽取（L1）
    ├── embed.py     嵌入后端（sentence_transformer / hashing / api）
    ├── index.py     向量索引 + BM25 + 元数据倒排（L2）
    ├── retrieve.py  混合检索 / 术语检索 / 分面统计（点查询）
    ├── theme.py     专题综合：三层召回 + 单元聚合 + 段落群恢复（范围查询）
    ├── gate.py      问题闸门：判断问题是否值得进入检索
    ├── answer.py    引用溯源问答（L3）+ 专题提炼生成
    ├── output.py    结果渲染（md / json / jsonl / csv / txt）
    ├── evaluate.py  检索质量评测（L4）
    ├── server.py    FastAPI 服务 + 内置界面
    └── cli.py       命令行入口
```

---

## 十二、检索前置：问题闸门与全文检索

问答链路在 v1.1 加了两处前置约定，都直接服务于「更准」，且都不需要重建索引。

### 12.1 全文检索：不再让筛选截断概念

早期版本的问答允许 `--unit` / `--concept` / `--philosopher` 先缩小候选池再检索。
实测发现这会把正确答案挡在池外——**概念的定义句往往不在被筛中的单元里**：

| 问题 | 筛选条件 | 结果 |
| --- | --- | --- |
| 什么是字头？ | `--unit 1-1` | 「字头」的定义在**前言 · 体例与体系总纲**，不在 1-1 → 被排除 |
| 存在者整体是什么意思？ | `--unit 2-1` | 定义在**第 1 卷 / 1 实在论** → 被排除 |
| 什么是大他者？ | `--philosopher 拉康` | 定义段的元数据未标拉康 → 被排除 |

现在问答**固定整篇检索**：`hybrid_search` 不再收到 `filters`，候选池就是全部 6630 块；
筛选只保留给浏览式检索（`term` / `quote` / `facets`）。返回结构里也不再出现 `filters` 字段。

### 12.2 问题闸门：不适合检索的问题不进检索

新增 `philo_rag/gate.py`，在链路最前端裁决「该不该检索」：

```
问题 ─▶ 闸门 ──不通过──▶ 直接返回 skipped（0 次检索、0 次生成）
          │通过
          ▼
      全文混合检索 → 证据筛选 → 生成
```

| 类别 | 判据 | 例子 |
| --- | --- | --- |
| `social` | 整句只是礼貌用语 | 你好 / 谢谢 / ok |
| `meta` | 询问系统自身或用法 | 你是谁 / 这个知识库怎么用 |
| `fragment` | 无上下文的碎片追问 | 继续 / 然后呢 / 详细点 |
| `too_short` | 去掉问句词后没有实词 | 什么是 / ? |
| `off_topic` | 实时信息或通用任务 | 今天天气 / 股票 / 写一首诗 |
| `no_anchor` | 无锚点且无实词（`strict` 档下凡无锚点即拦） | — |
| `irrelevant` | 无锚点且与语料语义相似度过低（语义相关性兜底） | 红烧肉怎么做 / 阿巴阿巴 |

**放行判据**（任一命中即放行）：命中词典概念/理论家、命中数值单元编号、命中哲学域词、命中提问句式。
取舍是**宁可放行模糊问题，也绝不误杀真正的哲学提问**——所以「阿赖耶识」这类词典未收录的术语
照样放行、交给检索兜底，只有明显不属于知识库的输入才被拦。

硬编码的拦截模式覆盖不了所有垃圾输入，所以闸门还有**第二层语义相关性兜底**：
规则闸门放行、但**没有锚点**的问题，会再算一次「查询与整部语料的最高余弦相似度」，
低于 `gate.relevance_threshold`（默认 0.50）即判 `irrelevant` 跳过——「红烧肉怎么做」
「阿巴阿巴」这类与本书无关、又不在任何拦截语料里的输入，由此被挡在检索之外。
有锚点的问题一律不经过这层（锚点已证明它指向本书内容），词典里相似度偏低的人名等
短词不会被误伤。该层只对语义向量后端生效，`hashing` 后端自动放行。

巡检：

```bash
python scripts/check_gate.py             # 26 条正负用例
python scripts/check_gate.py "你的问题"   # 单条裁决
python scripts/check_gate.py --relevance # 追加语义相关性用例（40 条，需已建索引）
```

闸门可整体关闭（`gate.enabled: false`，或命令行 `ask "…" --no-gate`），用于对比检索质量。

---

## 十三、专题提炼（范围查询）

`ask` 是**点查询**，`theme` 是**范围查询**。前者回答「这句话出自哪里」（top-8、895 字），
后者回答「全书如何论述某主题」（召回数百块、按单元聚合、4000 字以上结构化专题）。

### 13.1 链路

```
主题词 ─▶ ① 主题锚定（词典归一为 理论家 / 概念 / 单元）
              │ 未登录 → 种子模式：先检索，再从种子块共现元数据反推锚点
              ▼
         ② 三层召回   meta（元数据命中）→ literal（正文出现主题词）→ semantic（向量近似）
              ▼
         ③ 单元聚合   按最细数值单元分桶 → 桶内合并相邻块为「段落群」
              ▼
         ④ 结构化上下文  带单元编号 / 标题 / 卷名，预算 24000 字
              ▼
         ⑤ 生成   离线：分节证据群；LLM：THEME_PROMPT（四节专题）
```

### 13.2 与点查询的差别（实测）

| 主题 | `ask` 召回 | `theme` 召回 | `ask` 覆盖单元 | `theme` 覆盖单元 | `ask` 输出 | `theme` 输出 |
| --- | --- | --- | --- | --- | --- | --- |
| 马克思 | 20 | **263** | 13 | **77** | 895 字 | 4270 字 |
| 黑格尔 | 20 | **517** | 12 | **109** | — | 4401 字 |
| 精神分析 | 20 | **162** | 10 | **55** | — | 4099 字 |
| 辩证法 | 20 | **969** | 14 | **170** | — | 4784 字 |

关键修复点：

1. **召回量**：从 top-8 提升到「全部直接命中块」。这是主题集中度的根本来源。
2. **单块信息利用率**：点查询每块只取 1 句（29%），专题取整段段落群（≈100%）。
3. **组织维度**：点查询按分数散点排列（8 块里仅 4–6 块相邻），专题按单元聚合。
4. **上下文结构**：点查询只拼正文，专题带单元编号/标题/卷名，生成器能看到体系结构。
5. **提示词**：点查询限 700 字、3–5 段；专题限 1500–4000 字、固定四节。
6. **谱系**：专题额外统计「共现理论家频次」与「年代分布」——
   实测马克思：黑格尔 66、列宁 40、谢林 30、恩格斯 30、阿尔都塞 29；
   拉康：黑格尔 49、齐泽克 39、巴迪欧 29。

### 13.3 未登录主题怎么办

词典只覆盖「理论家」与「概念」两层，像**精神分析**这样的思潮级词并不在表内。
此时自动进入**种子模式**：先检索取 60 条种子，再从种子块的高频共现元数据反推锚点。
实测「精神分析」反推出 `3-4-4-2 经典的精神分析` 与 `3-4-4-4 针对资本主义的精神分析`
——正是该主题的两个核心单元。

### 13.4 诊断工具

```bash
python scripts/diag_theme.py     # 主题集中度：top-k 分散度 vs 语料真实分布
python scripts/diag_compare.py   # 点式问答 vs 专题综合的指标对比表
```

完整的环节定位与优化方案见 [`docs/检索问答与专题提炼的差距诊断.md`](docs/检索问答与专题提炼的差距诊断.md)。

---

## 十四、常见问题

**Q：没有 GPU 能跑吗？**  
能。默认 `device: cpu`，bge-base 建索引约 20 分钟（6600 余块）；重排开启时首次查询
要额外加载一次重排模型，之后查询仍为秒级。

**Q：完全离线可以吗？**  
可以。模型与语料都已随项目落地，`backend: sentence_transformer` + 本地路径即可。  
若只想极速验证链路，把 `embedding.backend` 改成 `hashing`（零依赖、纯词法近似）。

**Q：回答是「资料不足」怎么办？**  
说明检索没召回相关内容。按顺序检查：① `facets` 里有没有该术语 ② 换个说法或加  
`--unit` 限定 ③ 扩充 `lexicon/concepts.yaml` ④ 换更强的嵌入模型。

**Q：怎么确认索引没坏？**  
`python -m philo_rag.cli stats` 看 `chunk_count`、`unit_count`（应接近 338）与  
`embedding_backend` 是否与 `config.yaml` 一致。`store/manifest.json` 记录了构建时的后端与维度，  
避免「索引和配置不匹配」的隐性故障。当前基线：`chunk_count=6630`、`quote_count=1144`、  
`unit_count=327`、512 维。

**Q：问「你好」为什么直接被跳过了？**  
这是问题闸门在起作用：寒暄、问系统自身、实时信息、无主题碎片这类问题不适合检索，
以及无锚点又与语料无关的问题（语义相关性兜底），都会在检索之前就被跳过
（返回 `skipped: true` 与判定类别），既省算力也避免输出无意义内容。
想强制送进检索可加 `--no-gate`，或把 `gate.enabled` 设为 `false`。详见 §十二。

**Q：为什么引文大多显示「未署名」？**  
因为语料里绝大多数引文是举例、假想对话或整理者旁述，本身没有归属。归因规则宁可置空也不误配，  
所以只有 2% 的引文带说话人；要浏览式检索请改用 `--philosopher`（相关理论家，覆盖 47%）。详见 §九。

**Q：想换成别的书？**  
`doc.raw` 指向新文件 → `prepare` → 按新书的章节规则调 `philo_rag/prepare.py` 的  
`_as_heading` → 更新 `lexicon/` → `build`。通用（非哲学大纲）的 txt/md/pdf/docx 也可以直接  
放进 `doc.source`，摄取层的通用标题解析（`第X章`/`一、`/`1.1`/无编号短行）会自动生效。
