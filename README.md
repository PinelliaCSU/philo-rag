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

项目已包含清洗后的语料、索引与星图布局。唯一入口是 Web 服务：

```powershell
python -m philo_rag                      # 默认 127.0.0.1:8000
python -m philo_rag --port 8800 --config config.yaml
```

浏览器打开 <http://127.0.0.1:8000>。界面是「星图纸页」：暗色雾面、无导航、无输入框；
星图只由回答命中的概念点亮，答案收束为一张无边界纸页，引用藏在句末极淡的圆点里，
收藏按需从底部升起。

如果改了语料、分块参数、词典或嵌入模型，重建索引与星图（这两个是维护脚本，不是用户 CLI）：

```powershell
python scripts/build_index.py --prepare   # 先从 doc.raw 清洗语料，再重建索引
python scripts/build_index.py             # 只重建索引
python scripts/build_starmap.py           # 重新生成星图布局 philo_rag/web/data/starmap.json
```

只改回答后端或 API 配置时不需要重建索引；分块参数或词典改动后，服务启动会打印索引与配置
不一致的提示，照提示重建即可。

## 界面

四层，自下而上：星图雾面 → 输入线 → 纸页 → 浮层（引用薄层 / 星匣 / 低语层）。

- **输入线**：页面中心唯一入口，无边框无底色；`Enter` 提交、`Shift+Enter` 换行、`Esc` 分级关闭，
  中文输入法组字中的 Enter 不会误提交。
- **纸页**：五种纸页共用同一种排版——回答 / 概念 / 体系地图 / 单元阅读 / 对比。
- **引用点**：句末 3–4px 圆点，多引用聚合成一个；`Tab` 可达，`Enter` 在底部升起引用薄层。
- **低语层**：输入线为空时按 `/` 打开，前缀切换模式——默认`点`（概念）、`引 `（引文）、
  `脉 `（主题/范围）、`读 `（单元）、`图 `（体系地图）、`对 `（对比）。
- **收藏与星匣**：`S` 收藏当前聚焦对象（问题 / 回答 / 引用 / 概念），`F` 从底部升起星匣，
  可搜索、删除、跳回，并导出 JSON（全部回答）与 Markdown（收藏）。

## Web 服务参数

```powershell
python -m philo_rag --host 127.0.0.1 --port 8000 --config config.yaml
```

JSON API 与 SSE 契约见下表；SSE 事件顺序恒为 `meta → delta… → done`，不新增事件类型。

| 接口 | 用途 |
| --- | --- |
| `GET /api/stats` | 索引/模型/会话能力 |
| `GET /api/facets` | 分面统计 |
| `GET /api/units` · `GET /api/unit?code=` | 体系目录 · 单元导览与连续阅读 |
| `GET /api/concepts` · `GET /api/concept?term=` | 概念全量（低语层本地搜索）· 概念纸页 |
| `GET /api/compare?a=&b=` | 对比纸页 |
| `GET /api/term?term=` | 低语层「点」的语义补充 |
| `GET /api/quote?…` | 低语层「引」 |
| `GET /api/context?chunk_id=` | 引用正文回捞 |
| `GET /api/starmap` | 星图节点/边/坐标/别名/词典指纹 |
| `POST /api/ask` · `POST /api/ask_stream` | 非流式回退 · SSE 主路径 |

## 前端构建

```powershell
cd frontend
npm install
npm run build      # 产物进 philo_rag/web/dist（已提交进仓库，pip 装完即可运行）
npm run dev        # 开发服务器，/api 代理到 127.0.0.1:8000
npm run test       # vitest
npm run e2e        # playwright（需先 npx playwright install chromium）
```

若所在环境不允许子进程管道（部分沙箱 / 受控机），用 `npm run build:restricted` 与
`npm run test:restricted`：它们只是关掉 esbuild 的转译与压缩，产物仍是可运行的 ESM。

服务同时提供 JSON API，常用接口如下：

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
python -m pytest                 # 后端全量回归；索引与模型只装载一次
python -m ruff check philo_rag scripts tests
cd frontend; npm run test        # 前端单元测试（citations / terms / db / starmap）
cd frontend; npm run e2e         # 关键路径的端到端检查
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
philo_rag/                  Python 包（检索与生成链路、Web 服务、Vite 产物）
philo_rag/web/dist/         Vite 构建产物（提交进仓库）
philo_rag/web/data/         星图布局 starmap.json
frontend/                   Svelte 5 + Vite 源码、Vitest 与 Playwright 用例
tests/                      pytest 回归用例
scripts/                    维护脚本：build_index.py / build_starmap.py
docs/                       详细使用与架构说明
```

更具体的架构和排障说明见 [`docs/架构设计.md`](docs/架构设计.md) 与
[`docs/使用说明.md`](docs/使用说明.md)。
