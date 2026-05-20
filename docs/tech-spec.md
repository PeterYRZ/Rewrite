# 技术规范

> 最后更新：2026-05-19

## 1. 项目定位

"全文部分段落改写"应用。用户提交一篇包含多个段落的文章，指定其中若干段落，系统在保持全文逻辑连贯性的前提下仅改写指定段落，输出修改后的完整文章。

### 工作模式

- **Mode 1（全自动）**：提交全文和改写目标 → 直接输出最终结果（含校验 & 语义分析报告）
- **Mode 2（交互式）**：双栏 Diff 视图，选中多个段落 → 并行流式生成 → 逐段审查（接受/指导重写/编辑）→ 提交本轮 → 多轮增量改写

## 2. 架构设计

### 2.1 多 Agent 协作

```
┌──────────────┐
│  调度Agent    │ ← 唯一有状态组件，中心协调者
│  (Scheduler) │
└──────┬───────┘
       │ 直接函数调用
  ┌────┼────┬────────┐
  ▼    ▼    ▼        ▼
生成  校验  语义分析  (无状态工具)
```

- **调度Agent**：管理 ProjectState、组装干净上下文、驱动状态机、管理多轮会话
- **生成Agent**：流式段落改写 / 指导式重写 / 全文生成（调用 LLM）
- **校验Agent**：检查改写后的语义一致性和逻辑连贯性
- **语义分析Agent**：计算语义相似度，抽取改写前后差异摘要

### 2.2 上下文管理（双文档策略）

核心难点：改写段落后，后续改写需基于"已确认的最新文稿"，不能把新旧版本混杂输入。

**方案**：调度 Agent 维护两份视图——
- **原始文档（immutable）**：始终保留，提供风格和主旨锚点
- **当前文档（mutable）**：已确认段落锁定，待改写段落标记，未处理保留原文

每轮改写 Prompt 结构：
```
SYSTEM: 你是段落改写助手。

原文全文（风格参考）：
[原始文档]

当前最新版本（[LOCKED] 不可改，[TO_REWRITE] 需改写）：
[当前文档，含状态标记]

TASK: 仅改写 [TO_REWRITE] 段落，保持与其他段落自然衔接。
```

### 2.3 状态机（Mode 2 交互式）

```
IDLE → READY → SELECTING_TARGETS → STREAMING → REVIEWING → COMMITTING → READY (下一轮)
                   ↑                                    │
                   └──── 追加选择段落 ──────────────────┘
```

每段改写卡片子状态：
```
PENDING → STREAMING → STREAM_DONE → ACCEPTED
                                   → EDITING
                                   → GUIDANCE_INPUT → REGENERATING → STREAMING
```

### 2.4 多轮会话模型

```
Session {
  article_id: str
  original: Article          # 最初的原文（不可变）
  current: Article           # 当前累积稿（每轮 commit 后更新）
  rounds: [{                 # 历史轮次
    round_num: int
    target_indices: [int]
    results: {idx: content}
    committed_at: datetime
  }]
}
```

### 2.5 LLM Provider 抽象

```python
class LLMProvider(Protocol):
    async def chat(messages: list[Message], **kwargs) -> str: ...
    async def chat_stream(messages: list[Message], **kwargs) -> AsyncIterator[str]: ...
```

- `Message` 为 `{"role": str, "content": str}` 字典
- 通过 `config.yaml` 注册模型，代码按名称引用
- `chat_stream()` 已在 openai_provider 和 ollama_provider 中实现
- 不引入 langchain / llama-index

## 3. 数据模型

### Article
```python
class Article:
    paragraphs: list[Paragraph]

class Paragraph:
    index: int
    content: str
    status: ParagraphStatus  # ORIGINAL | LOCKED | TO_REWRITE | REWRITTEN
```

### ProjectState
```python
class ProjectState:
    article_id: str
    original: Article
    current: Article
    target_indices: list[int]
    confirmed: list[int]
    current_step: Step
    candidates: dict[int, list[str]]
```

### RewriteSession（Phase 7 新增）
```python
class RewriteSession:
    session_id: str
    original_article: Article
    current_article: Article
    rounds: list[RewriteRound]

class RewriteRound:
    round_num: int
    target_indices: list[int]
    results: dict[int, str]   # paragraph_index → rewritten content
    confirmed: bool
```

## 4. SSE 流式协议

### 批量流式改写

端点：`POST /api/rewrite/stream/rewrite`
Content-Type: `text/event-stream`

```
event: paragraph_start
data: {"paragraph_index": 2}

event: token
data: {"paragraph_index": 2, "token": "在医疗"}

event: token
data: {"paragraph_index": 2, "token": "健康"}

event: paragraph_done
data: {"paragraph_index": 2, "content": "完整改写段落..."}

event: stream_end
data: {"all_done": true}
```

- 所有目标段落**并行**流式输出（`asyncio.gather`）
- 前端按 `paragraph_index` 将 token 路由到对应的 RewriteCard

### 指导式重写

端点：`POST /api/rewrite/stream/regenerate`
额外字段：`{ guidance: "语气更正式一些" }`

协议同上，但仅针对单个段落。

## 5. 配置规范

`config.yaml` 结构：
```yaml
models:
  - name: "gpt-4o"
    provider: "openai"
    model: "gpt-4o"
    api_base: "https://api.openai.com/v1"
    api_key: "$OPENAI_API_KEY"
  - name: "local-llama"
    provider: "ollama"
    model: "llama3.2"
    api_base: "http://localhost:11434/v1"
    api_key: "ollama"

rewrite:
  candidates_count: 3
  temperature: 0.7
  max_tokens: 2000

validation:
  enabled: true
  strictness: "medium"
```

前端配置端点：
- `GET /api/config` — 返回 `{ models: [...], rewrite: { temperature, max_tokens, candidates_count } }`
- `PUT /api/config` — 更新 `{ model?, temperature?, candidates_count?, max_tokens? }`

## 6. 项目结构

```
Rewrite/
├── CLAUDE.md
├── config.yaml
├── config.yaml.example
├── pyproject.toml
├── .vscode/
│   └── launch.json
├── docs/
│   ├── tech-spec.md          # 本文件
│   └── dev-log.md            # 开发日志
├── data/
│   ├── sample-article.txt
│   └── test-cases/
├── src/rewrite_engine/
│   ├── models/
│   │   ├── article.py        # Article, Paragraph, ProjectState
│   │   ├── config.py         # AppConfig, ModelConfig
│   │   └── session.py        # [Phase 7] RewriteSession, RewriteRound
│   ├── llm/
│   │   ├── provider.py       # LLMProvider 协议 & 工厂
│   │   ├── openai_provider.py
│   │   └── ollama_provider.py
│   ├── agents/
│   │   ├── scheduler.py      # 调度Agent（状态机 + 多轮管理）
│   │   ├── generator.py      # 生成Agent（含流式函数）
│   │   ├── validator.py      # 校验Agent
│   │   └── analyzer.py       # 语义分析Agent
│   ├── pipelines/
│   │   ├── auto.py           # Mode 1
│   │   └── interactive.py    # Mode 2
│   ├── api/
│   │   └── server.py         # FastAPI（含 SSE 端点）
│   └── cli/
│       └── main.py           # CLI 入口
├── web/
│   └── src/
│       ├── types.ts
│       ├── components/
│       │   ├── DiffLayout.tsx         # [Phase 7] 双栏布局容器
│       │   ├── ArticlePanel.tsx       # [Phase 7] 左侧文章面板
│       │   ├── ArticleView.tsx        # 文章段落列表
│       │   ├── ParagraphCard.tsx      # 段落卡片（含复选框）
│       │   ├── RewritePanel.tsx       # [Phase 7] 右侧改写面板
│       │   ├── RewriteCard.tsx        # [Phase 7] 单段改写结果卡片
│       │   ├── GuidanceInput.tsx      # [Phase 7] 内联指导输入
│       │   ├── ConfigPanel.tsx        # [Phase 7] 前端配置面板
│       │   └── RoundIndicator.tsx     # [Phase 7] 轮次指示器
│       ├── hooks/
│       │   ├── useRewriteSession.ts   # 会话管理
│       │   ├── useStreamRewrite.ts    # [Phase 7] SSE 流式消费
│       │   ├── useConfig.ts           # [Phase 7] 配置管理
│       │   └── useArticleState.ts     # [Phase 7] 文章状态
│       └── App.tsx
└── tests/
```

## 7. API 设计

| 端点 | 方法 | Content-Type | 说明 |
|------|------|-------------|------|
| `/api/rewrite/auto` | POST | `application/json` | Mode 1 全自动改写 |
| `/api/rewrite/stream/rewrite` | POST | `text/event-stream` | Mode 2 SSE 批量流式改写 |
| `/api/rewrite/stream/regenerate` | POST | `text/event-stream` | Mode 2 SSE 指导式单段重写 |
| `/api/rewrite/session/create` | POST | `application/json` | 创建多轮会话 |
| `/api/rewrite/session/{id}/commit` | POST | `application/json` | 提交当前轮次 |
| `/api/config` | GET | `application/json` | 获取运行时配置 |
| `/api/config` | PUT | `application/json` | 更新运行时配置 |
| `/api/health` | GET | `application/json` | 健康检查 |

## 8. 评估体系

初期采用轻量方法：
1. **定性自检法**：结构化主观评分（连贯性 / 一致性 / 表达质量）
2. **LLM 辅助评测**：强模型打分获取定量趋势
3. **人工盲测对照**：方案成型后执行

已有测试用例 3 个（`data/test-cases/`），均分 4.5/5。

## 9. Phase 7 实施路径

| 步骤 | 内容 | 产出 |
|------|------|------|
| Step 1 | 后端 SSE 流式端点 | `stream/rewrite` + `stream/regenerate` 可用 |
| Step 2 | 后端会话 & 配置端点 | `session/create` + `session/commit` + `config` 可用 |
| Step 3 | 前端 Hook 重构 | 4 个 hook 拆分完毕，SSE 解析验证通过 |
| Step 4 | 前端双栏布局 + 流式渲染 | DiffLayout + RewriteCard，token 实时渲染 |
| Step 5 | 指导重写 + 手动编辑 | GuidanceInput + 编辑模式可用 |
| Step 6 | 多轮支持 + 配置面板 | RoundIndicator + ConfigPanel + 多轮流程 |

### 验证方式

- **Step 1**：`curl -N POST /api/rewrite/stream/rewrite` 观察 token 逐行输出
- **Step 4**：浏览器中加载文章 → 选中段落 → 右侧逐字出现改写内容
- **Step 5**：输入"请用更口语化的风格" → 重新流式生成 → 风格变化可见
- **Step 6**：第一轮改段落 2、4 → 确认 → 第二轮选段落 1、3 → 全文连贯
