# 交互式模式重设计 — 双栏 Diff + 流式输出 + 多轮改写

## Context

当前交互式模式的 UX 是顺序式的：每段逐一生成候选 → 选择 → 下一段。用户期望的是更像 VS Code Git Diff 的体验：左侧原文、右侧改写结果，选中多个段落后批量流式生成，然后逐段审查（接受/指导重写/手动编辑），全部确认后进入下一轮。

## 目标交互流程

```
┌──────────────────────────────────────────────────────────────┐
│                       全文段落改写                            │
├──────────────────────────┬───────────────────────────────────┤
│       原文 / 当前稿       │         改写结果                   │
│                          │                                   │
│   □ 段落1  (原文)        │  段落1  (不变)                     │
│   ☑ 段落2  (待改写) ←── │  ████████░░░░ 流式生成中...       │
│   ☑ 段落3  (待改写)     │  ┌─────────────────────────┐      │
│   □ 段落4  (原文)        │  │ 改写后的段落3内容...     │      │
│                          │  │                         │      │
│                          │  │ [接受] [指导重写] [编辑] │      │
│                          │  └─────────────────────────┘      │
│                          │  段落4  (不变)                     │
├──────────────────────────┴───────────────────────────────────┤
│ [重写选中段落]  [重置]       模型: [deepseek-v4-pro ▼]       │
└──────────────────────────────────────────────────────────────┘
```

### 操作流程

1. 用户输入文章 → 左侧展示全文
2. 点击左侧段落卡片选中（☑ 标记），可多选
3. 点击「重写选中段落」→ 批量并行流式生成 → 右侧实时逐 token 展现
4. 生成完毕后，每段右侧有操作按钮：
   - **接受**：确认该段改写，该行变为已确认状态
   - **指导重写**：展开内联输入框，用户输入指令（如"语气更正式"），重新流式生成
   - **手动编辑**：右侧内容变为可编辑文本框，用户直接修改
5. 所有段落确认后 → 右侧内容成为新的「当前稿」→ diff 消失 → 用户可选择新段落开始下一轮
6. 支持多轮：每轮完成后，当前稿 = 原稿，可重新选择段落继续改写

### 核心特性

- **双栏并排 diff**：左侧始终展示当前稿，右侧展示改写结果
- **并行流式输出**：每个段落的改写通过独立 SSE stream 推送，前端同时渲染
- **内联指导框**：每段右侧卡片内包含一个可展开的指令输入区
- **多轮增量改写**：每轮确认后状态重置但文章保留，支持追加段落
- **前端配置面板**：模型选择、temperature、候选数等在 UI 中配置

## 后端改动

### 1. SSE 流式端点

新增 SSE 端点，替代当前的阻塞式候选生成：

**`POST /api/rewrite/stream/rewrite`**
- Body: `{ article_text, target_indices: [int], guidance?: string }`
- Response: `text/event-stream`
- 每个 target paragraph 返回独立的流，event 格式：
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
- 对每个段落调用 `provider.chat_stream()`，逐步推送给客户端
- 所有段落**并行**流式输出（使用 `asyncio.gather`）

**`POST /api/rewrite/stream/regenerate`**
- Body: `{ article_text, paragraph_index, guidance: str, current_state: {confirmed: [int], locked_content: {idx: str}} }`
- 单段落流式重写，接受用户指导指令
- 同样 `text/event-stream`

### 2. 会话持久化端点

**`POST /api/rewrite/session/create`**
- Body: `{ article_text }`
- 创建新会话，返回 `session_id`
- 会话存储：`{ article: Article, rounds: [{target_indices, confirmed, rewritten_content}] }`

**`POST /api/rewrite/session/{id}/commit`**
- Body: `{ confirmed_content: {paragraph_index: content} }`
- 提交当前轮次的所有确认改写，更新当前稿

### 3. 配置端点

**`GET /api/config`**
- 返回当前 `AppConfig`（脱敏，不返回 api_key 实际值）

**`PUT /api/config`**
- 接受 `{ model?: string, temperature?: float, candidates_count?: int, max_tokens?: int }`
- 更新运行时配置

### 4. Provider 支持

当前 `LLMProvider.chat_stream()` 已在 `openai_provider.py` 和 `ollama_provider.py` 中实现，无需改动。只需在 generator 中新增流式调用函数。

### 5. Generator 新增函数

```python
# generator.py 新增
async def rewrite_stream(
    provider: LLMProvider,
    state: ProjectState,
) -> AsyncIterator[str]:
    """流式改写当前 TO_REWRITE 段落，yield 每个 token"""
    
async def rewrite_with_guidance_stream(
    provider: LLMProvider,
    state: ProjectState,
    guidance: str,
) -> AsyncIterator[str]:
    """根据用户指导流式改写段落"""
```

### 6. 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/rewrite_engine/api/server.py` | 新增 SSE 端点、会话端点、配置端点；将 `_sessions` 改为结构化的 session store |
| `src/rewrite_engine/agents/generator.py` | 新增 `rewrite_stream()`, `rewrite_with_guidance_stream()` |
| `src/rewrite_engine/models/config.py` | 添加 `ConfigUpdateRequest` 模型 |
| `pyproject.toml` | 添加 `sse-starlette` 依赖 |

## 前端改动

### 1. 组件重构

**删除**：
- `CandidatePicker.tsx` → 替换为 `RewritePanel.tsx`
- `ModeSelector.tsx` → 融入 Header

**新增**：
- `DiffLayout.tsx` — 双栏并排布局容器（flex/grid，左右各 50%）
- `ArticlePanel.tsx` — 左侧文章面板（可点击选中段落）
- `RewritePanel.tsx` — 右侧改写结果面板（逐段展示改写 + 操作按钮）
- `RewriteCard.tsx` — 单个段落的改写结果卡片（含状态指示、流式文本、操作按钮、内联指导框）
- `GuidanceInput.tsx` — 内联指导输入组件（可展开/折叠）
- `ConfigPanel.tsx` — 前端配置面板（模型选择、temperature 滑块等）
- `RoundIndicator.tsx` — 轮次指示器（Round 1 / Round 2）

**修改**：
- `App.tsx` → 重构为新布局
- `ArticleView.tsx` → 简化，仅用于左侧面板
- `ParagraphCard.tsx` → 添加复选框、选中态样式

### 2. Hook 重构

当前 `useRewriteSession.ts` 是 14 个 state 的单体 hook，拆分为：

- `useRewriteSession.ts` — 会话管理（创建、提交轮次、重置）
- `useStreamRewrite.ts` — SSE 连接管理（EventSource 或 fetch + ReadableStream）
- `useConfig.ts` — 配置管理（从 API 读取/更新配置）
- `useArticleState.ts` — 文章状态（段落选择、确认状态、当前稿）

### 3. SSE 前端实现

```typescript
// useStreamRewrite.ts
async function streamRewrite(
  articleText: string,
  targetIndices: number[],
  onToken: (paraIndex: number, token: string) => void,
  onParagraphDone: (paraIndex: number, content: string) => void,
  onAllDone: () => void,
) {
  const response = await fetch('/api/rewrite/stream/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_text: articleText, target_indices: targetIndices }),
  });
  
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse SSE events from buffer...
    // Dispatch to onToken / onParagraphDone / onAllDone
  }
}
```

### 4. 状态管理

每篇改写结果卡片的状态机：
```
PENDING → STREAMING → STREAM_DONE → ACCEPTED
                                    → EDITING
                                    → GUIDANCE_INPUT → REGENERATING → STREAMING
```

### 5. 多轮支持

- 每轮完成后调用 `POST /api/rewrite/session/{id}/commit` 提交改写
- 前端重置选中状态，保留已修改的文章
- 用户可继续选择段落进入下一轮

### 6. 配置文件

| 文件 | 改动 |
|------|------|
| `web/src/App.tsx` | 重构为新布局 |
| `web/src/components/DiffLayout.tsx` | 新增 |
| `web/src/components/ArticlePanel.tsx` | 新增 |
| `web/src/components/RewritePanel.tsx` | 新增 |
| `web/src/components/RewriteCard.tsx` | 新增 |
| `web/src/components/GuidanceInput.tsx` | 新增 |
| `web/src/components/ConfigPanel.tsx` | 新增 |
| `web/src/components/RoundIndicator.tsx` | 新增 |
| `web/src/components/ArticleView.tsx` | 修改（添加选中交互） |
| `web/src/components/ParagraphCard.tsx` | 修改（添加复选框） |
| `web/src/hooks/useRewriteSession.ts` | 重构 |
| `web/src/hooks/useStreamRewrite.ts` | 新增 |
| `web/src/hooks/useConfig.ts` | 新增 |
| `web/src/hooks/useArticleState.ts` | 新增 |
| `web/src/components/CandidatePicker.tsx` | 删除 |
| `web/src/components/ModeSelector.tsx` | 删除 |
| `web/src/types.ts` | 增量更新 |

## 实施顺序

### Step 1: 后端流式端点
- 新增 `POST /api/rewrite/stream/rewrite` SSE 端点
- 新增 generator 的 `rewrite_stream()` 和 `rewrite_with_guidance_stream()`
- 验证：curl SSE endpoint 观察 token 流式输出

### Step 2: 后端会话 & 配置端点
- 新增 session create/commit 端点
- 新增 config GET/PUT 端点
- 验证：API 调用正确返回/更新配置

### Step 3: 前端 Hook 重构
- 拆分 `useRewriteSession` → 4 个 hook
- 实现 `useStreamRewrite` SSE 消费
- 验证：console 日志确认 SSE 解析正确

### Step 4: 前端双栏布局 + 流式渲染
- `DiffLayout` + `ArticlePanel` + `RewritePanel` + `RewriteCard`
- 流式 token 实时渲染到对应段落卡片
- 验证：浏览器中看到逐 token 出现的改写内容

### Step 5: 指导重写 + 手动编辑
- `GuidanceInput` 组件
- `RewriteCard` 的操作按钮（接受/指导/编辑）
- 手动编辑模式（textarea 替换文本显示）
- 验证：输入指导 → 重新流式生成 → 内容更新

### Step 6: 多轮支持 + 配置面板
- `RoundIndicator` + commit 逻辑
- `ConfigPanel` 模型/参数配置
- 轮次提交 → 状态重置 → 新轮开始
- 验证：完成一轮 → 开始新轮 → 全文正常累计

## 验证方式

1. 后端流式端点：`curl -N POST /api/rewrite/stream/rewrite` 观察 token 逐行输出
2. 前端双栏布局：加载示例文章 → 选中段落 → 点击重写 → 右侧逐字出现
3. 指导重写：输入"请用更口语化的风格" → 重新生成 → 风格变化可见
4. 多轮：第一轮改段落 2、4 → 确认 → 第二轮选段落 1、3 → 全文保持连贯
5. 配置面板：切换模型 → 调整 temperature → 重写效果不同
