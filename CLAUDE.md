# Rewrite — 全文部分段落改写

一个支持全自动（Mode 1）和交互式（Mode 2）两种模式的段落改写应用。用户在提交的文章中指定若干段落，系统在保持全文逻辑连贯性的前提下仅改写目标段落。

交互式模式采用双栏并排 Diff 视图（类似 VS Code Git Diff），支持批量段落选择、并行流式生成、逐段审查（接受/指导重写/手动编辑）和多轮增量改写。

## 技术栈

- **后端**：Python 3.14 / FastAPI / Pydantic / SSE
- **前端**：React + Vite + Tailwind CSS
- **LLM 集成**：OpenAI SDK + Ollama（不引入 langchain / llama-index）

## 架构概览

多 Agent 协作，调度 Agent 为中心协调者：

| Agent | 状态 | 职责 |
|-------|------|------|
| 调度Agent | 有状态 | 状态机、上下文组装、任务编排、多轮会话管理 |
| 生成Agent | 无状态 | 段落改写（含流式输出）/ 指导式重写 / 全文生成 |
| 校验Agent | 无状态 | 语义一致性 & 逻辑连贯性检查 |
| 语义分析Agent | 无状态 | 相似度计算、差异摘要 |

LLM Provider 通过 `config.yaml` 配置。复制 `config.yaml.example` 并设置环境变量注入 API Key。

## 项目结构

```
Rewrite/
├── CLAUDE.md               # 项目信息（本文件）
├── config.yaml             # 模型 & 应用配置
├── config.yaml.example     # 配置模板（git 跟踪）
├── pyproject.toml
├── docs/                   # 技术规范 & 开发日志
├── data/                   # 测试示例文章
├── src/
│   ├── models/             # 数据模型
│   ├── llm/                # LLM Provider 抽象 & 实现
│   ├── agents/             # 4 个 Agent
│   ├── pipelines/          # Mode 1 / Mode 2 流水线
│   ├── api/                # FastAPI 服务
│   └── cli/                # CLI 入口
├── web/                    # 前端 React 应用
│   └── src/
│       ├── components/     # UI 组件
│       ├── hooks/          # 自定义 Hooks
│       └── types.ts        # 共享类型定义
└── tests/
```

## 交互式模式设计（Phase 7）

### 双栏 Diff 视图

```
┌──────────────────────────┬───────────────────────────┐
│    当前稿（可点击选中）    │      改写结果（流式生成）   │
├──────────────────────────┼───────────────────────────┤
│ □ 段落1  (未选中)        │ 段落1  (不变)              │
│ ☑ 段落2  (待改写) ←──── │ ██████░░░░ 流式生成中...   │
│ ☑ 段落3  (待改写)       │ [接受] [指导重写] [编辑]   │
│ □ 段落4  (未选中)        │ 段落4  (不变)              │
└──────────────────────────┴───────────────────────────┘
│ [重写选中段落]  [提交本轮]    Round 1  │ 模型选择 ▼  │
```

### 操作流程

1. 左侧点击段落卡片选中（☑），可多选
2. 点击「重写选中段落」→ 批量并行流式生成 → 右侧逐 token 实时展现
3. 逐段审查：接受 / 指导重写（内联指令框）/ 手动编辑
4. 全部确认后「提交本轮」→ 右侧合入左侧成为新的当前稿
5. 可继续选择段落，开始新一轮（Round N）

### 核心特性

- **并行流式输出**：每个段落独立 SSE stream，所有段落同时流式渲染
- **内联指导框**：每段右侧卡片可展开指令输入区，支持指导式重写
- **多轮增量**：提交后状态重置，文章保留，可追加新段落继续改写
- **前端配置面板**：模型选择、temperature、candidates 数等在 UI 中配置

## API 端点

### 改写核心
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/rewrite/auto` | POST | Mode 1 全自动改写 |
| `/api/rewrite/stream/rewrite` | POST | SSE 并行流式改写 |
| `/api/rewrite/stream/regenerate` | POST | SSE 指导式单段重写 |
| `/api/rewrite/session/create` | POST | 创建多轮会话 |
| `/api/rewrite/session/{id}/start-round` | POST | 开始新一轮 |
| `/api/rewrite/session/{id}/record` | POST | 记录单段结果 |
| `/api/rewrite/session/{id}/commit` | POST | 提交当前轮次 |
| `/api/rewrite/session/{id}` | GET | 查询会话状态 |

### 配置 & 工具
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET/PUT | 读取/更新运行时配置（含模型 CRUD） |
| `/api/health` | GET | 健康检查 |

### 认证 & 管理
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | Access Key 登录 |
| `/api/auth/verify` | POST | 验证 token |
| `/api/auth/logout` | POST | 销毁 token |
| `/api/admin/users` | GET/POST/DELETE | 管理员管理用户 |

### 调试
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/debug/logs` | GET | 获取后端日志 |
| `/api/debug/sessions` | GET | 列出当前用户的会话 |

## 开发约定

- 调度 Agent 是唯一有状态的组件，其他 Agent 为无状态函数
- 上下文管理采用双文档策略：原始文档（不变） + 当前文档（随改写推进更新）
- 不引入 langchain / llama-index 等重型框架
- LLM 调用全部通过 provider 抽象层，不在业务代码中直接调用 API
- 流式输出使用 SSE（Server-Sent Events），前端通过 fetch + ReadableStream 消费
- 使用 `uv` 管理 Python 依赖

## 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 数据模型 + LLM Provider + 单段改写 | ✅ |
| Phase 2 | 调度Agent 状态机 + Mode 1 全自动 | ✅ |
| Phase 3 | 校验Agent + 语义分析Agent | ✅ |
| Phase 4 | 交互式流水线 + CLI 候选选择 | ✅ |
| Phase 5 | 评估脚本 + 测试用例 | ✅ |
| Phase 6 | React 前端基础版 | ✅ |
| Phase 7 | 交互式模式重设计（双栏 Diff + 流式 + 多轮） | ✅ |
| Phase 8 | 结果导出 + 配置抽屉 + 历史记录（localStorage） | ✅ |
| Phase 9 | 版本回溯（段落级版本管理 + 对比） | ✅ |
| Phase 10 | 用户认证（Access Key + 管理员面板） | ✅ |
| Phase 11 | DEBUG 模式（进度控制 + 日志面板） | ✅ |
| **Phase 12** | 多语言 i18n（中文 + 英文） | 📋 |

## Phase 8+ 特性概览

| 特性 | 说明 |
|------|------|
| **复制/下载** | 结果区一键复制全文或下载 .txt |
| **配置抽屉** | 右侧滑出面板，配置模型、temperature、新增/删除模型 |
| **历史记录** | localStorage 存储会话，支持断点续改 |
| **版本回溯** | 每个段落可查看/恢复历史版本（按轮次+时间标记） |
| **用户认证** | Access Key 纯 Key 认证，管理员可管理用户和查看日志 |
| **DEBUG 模式** | `?debug=true` 开启，FAB 日志面板 + 段落终止/重试按钮 + 进度条 |
| **多语言** | react-i18next，中文/英文切换 |

### Phase 12: 多语言 i18n 规划

- **方案**：轻量自定义 i18n context（避免引入 react-i18next 重型依赖）
- **翻译文件**：`web/src/locales/zh-CN.json`、`en.json`
- **范围**：所有 UI 文本、按钮、badge、提示、错误消息、空状态
- **切换**：Header 🌐 按钮，localStorage 持久化语言偏好
- **实施步骤**：
  1. 创建 i18n context + TranslationProvider + useTranslation hook
  2. 编写中英文翻译文件
  3. 替换所有组件和 hooks 中的硬编码中文字符串
  4. Header 添加语言切换按钮

详见 `docs/tech-spec.md`
