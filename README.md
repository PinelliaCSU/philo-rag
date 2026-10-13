# 哲学大纲 · 知识库（Philo-RAG）

把《哲学大纲》（四卷合一，约 200 万字）做成一个**可检索、可溯源、可问答**的  
本地知识库。全部产物都在本机，不需要联网、不需要 API Key 就能跑通完整链路。

三个检索入口，各自解决一类问题：

| 入口            | 回答什么问题                 | 机制                           |
| ------------- | ---------------------- | ---------------------------- |
| **引用溯源问答**    | 「什么是字头？」「大他者怎么理解？」     | 向量 + BM25 混合检索 → 生成，每个论断回跳原文 |
| **术语索引与语义检索** | 「场域论」「客体小a」是什么意思、在哪儿出现 | 概念词典精确命中 + 语义检索兜底            |
| **引文检索**      | 「拉康原话有哪些」「按字头 4 找引文」   | 元数据倒排 + 精确过滤，结果可枚举可核对        |

> 引文检索里有两个容易混用的理论家维度：`--philosopher` 是**相关理论家**（引文所在段落  
> 提到该人就命中，召回高），`--speaker` 是**说话人**（只认有引述标记的归因，精度高、覆盖低）。  
> 结果按「说话人 → 引文正文提及 → 语境相关」分档排序，见 §九。

---

## 一、快速开始

```bash
cd philo-rag

# 1) 建虚拟环境并装依赖
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2) 一键跑通：采集语料 → 建索引 → 三类检索自检
python -m philo_rag.cli demo

# 3) 起 Web 界面
python -m philo_rag.cli serve
# 浏览器打开 http://127.0.0.1:8000
```

默认使用项目内自带的 `models/bge-small-zh-v1.5`（中文语义向量，约 95 MB）与  
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
| `ask "问题"`  | 引用溯源问答            | `--unit 3-2` `--philosopher 黑格尔` `--concept 辩证法` `--format json` `--out x.md`                           |
| `term "术语"` | 术语卡 + 精确命中 + 语义补充 | `--limit 8` `--format csv`                                                                              |
| `quote`     | 引文检索              | `--philosopher` `--speaker` `--concept` `--era` `--school` `--unit` `--volume` `--keyword` `--limit 30` |
| `facets`    | 分面统计（筛选维度）        | `--format json`                                                                                         |
| `eval`      | 检索质量回归评测          | `--top-k 8` `--golden my.json`                                                                          |
| `serve`     | 启动 Web 服务         | `--host` `--port` `--reload`                                                                            |
| `demo`      | 一键自检              | `--rebuild`                                                                                             |

### 例子

```bash
# 限定在 3-2（德国观念论）里问
python -m philo_rag.cli ask "谢林和黑格尔的分歧在哪？" --unit 3-2

# 导出为 Markdown / JSON / CSV
python -m philo_rag.cli ask "什么是存在者整体？" --format md --out out/存在者整体.md
python -m philo_rag.cli term "客体小a" --format json

# 按字头检索引文（unit=4 即整个第 4 卷）
python -m philo_rag.cli quote --unit 4 --limit 20 --format csv --out out/字头4引文.csv

# 按理论家 + 概念交叉过滤（相关理论家，召回优先）
python -m philo_rag.cli quote --philosopher 拉康 --concept 大他者

# 只要拉康本人的话（说话人，精度优先）
python -m philo_rag.cli quote --speaker 拉康
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
  model: models/bge-small-zh-v1.5
  device: cpu

retrieval:                    # 5. 检索
  dense_top_k: 40
  sparse_top_k: 40
  fusion: rrf
  entity_boost: 0.004
  definition_boost: 0.02
  final_top_k: 8
  expand_query: true
  rerank: false

answer:                       # 6. 生成
  backend: template           # template | ollama | api
  model: qwen2.5:7b
  max_context_chunks: 8

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

内置单页界面（无前端构建步骤），四个页签对应三类检索 + 体系浏览：

| 接口                                      | 说明                                           |
| --------------------------------------- | -------------------------------------------- |
| `GET /api/stats`                        | 索引概览                                         |
| `GET /api/facets`                       | 分面统计（含说话人维度）                                 |
| `GET /api/units`                        | 体系目录（338 单元）                                 |
| `GET /api/concepts`                     | 概念词典列表                                       |
| `POST /api/ask`                         | 问答，body：`{"question": "...", "unit": "3-2"}` |
| `GET /api/term?term=大他者`                | 术语检索                                         |
| `GET /api/quote?unit=4&philosopher=黑格尔` | 引文检索（`speaker=` 走精确说话人）                      |
| `GET /api/context?chunk_id=...`         | 取某块及上下文（跳转原文）                                |

---

## 六、接上大模型（可选）

默认 `answer.backend: template` 是**离线抽取式**——不调用任何模型，直接给出带引用的原文要点，  
用于自检、降级与「检索质量脱离生成质量被独立评测」。

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

默认的 `bge-small-zh-v1.5`（512 维）已经能支撑语义检索。要再上一档：

```bash
HF_ENDPOINT=https://hf-mirror.com python -c "
from huggingface_hub import snapshot_download
snapshot_download('BAAI/bge-base-zh-v1.5', local_dir='models/bge-base-zh-v1.5')"
```

```yaml
embedding:
  model: models/bge-base-zh-v1.5    # 768 维，效果更好、速度约慢 3 倍
```

换模型后**必须全量重建索引**（向量空间变了）。

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
├── models/bge-small-zh-v1.5/   自带的嵌入模型（离线可用）
├── store/                      索引产物（chunks / vectors / terms / manifest）
├── outputs/                    检索与问答的导出结果
├── scripts/
│   ├── gen_taxonomy.py         从语料生成体系目录
│   └── check_speaker.py        引文说话人归因巡检
└── philo_rag/                  Python 包
    ├── prepare.py   采集与清洗（L0）
    ├── ingest.py    解析 → 结构识别 → 分块 → 元数据抽取（L1）
    ├── embed.py     嵌入后端（sentence_transformer / hashing / api）
    ├── index.py     向量索引 + BM25 + 元数据倒排（L2）
    ├── retrieve.py  混合检索 / 术语检索 / 引文检索
    ├── answer.py    引用溯源问答（L3）
    ├── output.py    结果渲染（md / json / jsonl / csv / txt）
    ├── evaluate.py  检索质量评测（L4）
    ├── server.py    FastAPI 服务 + 内置界面
    └── cli.py       命令行入口
```

---

## 十二、常见问题

**Q：没有 GPU 能跑吗？**  
能。默认 `device: cpu`，bge-small 建索引约 3–6 分钟（6600 余块），之后查询毫秒级。

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

**Q：为什么引文大多显示「未署名」？**  
因为语料里绝大多数引文是举例、假想对话或整理者旁述，本身没有归属。归因规则宁可置空也不误配，  
所以只有 2% 的引文带说话人；要浏览式检索请改用 `--philosopher`（相关理论家，覆盖 47%）。详见 §九。

**Q：想换成别的书？**  
`doc.raw` 指向新文件 → `prepare` → 按新书的章节规则调 `philo_rag/prepare.py` 的  
`_as_heading` → 更新 `lexicon/` → `build`。通用（非哲学大纲）的 txt/md/pdf/docx 也可以直接  
放进 `doc.source`，摄取层的通用标题解析（`第X章`/`一、`/`1.1`/无编号短行）会自动生效。
