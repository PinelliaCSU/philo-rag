# 哲学大纲 · 知识库（Philo-RAG）

Philo-RAG 将《哲学大纲》整理为可检索、可溯源、可问答的本地知识库。

主要功能：

- **溯源回答**：根据问题自动选择点查询或范围查询，并返回引用来源。
- **术语检索**：查询概念定义、别名和相关原文。
- **引文检索**：按理论家、说话人、概念、单元等条件筛选引文。
- **体系浏览**：按卷、单元、理论家和概念浏览知识库。

语料、词典和索引默认保存在本地。回答生成默认使用兼容 OpenAI
接口的模型，也可以切换为本地 Ollama 或完全离线的抽取式模式。

## 安装

需要 Python 3.10 或更高版本。

```powershell
git clone https://github.com/PinelliaCSU/philo-rag.git
cd philo-rag

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux 激活虚拟环境：

```bash
source .venv/bin/activate
```

`requirements.txt` 已包含本地语义检索所需的
`sentence-transformers`。项目内的 `models/` 目录提供默认嵌入模型和重排模型。

## 配置

主要配置位于 [`config.yaml`](config.yaml)：

- `doc.source`：索引使用的清洗后语料文件。
- `doc.store_dir`：索引输出目录。
- `embedding`：嵌入模型和运行设备。
- `retrieval`：混合检索、重排等参数。
- `answer`：回答生成后端。

默认配置使用阿里云百炼的 OpenAI 兼容接口。将密钥写入项目根目录的
`.env`，不要直接提交到配置文件：

```powershell
Copy-Item .env.example .env
notepad .env
```

```dotenv
DASHSCOPE_API_KEY=sk-你的密钥
```

如不使用云端生成，可在 `config.yaml` 中设置：

```yaml
answer:
  backend: template
```

`template` 不调用模型，适合离线使用和检查检索链路；`ollama` 可连接本地
Ollama 服务。

## 快速开始

项目已包含清洗后的语料和索引。直接启动 Web 界面：

```powershell
python -m philo_rag.cli serve
```

浏览器打开 <http://127.0.0.1:8000>。

如果修改了语料、分块参数、词典或嵌入模型，需要重新构建索引：

```powershell
python -m philo_rag.cli prepare  # 从 doc.raw 生成清洗后的语料
python -m philo_rag.cli build
python -m philo_rag.cli stats
```

只修改回答后端或 API 配置时，不需要重建索引。

## 命令行用法

所有命令都可以通过 `--config` 指定其他配置文件。

```powershell
# 溯源回答
python -m philo_rag.cli ask "什么是字头？"
python -m philo_rag.cli ask "马克思在体系中的位置" --strategy theme

# 术语检索
python -m philo_rag.cli term "客体小a"

# 引文检索
python -m philo_rag.cli quote --speaker 拉康 --limit 20
python -m philo_rag.cli quote --unit 3-2 --keyword "主体"

# 分面统计
python -m philo_rag.cli facets

# 输出为文件
python -m philo_rag.cli ask "什么是存在者整体？" --format md --out outputs/存在者整体.md

# 一键检查检索链路
python -m philo_rag.cli demo
```

`ask` 的 `--strategy` 可选：

- `auto`：根据问题自动判定，默认值。
- `point`：适合“什么是 X”“X 出自哪里”等定位式问题。
- `theme`：适合“X 的思想脉络”“X 在体系中的位置”等主题式问题。

常用输出格式为 `md`、`json`、`jsonl`、`csv` 和 `txt`。

## Web 服务参数

```powershell
python -m philo_rag.cli serve --host 127.0.0.1 --port 8000
```

前端包含三个页签：

1. **溯源回答**：提问并查看逐条引用。
2. **检索**：在术语检索和引文检索之间切换。
3. **分面 · 体系**：浏览卷、单元、理论家和概念。

服务同时提供 JSON API，常用接口如下：

| 接口 | 用途 |
| --- | --- |
| `GET /api/term?term=大他者` | 术语检索 |
| `GET /api/quote?speaker=拉康` | 引文检索 |
| `POST /api/ask` | 溯源回答 |
| `GET /api/facets` | 分面统计 |
| `GET /api/units` | 体系目录 |

## 目录

```text
config.yaml                 配置文件
data/                       清洗后的语料
lexicon/                    理论家、概念和体系词典
models/                     本地嵌入与重排模型
store/                      索引文件
outputs/                    导出的回答和检索结果
philo_rag/                  Python 包、CLI、服务端和前端
docs/                       详细使用与架构说明
```

更具体的架构和排障说明见 [`docs/架构设计.md`](docs/架构设计.md) 与
[`docs/使用说明.md`](docs/使用说明.md)。
