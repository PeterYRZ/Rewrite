# Rewrite — 全文部分段落改写

一个支持全自动（Mode 1）和交互式（Mode 2）两种模式的段落改写应用。用户在提交的文章中指定若干段落，系统在保持全文逻辑连贯性的前提下仅改写目标段落。

## 技术栈

- **后端**：Python 3.14 / FastAPI / Pydantic
- **前端**：React + Vite + Tailwind CSS（Phase 6）
- **LLM 集成**：OpenAI SDK + Ollama（不引入 langchain / llama-index）

## 架构概览

多 Agent 协作，调度 Agent 为中心协调者：

| Agent | 状态 | 职责 |
|-------|------|------|
| 调度Agent | 有状态 | 状态机、上下文组装、任务编排 |
| 生成Agent | 无状态 | 段落改写 / 全文生成 |
| 校验Agent | 无状态 | 语义一致性 & 逻辑连贯性检查 |
| 语义分析Agent | 无状态 | 相似度计算、差异摘要 |

LLM Provider 通过 `config.yaml` 配置。复制 `config.yaml.example` 并设置环境变量注入 API Key。

## 项目结构

```
Rewrite/
├── CLAUDE.md               # 项目信息（本文件）
├── config.yaml             # 模型 & 应用配置
├── pyproject.toml
├── docs/                   # 技术规范 & 开发日志
├── data/                   # 测试示例文章
├── src/
│   ├── models/             # 数据模型
│   ├── llm/                # LLM Provider 抽象 & 实现
│   ├── agents/             # 4 个 Agent
│   ├── pipelines/          # Mode 1 / Mode 2 流水线
│   └── cli/                # CLI 入口
├── web/                    # 前端（Phase 6）
└── tests/
```

## 开发约定

- 调度 Agent 是唯一有状态的组件，其他 Agent 为无状态函数
- 上下文管理采用双文档策略：原始文档（不变） + 当前文档（随改写推进更新）
- 不引入 langchain / llama-index 等重型框架
- LLM 调用全部通过 provider 抽象层，不在业务代码中直接调用 API
- 使用 `uv` 管理 Python 依赖

## 开发阶段

详见 `docs/tech-spec.md`
