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

项目已包含清洗后的语料和索引。启动 Web 服务（项目唯一的运行入口）：

```powershell
python -m uvicorn philo_rag.server:app --host 127.0.0.1 --port 8000
```

浏览器打开 <http://127.0.0.1:8000>。启动时从当前目录读取 `config.yaml`，并加载配置中指定的索引。
部署目录应保留 `config.yaml`、`data/`、`lexicon/`、`models/` 和 `store/`。

项目不提供命令行查询、建索引或维护入口；语料处理及索引构建属于离线维护流程，不随网页服务运行。
如需更换索引，请预先准备好完整的 `store/` 目录，并按需更新 `config.yaml`。

服务提供 JSON API，前端是一个主视图 + 多个可召唤面板：

1. **溯源回答**（主视图）：提问并查看逐条引用；引用卡可「查看上下文」或收藏。
2. **概念卡**：定义与出处、单元分布、共现理论家、**相关概念**（同块共现）、所属主题，
   并可一键转成「什么是 X？」或「X 在体系中的位置」提问。
3. **检索**：在术语检索和引文检索之间切换。
4. **体系地图**：字头 × 位面浏览；点单元打开**单元导览**（子单元、术语、理论家、原文块列表）。
5. **笔记**：把引用卡 / 原文块收藏到浏览器本地（localStorage），加批注并导出 Markdown。

常用接口如下：

| 接口 | 用途 |
| --- | --- |
| `GET /api/term?term=大他者` | 术语检索 |
| `GET /api/quote?speaker=拉康` | 引文检索 |
| `POST /api/ask` | 溯源回答 |
| `GET /api/facets` | 分面统计 |
| `GET /api/units` | 体系目录 |
| `GET /api/unit?code=3-2-1` | 单元导览（单元元信息 + 块列表 / 术语 / 理论家） |

## 开发与自检

改动检索、生成或服务层后，先跑自动化回归再手测：

```powershell
pip install -e ".[dev]"          # pytest + ruff（httpx 供 fastapi TestClient）
python -m pytest                 # 全量回归；索引与模型只装载一次，约 1 分钟
python -m ruff check philo_rag tests
```

`pytest` 里冻结了检索基线（Hit@1 ≥ 96.43%、Hit@3 = 100%、MRR ≥ 0.9821），
回归不达标即判失败。生成后端的用例一律走离线 `template`，或 monkeypatch 后端函数，
因此**不配 API Key 也能跑全套回归**。用例清单与各文件守住的约束见
[`docs/架构设计.md`](docs/架构设计.md) 的「13.1 自动化回归」。

## 目录

```text
config.yaml                 配置文件
data/                       清洗后的语料
lexicon/                    理论家、概念和体系词典
models/                     本地嵌入与重排模型
store/                      索引文件
outputs/                    既有导出产物
philo_rag/                  Web 服务端与前端
tests/                      pytest 回归用例
docs/                       详细使用与架构说明
```

更具体的架构和排障说明见 [`docs/架构设计.md`](docs/架构设计.md) 与
[`docs/使用说明.md`](docs/使用说明.md)。
