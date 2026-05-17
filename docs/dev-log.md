# 开发日志

## 2026-05-17 — 项目初始化 & 架构确认

- 确认整体技术方案：Python 后端 + CLI 优先 + React 前端（Phase 6）
- 确认多 Agent 协作架构：调度 / 生成 / 校验 / 语义分析
- 确认上下文管理策略：双文档 + 锁定区
- 确认 LLM Provider 抽象层方案（配置文件驱动，不引入 langchain）
- 建立项目目录结构
- 编写 CLAUDE.md、tech-spec.md、dev-log.md

### 已确认的技术决策

| 决策点 | 选择 |
|--------|------|
| 后端语言 | Python (FastAPI + Pydantic) |
| 开发形态 | 先 CLI 后 Web |
| LLM 配置 | YAML 配置文件 |
| Agent 通信 | 直接函数调用 |
| 前端方案 | React + Vite + Tailwind（轻量段落编辑器） |

---

## 2026-05-17 — Phase 1 完成

### 完成内容

**Python 项目初始化**
- 使用 `uv init` 初始化项目，包名 `rewrite-engine`
- Python 3.14，虚拟环境 `.venv`
- 依赖：openai, pydantic, pyyaml, rich, httpx

**数据模型** (`src/rewrite_engine/models/`)
- `article.py`：`Article`, `Paragraph`, `ParagraphStatus`, `ProjectState`, `Step`
  - `Article.from_text()` 从文本解析段落
  - `ProjectState.create()` 创建项目状态
  - `ProjectState.build_context()` 组装双文档上下文（原始 + 当前带标记）
- `config.py`：`AppConfig`, `ModelConfig`, `RewriteConfig`, `ValidationConfig`
  - `load_config()` 从 YAML 加载配置

**LLM Provider 抽象层** (`src/rewrite_engine/llm/`)
- `provider.py`：`LLMProvider` Protocol + `create_provider()` 工厂函数
- `openai_provider.py`：OpenAI-compatible 实现（支持 OpenAI、Anthropic 等）
- `ollama_provider.py`：Ollama 本地模型实现

**生成Agent** (`src/rewrite_engine/agents/generator.py`)
- `rewrite_single_paragraph()`：在全文上下文下单段改写
- `build_single_rewrite_messages()`：构建带段落标记的 Prompt

**CLI 入口** (`src/rewrite_engine/cli/main.py`)
- 支持文件路径或直接文本输入
- `--paragraph/-p` 指定目标段落（0-based）
- `--model/-m` 选择模型
- `--config/-c` 指定配置文件

**示例数据**
- `data/sample-article.txt`：6段中文 AI 主题示例文章

**配置文件 & 安全**
- `config.yaml.example`：配置文件模板（git 跟踪），API Key 通过环境变量注入
- `config.yaml`：本地实际配置（.gitignore 排除）
- `.gitignore`：排除 config.yaml、.venv、IDE/OS 文件等

### 验证结果

- CLI `--help` 正常
- Article 模型解析/序列化正确
- Config 加载正确
- Generator Prompt 构建正确（段落标记 + 上下文完整）

### 配置安全加固

- 重命名 `api_key_env` → `api_key`，支持两种模式：
  - 直接填写 key：`api_key: "sk-xxxx"`（gitignored 的 config.yaml 中可用）
  - 环境变量引用：`api_key: "$OPENAI_API_KEY"`（用于 config.yaml.example）
- 添加 `ModelConfig.resolve_api_key()` 方法自动处理两种格式
- 创建 `.gitignore`，排除 `config.yaml`

---

## 2026-05-17 — Phase 2 完成

### 完成内容

**调度Agent** (`src/rewrite_engine/agents/scheduler.py`)
- `SchedulerAgent`：状态机核心，管理 `ProjectState` 生命周期
  - `init_project()` 创建项目状态，初始化双文档上下文
  - `run_auto()` 遍历所有目标段落，逐段调用生成Agent
  - 每次改写后调用 `state.advance()` 锁定段落并推进状态
  - `StepResult` 记录每步改写的原文/改写结果
- 状态机流转：`IDLE → SCHEDULING → GENERATING → (循环) → DONE`

**生成Agent 扩展** (`src/rewrite_engine/agents/generator.py`)
- 新增 `rewrite_with_context()`：接收 `ProjectState`，使用双文档上下文
- 新增 `build_rewrite_messages()`：基于 `state.build_context()` 构建 Prompt
- 保留 Phase 1 的单段落改写函数

**Mode 1 自动流水线** (`src/rewrite_engine/pipelines/auto.py`)
- `run_auto_pipeline()` 编排：创建 Scheduler → 初始化 → 执行 → 输出
- `AutoRewriteResult`：封装原文、改写结果、步骤历史
- `print_summary()` 打印每段改写对比

**CLI 更新** (`src/rewrite_engine/cli/main.py`)
- `--paragraphs 2 4`：支持多段落批量改写
- `--mode auto|interactive`：工作模式选择（Phase 4 实现 interactive）
- `--output/-o`：结果写入文件
- 向后兼容 `--paragraph` 单段落模式

### 验证结果

```
rewrite data/sample-article.txt --paragraphs 2 4 -m deepseek-v4-pro
```
- 段落 3（医疗AI）和段落 5（未来展望）被成功改写
- 其他段落保持原文不变
- 全文逻辑连贯性完好，改写段落与前后自然衔接
- 双文档上下文策略验证有效

### 下一步

Phase 3：校验Agent + 语义分析Agent
