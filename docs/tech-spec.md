# 技术规范

> 最后更新：2026-05-17

## 1. 项目定位

"全文部分段落改写"应用。用户提交一篇包含多个段落的文章，指定其中若干段落，系统在保持全文逻辑连贯性的前提下仅改写指定段落，输出修改后的完整文章。

### 两种工作模式

- **Mode 1（全自动）**：提交全文和改写目标 → 直接输出最终结果
- **Mode 2（交互式）**：逐段处理，每段生成多个候选供用户选择，后续段落的改写感知前序修改

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

- **调度Agent**：管理 ProjectState、组装干净上下文、驱动状态机
- **生成Agent**：执行段落改写或全文生成（调用 LLM）
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

### 2.3 状态机（Mode 2）

```
IDLE → SCHEDULING → GENERATING → [VALIDATING] → [WAITING_USER]
         ↑                                              │
         └────────────── next paragraph ────────────────┘
→ MERGING → DONE
```

### 2.4 LLM Provider 抽象

```python
class LLMProvider(Protocol):
    async def chat(messages: list[Message], **kwargs) -> str: ...
    async def chat_stream(messages: list[Message], **kwargs) -> AsyncIterator[str]: ...
```

- `Message` 为 `{"role": str, "content": str}` 字典
- 通过 `config.yaml` 注册模型，代码按名称引用
- 支持云端模型（OpenAI SDK 兼容）和本地模型（Ollama OpenAI-compatible API）
- 不引入 langchain / llama-index

## 3. 数据模型

### Article
```python
class Article:
    paragraphs: list[Paragraph]

class Paragraph:
    index: int          # 0-based
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

## 4. 配置规范

`config.yaml` 结构：
```yaml
models:
  - name: "gpt-4o"
    provider: "openai"
    model: "gpt-4o"
    api_base: "https://api.openai.com/v1"
    api_key_env: "OPENAI_API_KEY"
  - name: "local-llama"
    provider: "ollama"
    model: "llama3.2"
    api_base: "http://localhost:11434/v1"

rewrite:
  candidates_count: 3       # Mode 2 每段生成候选数
  temperature: 0.7
  max_tokens: 2000

validation:
  enabled: true
  strictness: "medium"      # low | medium | high
```

## 5. 项目结构

```
Rewrite/
├── CLAUDE.md
├── config.yaml
├── pyproject.toml
├── docs/
│   ├── tech-spec.md        # 本文件
│   └── dev-log.md          # 开发日志
├── data/                   # 测试示例文章
├── src/
│   ├── models/
│   │   ├── article.py      # Article, Paragraph, ProjectState
│   │   └── config.py       # 配置加载 & 数据模型
│   ├── llm/
│   │   ├── provider.py     # LLMProvider 协议 & 工厂函数
│   │   ├── openai_provider.py
│   │   └── ollama_provider.py
│   ├── agents/
│   │   ├── scheduler.py    # 调度Agent
│   │   ├── generator.py    # 生成Agent
│   │   ├── validator.py    # 校验Agent
│   │   └── analyzer.py     # 语义分析Agent
│   ├── pipelines/
│   │   ├── auto.py         # Mode 1
│   │   └── interactive.py  # Mode 2
│   └── cli/
│       └── main.py         # CLI 入口
├── web/                    # 前端（Phase 6）
│   └── src/
│       ├── components/
│       │   ├── ParagraphCard.tsx
│       │   ├── ArticleView.tsx
│       │   ├── CandidatePicker.tsx
│       │   └── ModeSelector.tsx
│       ├── hooks/
│       │   └── useRewriteSession.ts
│       └── App.tsx
└── tests/
```

## 6. API 设计（Phase 6 后端）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/rewrite/auto` | POST | Mode 1：提交全文+目标段落，返回改写结果 |
| `/api/rewrite/interactive/start` | POST | Mode 2：创建交互式会话 |
| `/api/rewrite/interactive/{id}/next` | GET | Mode 2：获取下一段落的候选改写 |
| `/api/rewrite/interactive/{id}/select` | POST | Mode 2：选择候选并推进 |
| `/api/rewrite/interactive/{id}/events` | GET | Mode 2：SSE 事件流 |

## 7. 评估体系

初期采用轻量方法：
1. **定性自检法**：结构化主观评分（连贯性 / 一致性 / 表达质量）
2. **LLM 辅助评测**：强模型打分获取定量趋势
3. **人工盲测对照**：方案成型后执行

完整评估体系待应用骨架跑通后建立。
