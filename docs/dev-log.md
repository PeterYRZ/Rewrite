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

---

## 2026-05-17 — Phase 3 完成

### 完成内容

**校验Agent** (`src/rewrite_engine/agents/validator.py`)
- `validate()`：对改写后的全文进行四维评估
  - 逻辑连贯性、段落衔接、语义一致性、风格统一性
  - 每个维度 1-5 分，输出 `ValidationReport`
- `_extract_json()`：从 LLM 响应中稳健提取 JSON（处理 markdown 嵌套等）
- 重试机制：空响应或 JSON 解析失败自动重试（最多 2 次）
- 容错降级：解析失败时返回默认评分，不中断流水线

**语义分析Agent** (`src/rewrite_engine/agents/analyzer.py`)
- `analyze_paragraph()`：比对单个段落的原文与改写，输出 `SemanticReport`
  - 语义相似度评分（1-5）
  - 变化摘要（用词调整、侧重点转移、语气变化等）
- `analyze_all()`：批量分析所有改写段落
- 同样具备 JSON 解析容错

**流水线集成** (`src/rewrite_engine/pipelines/auto.py`)
- `run_auto_pipeline()` 增加 `with_validation` 参数
- 改写完成后自动执行校验和语义分析
- `AutoRewriteResult` 新增 validation + semantic_reports 字段
- 质量报告可视化：★☆☆☆☆ 评分 + 问题列表 + 变化摘要

**CLI 更新**
- `--no-validation` 标志：跳过改写后评估以提速
- 默认执行完整评估

### 验证结果

```
rewrite data/sample-article.txt --paragraphs 2 4 -m deepseek-v4-pro
```
- 改写质量：段落 3、5 改写自然，与其他段落衔接流畅
- 质量评估：综合均分 5.0/5（连贯性/衔接/一致性/风格全 5 分）
- 语义分析：段落 3 相似度 5/5，段落 5 相似度 5/5
- 评估 Agent 稳定：重试机制有效处理偶发空响应

### 下一步

Phase 4：交互式流水线 + CLI 候选选择

---

## 2026-05-17 — Phase 4 完成

### 完成内容

**多候选生成** (`src/rewrite_engine/agents/generator.py`)
- `generate_candidates()`：单次 LLM 调用生成 N 个不同风格改写
- 专用 Prompt 要求候选在句式、措辞、侧重点上有明显差异
- `---CANDIDATE---` 分隔符解析，自动截断到 target count

**SchedulerAgent 交互式扩展** (`src/rewrite_engine/agents/scheduler.py`)
- `start_step(para_idx)`：准备状态机进入特定段落的改写步骤
- `generate_candidates_for_current()`：调用生成Agent 获取候选列表
- `select_candidate(choice_index)`：用户选择 → 锁定段落 → 推进状态
- `StepResult` 新增 `candidates` / `chosen_index` 字段记录丰富历史

**交互式流水线** (`src/rewrite_engine/pipelines/interactive.py`)
- `InteractiveSession`：管理完整交互式会话生命周期
  - `get_candidates()`：获取候选（支持 regenerage）
  - `select()`：确认选择并推进
  - `current_article_view()`：带状态标记的文章视图
- `run_interactive_session()`：会话工厂函数

**CLI 交互式 UI** (`src/rewrite_engine/cli/main.py`)
- 使用 `rich` 构建交互式终端界面：
  - `Panel` 展示当前文章状态（green 已确认 / yellow 待改写 / dim 未触碰）
  - `Panel` 逐个展示改写候选
  - `Prompt.ask()` 交互式选择
- 支持操作：选择候选(1-N)、重新生成(r)、跳过保留原文(s)
- 完成后可选运行校验和语义分析

### 验证结果

```
printf "1\n1\n" | rewrite data/sample-article.txt --paragraphs 2 4 --mode interactive
```
- 步骤 1：段落 3 生成 3 个候选，风格差异明显（句式/措辞/侧重点不同）
- 步骤 2：段落 5 基于段落 3 已确认版本生成候选，上下文继承正确
- 文章状态面板清晰展示：✓ 已确认 / ✎ 待改写 / 无标记原文
- 双文档上下文策略在交互式模式中正确运行

### 下一步

Phase 5：评估脚本 + 测试用例
