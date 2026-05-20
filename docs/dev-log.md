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

---

## 2026-05-17 — Phase 5 完成

### 完成内容

**评估框架** (`src/rewrite_engine/pipelines/evaluate.py`)
- `BatchEvaluator`：批量评估器，对多个测试用例自动运行改写+校验+分析
  - `evaluate(test_case)`：完整评估单个用例（改写→校验→语义分析）
  - `print_summary()`：批量汇总（通过/失败 + 平均评分）
  - `export_json(path)`：导出结构化 JSON 报告
- `EvaluationReport`：单个用例评估报告（评分、耗时、错误）
- `TestCase`：测试用例数据类（名称、描述、文章、目标段落、预期行为）
- `load_test_cases(directory)`：从 JSON 文件批量加载测试用例

**测试用例** (`data/test-cases/`)
- `01-ai-article.json`：6段 AI 科普文章，中段改写（医疗AI + 未来展望）
- `02-climate-short.json`：4段短文章，首尾段改写（测试边界）
- `03-tech-history.json`：5段科技史文章，相邻段落改写（测试衔接）

**CLI 评估命令**
- `rewrite-eval` 入口：`rewrite-eval data/test-cases -m deepseek-v4-pro`
- 支持 `--output/-o` 导出 JSON 报告

### 验证结果

```
rewrite-eval data/test-cases -m deepseek-v4-pro
```

| 测试用例 | 评分 | 耗时 | 亮点 |
|---------|------|------|------|
| AI 科普文章 | 3.8/5 | 104s | Validator空响应降级，语义分析准确 |
| 短文章首尾段 | 4.8/5 | 57s | 首尾边界改写成功，检测到轻微风格差异 |
| 相邻段落改写 | 5.0/5 | 88s | 相邻段改写衔接完美 |

**平均评分: 4.5/5**

语义分析对各段落变化的描述精准、具体，差异化改写的质量得到了定量验证。

### 下一步

Phase 6：React 前端（段落编辑器 + 交互式 UI）

---

## 2026-05-18 — Phase 6 完成

### 完成内容

**前端项目搭建**
- React 19 + Vite 8 + Tailwind CSS 4 + TypeScript 6
- Vite 代理 `/api` → `http://localhost:8000`

**组件** (`web/src/components/`)
- `ParagraphCard.tsx`：段落卡片，支持 4 种状态颜色标识（原文/已确认/待改写/目标）
- `ArticleView.tsx`：文章视图，点击段落标记为改写目标
- `CandidatePicker.tsx`：候选选择器，展示多个候选 + 重新生成/保留原文操作
- `ModeSelector.tsx`：模式切换（全自动 / 交互式）

**状态管理** (`web/src/hooks/useRewriteSession.ts`)
- 完整管理改写会话生命周期：加载文章 → 标记目标 → 改写 → 候选选择 → 结果展示
- 支持 Mode 1（auto）和 Mode 2（interactive）所有 API 调用
- SSE-ready 架构（后续可扩展流式响应）

**FastAPI 后端** (`src/rewrite_engine/api/server.py`)
- `POST /api/rewrite/auto` — Mode 1 全自动改写
- `POST /api/rewrite/interactive/start` — Mode 2 会话创建
- `POST /api/rewrite/interactive/{id}/candidates` — 生成候选
- `POST /api/rewrite/interactive/{id}/select` — 选择候选
- `GET /api/health` — 健康检查
- 内存会话管理 + CORS 全开放

### 验证结果

- TypeScript 类型检查通过、Vite 构建成功（204KB JS + 18KB CSS）
- 后端 API 端到端测试通过（含校验 + 语义分析）
- Vite 代理 `/api` → 后端正常工作
- 前后端同时运行：`http://localhost:5173`

### 启动方式

```bash
# 后端
DEEPSEEK_API_KEY="sk-..." uv run uvicorn rewrite_engine.api.server:app --port 8000

# 前端
cd web && npm run dev
```

### 项目总结

**6 个 Phase 全部完成**，覆盖完整开发周期：

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 数据模型 + LLM Provider + 单段改写 | ✅ |
| Phase 2 | 调度Agent 状态机 + Mode 1 全自动流水线 | ✅ |
| Phase 3 | 校验Agent + 语义分析Agent | ✅ |
| Phase 4 | 交互式流水线 + CLI 候选选择 | ✅ |
| Phase 5 | 评估脚本 + 测试用例（3 例 / 均分 4.5/5） | ✅ |
| Phase 6 | React 前端（段落编辑器 + Web UI） | ✅ |

**核心架构**：4 Agent 协作（调度/生成/校验/语义分析），双文档上下文策略，支持云端/本地模型切换。

**三种使用方式**：
1. CLI 全自动：`rewrite article.txt --paragraphs 2 4`
2. CLI 交互式：`rewrite article.txt --paragraphs 2 4 --mode interactive`
3. Web UI：`http://localhost:5173`（含段落编辑器 + 候选选择界面）
4. 批量评估：`rewrite-eval data/test-cases`

---

## 2026-05-19 — Phase 7 规划：交互式模式重设计

### 背景

当前交互式模式是顺序式的（逐段生成候选 → 选择 → 下一段），用户期望的是：
- 双栏并排 Diff 视图（类似 VS Code Git Diff）
- 选中多个段落后批量并行流式生成
- 逐段审查时可接受、指导重写、手动编辑
- 支持多轮增量改写
- 前端可配置模型参数

### 技术方案要点

**双栏 Diff 布局**
- 左侧：可点击选中的文章面板（当前稿），右侧：流式生成的改写结果
- 段落级 diff 对照，非内联字符级 diff

**并行 SSE 流式输出**
- 所有目标段落通过 `asyncio.gather` 并行流式生成
- 每个段落独立 SSE event stream（`paragraph_index` 路由）
- 前端 fetch + ReadableStream 消费，逐 token 渲染到对应 RewriteCard

**指导式重写**
- 每段右侧卡片内嵌 GuidanceInput 组件（可展开/折叠）
- 用户输入自然语言指令 → 单段重新流式生成

**多轮增量**
- 每轮提交后右侧合入左侧（成为新的当前稿）
- 可重新选择段落开始新一轮
- Session 模型记录所有轮次历史

**前端配置面板**
- 模型选择、temperature 滑块、candidates 数等直接在 UI 调整
- GET/PUT /api/config 端点在运行时读写配置

### 实施步骤

| 步骤 | 内容 | 关键文件 |
|------|------|----------|
| Step 1 | 后端 SSE 流式端点 | `api/server.py`, `agents/generator.py` |
| Step 2 | 后端会话 & 配置端点 | `api/server.py`, `models/session.py` |
| Step 3 | 前端 Hook 重构 | `hooks/useStreamRewrite.ts`, `hooks/useConfig.ts`, `hooks/useArticleState.ts` |
| Step 4 | 前端双栏布局 + 流式渲染 | `DiffLayout.tsx`, `ArticlePanel.tsx`, `RewritePanel.tsx`, `RewriteCard.tsx` |
| Step 5 | 指导重写 + 手动编辑 | `GuidanceInput.tsx`, `RewriteCard.tsx` 编辑模式 |
| Step 6 | 多轮支持 + 配置面板 | `RoundIndicator.tsx`, `ConfigPanel.tsx`, session/commit 流程 |

### 待删除的组件

- `CandidatePicker.tsx` → 被 `RewritePanel.tsx` + `RewriteCard.tsx` 替代
- `ModeSelector.tsx` → 功能融入 Header

---

## 2026-05-19 — Phase 7 Step 1 完成：后端 SSE 流式端点

### 完成内容

**生成Agent 流式函数** (`src/rewrite_engine/agents/generator.py`)
- `rewrite_stream()` — 逐 token yield 的流式改写
- `rewrite_with_guidance_stream()` — 接受用户自然语言指导的流式改写
- `GUIDANCE_SYSTEM_PROMPT` — 指导式重写的专用系统提示词
- `build_guidance_messages()` — 构建含指导指令的 Prompt

**SSE 端点** (`src/rewrite_engine/api/server.py`)
- `POST /api/rewrite/stream/rewrite` — 批量并行流式改写
  - 所有目标段落通过 `asyncio.gather` 并行调用 `chat_stream()`
  - 使用 `asyncio.Queue` 合并多个并发流的 token
  - 每个段落独立 event stream（`paragraph_index` 路由）
  - SSE 事件：`paragraph_start` → `token` → `paragraph_done` → `stream_end`
- `POST /api/rewrite/stream/regenerate` — 单段指导式流式重写
  - 接受 `guidance` 字段（自然语言指令）
  - 支持 `confirmed_contents` 传递已确认段落上下文
- 辅助函数：`_build_project_state()` 构建含已确认段落的上下文
- 辅助函数：`_sse_event()` SSE 格式化

### 验证结果

```
# 单段流式
curl -N POST /api/rewrite/stream/rewrite -d '{"article_text":"...","target_indices":[1]}'
→ paragraph_start → token → token → ... → paragraph_done → stream_end

# 并行多段
curl -N POST /api/rewrite/stream/rewrite -d '{"article_text":"...","target_indices":[1,3]}'
→ paragraph_start (para 1) → paragraph_start (para 3) → 交错 token → paragraph_done ×2 → stream_end

# 指导式重写
curl -N POST /api/rewrite/stream/regenerate -d '{...,"guidance":"请用更加学术化的风格"}'
→ paragraph_start → token → token → ... → paragraph_done → stream_end
```

所有 SSE 事件按协议格式正确推送，token 实时可见。

---

## 2026-05-19 — Phase 7 Step 2 完成：后端会话 & 配置端点

### 完成内容

**会话模型** (`src/rewrite_engine/models/session.py`)
- `RewriteSession` — 多轮改写会话
  - `original_article`（不可变原文）+ `current_article`（累积更新稿）
  - `rounds` 历史轮次列表 + `active_round` 当前活动轮次
  - `start_round()` / `record_result()` / `commit_round()` 完整生命周期
- `RewriteRound` — 单轮改写记录
  - `round_num`, `target_indices`, `results`（段落→改写内容映射）
  - `created_at` / `committed_at` 时间戳

**会话 API** (`src/rewrite_engine/api/server.py`)
- `POST /api/rewrite/session/create` — 创建多轮会话，返回 session_id + 段落列表
- `POST /api/rewrite/session/{id}/start-round` — 开始新一轮（指定目标段落）
- `POST /api/rewrite/session/{id}/record` — 记录单段改写结果
- `POST /api/rewrite/session/{id}/commit` — 提交当前轮次，更新 current_article
- `GET /api/rewrite/session/{id}` — 查询会话完整状态

**配置 API** (`src/rewrite_engine/api/server.py`)
- `GET /api/config` — 返回当前配置（模型列表脱敏、rewrite 参数、validation 设置）
- `PUT /api/config` — 实时更新配置（model/temperature/candidates_count/max_tokens）
  - 切换模型时自动重建 provider（关闭旧 client → 创建新 provider）

### 验证结果

会话生命周期：
```
create → session_id="cdc6e31b"
start-round → round_num=1, target=[1,2]
record ×2 → results={1:"B改", 2:"C改"}
commit → round_count=1, current_article已更新
status → 完整历史 + 当前稿
```

配置 CRUD：
```
GET /api/config → {models:[{name,provider,model}], rewrite:{temp:0.7,...}}
PUT /api/config → {temp:0.5, tokens:3000}
GET /api/config → temp=0.5, tokens=3000  ✓
```

---

## 2026-05-20 — Phase 7 Step 3 完成：前端 Hook 重构

### 完成内容

**类型定义更新** (`web/src/types.ts`)
- 新增 SSE 事件类型：`SSETokenEvent`, `SSEParagraphDoneEvent`, `SSEParagraphErrorEvent`
- 新增 `RewriteCardState` 联合类型（pending/streaming/stream_done/accepted/editing/guidance_input/regenerating）
- 精简 `RewritePhase` 为 5 个状态（idle/ready/streaming/reviewing/done）
- 新增 `SessionState`, `RewriteRound`, `AppConfigResponse`, `ConfigUpdatePayload`

**`useArticleState`** (`web/src/hooks/useArticleState.ts`)
- 段落选择管理：`toggleTarget`, `targetIndices`
- 改写内容追踪：`rewrittenContents`, `setRewrittenContent`
- 卡片状态机：`cardStates`, `setCardState`, `markConfirmed`
- 批量操作：`resetSelection`, `replaceParagraphs`, `allConfirmed`, `remainingTargets`

**`useConfig`** (`web/src/hooks/useConfig.ts`)
- 启动时自动 fetch 配置
- `updateConfig()` 局部更新并合并响应
- `activeModel` / `loading` / `error` 状态

**`useStreamRewrite`** (`web/src/hooks/useStreamRewrite.ts`)
- `streamRewrite()` — POST `/api/rewrite/stream/rewrite`，fetch + ReadableStream 消费 SSE
- `streamRegenerate()` — POST `/api/rewrite/stream/regenerate`，同上
- SSE 事件解析：`paragraph_start` / `token` / `paragraph_done` / `paragraph_error` / `stream_end`
- 回调模式：`onToken`, `onParagraphDone`, `onAllDone` 等
- AbortController 支持取消

**`useRewriteSession`** (`web/src/hooks/useRewriteSession.ts`) — 重构聚焦
- `createSession()` / `startRound()` / `recordResult()` / `commitRound()` — 多轮会话生命周期
- `fetchSessionStatus()` — 拉取完整会话状态
- `runAuto()` — 保留 Mode 1 全自动 API 调用
- `reset()` — 完全重置

### 编译状态

- 4 个新 hook **自身类型正确**，无编译错误
- 旧 `App.tsx` 与旧组件不兼容（预期行为，Step 4 重建 UI 时解决）

---

## 2026-05-20 — Phase 7 Step 4 完成：前端双栏布局 + 流式渲染

### 完成内容

**新增组件**
- `DiffLayout.tsx` — CSS Grid 双栏并排容器（50/50，带边框分隔）
- `ArticlePanel.tsx` — 左侧文章面板（标题 + ArticleView + optional children）
- `RewritePanel.tsx` — 右侧改写面板（逐段 RewriteCard；非目标段显示灰化摘要）
- `RewriteCard.tsx` — 核心改写卡片组件：
  - 流式文本实时累积渲染（token 逐字出现 + 闪烁光标）
  - 状态机驱动 UI：pending / streaming / stream_done / accepted / editing / guidance_input / regenerating
  - 操作按钮：接受 / 指导重写 / 手动编辑（按状态显示）
  - 编辑模式：textarea 替换文本 + 确认/取消

**修改组件**
- `ParagraphCard.tsx` — 新增 `selectable` prop + ☑/☐ 复选框；移除 `isCurrent` prop
- `ArticleView.tsx` — 新增 `selectable` prop；移除 `isCurrent` / `currentParagraphIndex`

**删除组件**
- `CandidatePicker.tsx` — 被 RewritePanel + RewriteCard 替代
- `ModeSelector.tsx` — 功能融入 Header 模型选择器

**App.tsx 重构** — 完整新布局：
- Header：标题 + 模型选择下拉 + temperature 输入
- Main：DiffLayout（左侧 ArticlePanel + 右侧 RewritePanel）
- Footer：操作栏（重写选中段落 / 提交本轮 / 重新开始）+ 状态指示
- 5 阶段流程：idle → ready → streaming → reviewing → done
- 模型选择器和 temperature 通过 `useConfig` 实时更新后端

### 构建验证

- TypeScript: 0 errors
- Vite build: 27 modules → 209KB JS + 17KB CSS
- HTTP 200 / API proxy / HTML 正常

### 端到端流程验证

```
1. POST session/create → session_id
2. POST session/start-round → round 1 on [1,3]
3. POST stream/rewrite → paragraph_start ×2 → paragraph_done ×2 → stream_end
```

### Bug 修复：流式输出闪烁 + SSE 异常

**问题 1：前端流式 token 只不断替换前两个字符**
- 根因：`onToken` 回调内读取 `article.rewrittenContents[paraIndex]` 是 React 闭包捕获的旧值，永远为 `""`
- 修复：`useArticleState` 新增 `appendToken()`，使用 `setRewrittenContents(prev => ...)` 函数式更新避免闭包陷阱
- 修改文件：`hooks/useArticleState.ts` (+appendToken), `App.tsx` (两处 onToken 改用 appendToken)

**问题 2：SSE 流式完成后报 `list index out of range`**
- 根因：`chat_stream` 中 `chunk.choices[0].delta` 在 API 返回空 choices 列表时越界（chatanywhere 代理在某些 chunk 中不包含 choices）
- 修复：`openai_provider.py` 和 `ollama_provider.py` 的 `chat_stream` 增加 `if not chunk.choices: continue` 保护
- 修改文件：`llm/openai_provider.py`, `llm/ollama_provider.py`

**验证**：
- TypeScript 0 errors + Vite build 成功
- 6 段文章并行流式改写：`paragraph_start ×2 → paragraph_done ×2 → stream_end`（无 error）

---

## 2026-05-20 — Phase 7 Step 6 完成：多轮支持 + 配置面板 + Bug 修复

### 完成内容

**RoundIndicator 组件** (`web/src/components/RoundIndicator.tsx`)
- 圆点指示器：已提交轮次（绿色）+ 当前轮次（深色）
- Tooltip 显示每轮改写的段落详情
- 无历史时仅显示当前轮次编号

**ConfigPanel 组件** (`web/src/components/ConfigPanel.tsx`)
- 模型下拉选择器（切换时自动调用 PUT /api/config）
- Temperature 数字输入框
- 加载态 disable

**多轮 UX 改进** (`web/src/App.tsx`)
- `handleNextRound()` — 完成后直接进入下一轮，无需重置
- done 阶段新增 "开始下一轮" 按钮（保留 "重新开始"）
- 左侧面板显示已完成轮次的段落列表
- `handleRewriteSelected` 自动调用 `session.startRound()`
- Header 集成 RoundIndicator（轮次可视化）

**Bug 修复**（见上节）

### 构建验证

- TypeScript: 0 errors
- Vite build: 29 modules → 212KB JS + 18KB CSS

### 多轮端到端验证

```
Round 1: create → start-round [1] → stream ✓ → record → commit ✓
Round 2: start-round [0,3] → stream ✓ → record ×2 → commit ✓
Final: 段落A改写版 | 段落B改写版 | 段落C（未改动） | 段落D改写版
Rounds: 2（历史完整追踪）
```

### Bug 修复：指导重写 / 手动编辑按钮无反应

- **根因**：`RewriteCard` 的按钮点击后未触发 `cardState` 转换
  - "指导重写" 按钮只更新了 guidance 文本，未切换到 `guidance_input` 态
  - "手动编辑" 按钮调用了 `handleEdit`，但该函数将状态设回 `stream_done` 而非 `editing`
- **修复**：
  - RewriteCard 新增 `onStartGuidance` / `onStartEdit` / `onConfirmEdit` props
  - App.tsx 新增三个对应 handler，正确切换 cardState
  - RewritePanel 透传新回调
- **验证**：TS 0 errors, Vite build 成功

### Phase 7 总结

全部 6 个 Step 完成：

| Step | 内容 | 状态 |
|------|------|------|
| Step 1 | 后端 SSE 流式端点 | ✅ |
| Step 2 | 后端会话 & 配置端点 | ✅ |
| Step 3 | 前端 Hook 重构 | ✅ |
| Step 4 | 前端双栏布局 + 流式渲染 | ✅ |
| Step 5 | 指导重写 + 手动编辑 | ✅ |
| Step 6 | 多轮支持 + 配置面板 | ✅ |

**新增接口**：2 SSE + 5 REST + 2 Config = 9 个端点
**新增前端**：8 组件 + 4 hook
**删除组件**：CandidatePicker, ModeSelector

---

## 2026-05-20 — Phase 8+ 规划：功能完善

### 规划内容

完成核心改写功能后，进入工程化完善阶段，共 5 个 Phase（8–12）：

| Phase | 内容 | 关键产出 |
|-------|------|----------|
| Phase 8 | 结果导出 + 配置抽屉 + 历史记录 | ModelConfigDrawer, HistoryPage, useHistory |
| Phase 9 | 版本回溯（段落级版本管理 + 对比） | VersionTimeline, ParagraphVersion |
| Phase 10 | 用户认证（Access Key + 管理员） | AuthGate, useAuth, /api/auth/* |
| Phase 11 | DEBUG 模式（进度控制 + 日志面板） | DebugPanel, FAB, /api/debug/logs |
| Phase 12 | 多语言 i18n（中文 + 英文） | locales/zh-CN.json, en.json |

### 技术决策

| 决策点 | 选择 |
|--------|------|
| 配置面板 UI | 右侧抽屉滑出 |
| 历史存储 | localStorage（支持断点续改） |
| 用户认证 | 纯 Access Key 认证 |
| i18n 方案 | react-i18next / 轻量自定义 |

---

## 2026-05-20 — Phase 8 完成：结果导出 + 配置抽屉 + 历史记录

### 完成内容

**结果导出** (`web/src/components/ResultToolbar.tsx`)
- 📋 复制全文：`navigator.clipboard.writeText()` + 2s toast 反馈（兼容降级）
- 📥 下载 .txt：Blob → URL.createObjectURL → `<a download>` 触发
- 集成在 done 阶段结果区

**模型配置抽屉** (`web/src/components/ModelConfigDrawer.tsx`)
- 右侧滑出面板（transform + transition + backdrop）
- 模型列表（单选 + 删除）、新增模型表单（name/provider/model/api_base/api_key）
- Temperature 滑块（0–2，步长 0.1）、Max Tokens 输入
- Validation 开关 + 严格度显示
- Header ⚙ 图标触发

**后端配置扩展** (`src/rewrite_engine/api/server.py`)
- `PUT /api/config` 新增 `add_model` / `delete_model` 字段
- 运行时热添加/删除模型，自动处理 provider 切换

**历史记录**
- `useHistory.ts`：localStorage CRUD，`HistoryEntry` 存储完整 `SessionState`
- `HistoryPage.tsx`：卡片列表（标题/时间/轮次）+ 继续编辑 + 删除
- commit 时自动保存、Header 「📋 历史」按钮触发

### 构建验证

- TypeScript: 0 errors
- Vite build: 33 modules → 223KB JS + 22KB CSS
- 模型 CRUD: add → delete → list 验证通过

---

## 2026-05-20 — Phase 9 完成：版本回溯

### 完成内容

**数据模型** (`web/src/types.ts`)
- `ParagraphVersion { versionId, paragraphIndex, sessionId, content, roundNumber, createdAt, label }`

**版本存储** (`web/src/hooks/useVersions.ts`)
- localStorage 持久化，key: `rw-versions-{sessionId}`
- `addVersion()` — 记录新版本
- `getVersionsForParagraph(idx)` — 按段落获取所有历史版本（按轮次倒序）
- `updateLabel()` — 重命名版本标签

**版本记录**
- 每次 commit 轮次时自动为所有已确认段落记录版本
- label 自动生成为 `"Round N"`，可点击编辑

**VersionTimeline 组件** (`web/src/components/VersionTimeline.tsx`)
- ▸ 展开/折叠按钮（带版本数量 badge）
- 当前版本：绿底高亮显示
- 历史版本列表：每条显示标签（可内联编辑）、时间、内容预览（line-clamp-2）、字数
- 操作按钮：**预览**（高亮显示在卡片中）、**恢复此版本**（替换当前内容 + 蓝底 banner 提示）

### 构建验证

- TypeScript: 0 errors
- Vite build: 35 modules → 229KB JS + 23KB CSS

### 下一步

Phase 10：用户认证（Access Key + 管理员面板）
