# 哲学大纲 · 知识库（Philo-RAG）

把《哲学大纲》（四卷合一，约 200 万字）做成一个**可检索、可溯源、可问答**的  
本地知识库。全部产物都在本机，不需要联网、不需要 API Key 就能跑通完整链路。

三个使用入口，各自解决一类问题：

| 入口            | 回答什么问题                 | 机制                           |
| ------------- | ---------------------- | ---------------------------- |
| **引用溯源问答**    | 「什么是字头？」「大他者怎么理解？」     | 问题闸门 → 全文向量 + BM25 混合检索 → 生成，每个论断回跳原文 |
| **术语索引与语义检索** | 「场域论」「客体小a」是什么意思、在哪儿出现 | 概念词典精确命中 + 语义检索兜底            |
| **分面 / 体系浏览** | 按卷、单元、理论家和概念浏览知识库 | 统计卡片、层级单元卡片与问答联动 |

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
| `ask "问题"`  | 引用溯源问答（全文检索）      | `--no-gate` `--format json` `--out x.md`                                                                  |
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

answer:                       # 6. 生成（问答固定全文检索，不接受筛选条件）
  backend: template           # template | ollama | api
  model: qwen2.5:7b
  max_context_chunks: 8

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

内置单页界面（无前端构建步骤），三个页签对应问答、术语检索和体系浏览：

| 接口                                      | 说明                                           |
| --------------------------------------- | -------------------------------------------- |
| `GET /api/stats`                        | 索引概览                                         |
| `GET /api/facets`                       | 分面统计（理论家、概念、年代、流派）                       |
| `GET /api/units`                        | 体系目录（338 单元）                                 |
| `GET /api/concepts`                     | 概念词典列表                                       |
| `POST /api/ask`                         | 问答，body：`{"question": "..."}`（全文检索，无筛选字段）    |
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
```

重排会提升排序精度、增加约 50~200 ms 延迟；重排实例只加载一次并缓存，
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
│   └── check_gate.py           问题闸门巡检（放行 / 拦截用例）
└── philo_rag/                  Python 包
    ├── prepare.py   采集与清洗（L0）
    ├── ingest.py    解析 → 结构识别 → 分块 → 元数据抽取（L1）
    ├── embed.py     嵌入后端（sentence_transformer / hashing / api）
    ├── index.py     向量索引 + BM25 + 元数据倒排（L2）
    ├── retrieve.py  混合检索 / 术语检索 / 分面统计
    ├── gate.py      问题闸门：判断问题是否值得进入检索
    ├── answer.py    引用溯源问答（L3，全文检索 + 闸门）
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

## 十三、常见问题

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
