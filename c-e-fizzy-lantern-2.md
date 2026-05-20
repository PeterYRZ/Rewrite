# Phase 8+ — 功能完善计划

## Context

Phase 1–7 已完成核心改写功能：全自动模式、双栏 Diff 交互式模式、SSE 流式输出、多轮增量改写、指导重写、手动编辑、配置面板。Phase 8 起对应用进行工程化完善：结果导出、配置面板增强、历史记录、版本回溯、用户认证、DEBUG 模式、多语言支持。

---

## Phase 8: 结果导出 + 模型配置抽屉 + 历史记录

### 8.1 复制 & 下载结果

**前端**：
- 结果区底部添加两个按钮：📋 **复制全文** / 📥 **下载 .txt**
- 复制：`navigator.clipboard.writeText(resultText)` + toast 提示
- 下载：生成 Blob → `URL.createObjectURL` → 触发 `<a download="rewrite-result.txt">`

### 8.2 模型配置抽屉

**前端 — `ModelConfigDrawer.tsx`**：
- 点击 Header 中的 ⚙ 图标 → 右侧滑入抽屉面板（`transform: translateX` + `transition`）
- 遮罩层点击可关闭
- 面板内容：
  - 模型列表（单选），显示 name / provider / model
  - 新增模型（Name、Provider、Model、API Base、API Key 字段）→ 调用 PUT /api/config
  - Temperature 滑块（0–2，步长 0.1）
  - Max Tokens 数字输入
  - Candidates Count 数字输入（交互式每段候选数）
  - Validation 开关 + Strictness 下拉
- **后端**：扩展 `PUT /api/config` 支持新增/删除模型（运行时热切换）

### 8.3 历史记录（localStorage）

**前端 — `useHistory.ts`**：
- 监听 session commit 事件 → 自动保存到 localStorage
- 数据结构：
  ```typescript
  interface HistoryEntry {
    id: string;
    title: string;           // 文章前 50 字
    articleText: string;     // 当前稿全文
    roundCount: number;
    createdAt: string;       // ISO timestamp
    updatedAt: string;
    sessionState: SessionState;  // 完整会话状态
  }
  ```
- **历史列表页** (`HistoryPage.tsx`)：
  - 卡片网格展示历史记录（标题、时间、轮次数）
  - 点击「继续编辑」→ 恢复 sessionState 到当前会话 → 进入 ready 阶段
  - 点击「删除」→ 确认后从 localStorage 移除
  - 从 Header 可进入历史页面

---

## Phase 9: 版本回溯

### 9.1 段落级版本管理

**数据模型**（localStorage 存储）：
```typescript
interface ParagraphVersion {
  versionId: string;
  paragraphIndex: number;
  content: string;
  roundNumber: number;
  createdAt: string;    // ISO timestamp
  label?: string;       // 用户自定义标签
}
```

**前端 — `VersionTimeline.tsx`**：
- 点击段落旁的「版本历史」图标 → 展开时间线面板
- 每条记录显示：轮次号、时间、内容预览（前 80 字）、自定义标签
- 操作：**预览**（右侧高亮该版本内容）/ **恢复**（替换为当前版）/ **添加标签**
- 每次 commit 轮次时自动记录每个被改写段落的版本

### 9.2 版本对比

- 选中两个版本 → 「对比」按钮 → DiffLayout 中高亮差异
- 简单实现：`diff(oldContent, newContent)` → 字符级差异标记

---

## Phase 10: 用户认证

### 10.1 认证模型

**Access Key 认证**：
- 后端维护 `users.json`（或环境变量）：
  ```json
  {
    "users": [
      {"username": "admin", "access_key": "rw-admin-xxxx", "role": "admin"},
      {"username": "user1", "access_key": "rw-user-xxxx", "role": "user"}
    ]
  }
  ```
- 登录：输入 Access Key → 后端验证 → 返回 JWT token（或简单 session cookie）
- 普通用户：可使用改写功能
- 管理员：额外可查看所有用户的 session、管理用户列表、查看日志

### 10.2 后端

- `POST /api/auth/login` — Body: `{ access_key }` → Response: `{ token, username, role }`
- `GET /api/auth/me` — 验证 token，返回当前用户信息
- Middleware：`verify_token` 依赖注入 → 所有 `/api/rewrite/*` 端点需要认证
- 管理员端点：
  - `GET /api/admin/users` — 列出所有用户
  - `POST /api/admin/users` — 添加用户
  - `DELETE /api/admin/users/{username}` — 删除用户
  - `GET /api/admin/sessions` — 查看所有活跃会话

### 10.3 前端

- `AuthGate.tsx` — 登录页面（全屏居中，输入 Key → 登录）
- `useAuth.ts` — 管理 token、用户信息、登录/登出
- Header 右侧显示用户名 + 角色标签 → 点击登出

---

## Phase 11: DEBUG 模式

### 11.1 启用方式

- URL 参数 `?debug=true` 或 localStorage 开关
- 开启后：所有用户可见 DEBUG 功能

### 11.2 段落级进度控制

**前端 — `RewriteCard` 增强**：
- 流式生成时，卡片顶部显示进度条（`streamedLength / estimatedTotal` 估算）
- 两个新按钮：⏹ **终止**（abort SSE fetch）/ 🔄 **重试**（重新触发该段改写）
- 显示实际耗时（从 `paragraph_start` 到 `paragraph_done`）

### 11.3 日志面板

**后端**：
- 使用 Python `logging` 模块，写入 `logs/rewrite-engine.log`
- 关键事件日志：`session_create`, `stream_start`, `stream_end`, `paragraph_done`, `error`
- 每个请求生成 `request_id`（UUID）贯穿日志

**前端 — `DebugPanel.tsx`**：
- 悬浮按钮（FAB）固定在右下角 → 点击弹出底部面板
- 面板内容：
  - 当前 session ID、phase、target indices
  - 最后一次 SSE 事件的原始数据（event + data）
  - 最近 N 条日志（前端侧记录：token 计数、耗时、错误）
  - 「导出日志」按钮 → 下载 JSON

**后端 — Debug 端点**：
- `GET /api/debug/logs?lines=50` — 返回最近 N 行日志（管理员 only）
- `GET /api/debug/sessions` — 列出所有内存中的 session（管理员 only）

---

## Phase 12: 多语言 (i18n)

### 12.1 方案

- 使用 `react-i18next` 或轻量自定义方案
- 翻译文件：
  - `web/src/locales/zh-CN.json`
  - `web/src/locales/en.json`

### 12.2 翻译范围

- 所有 UI 文本：按钮标签、提示文字、状态文案、占位符
- 段落状态 badge：待改写 → `To Rewrite`, 已确认 → `Confirmed`
- 操作按钮：接受 → `Accept`, 指导重写 → `Guide Rewrite`, 手动编辑 → `Edit`
- 错误消息 + 空状态提示

### 12.3 切换方式

- Header 右侧语言切换按钮 🇨🇳 / 🇺🇸
- 偏好存入 localStorage，下次打开自动恢复

---

## 实施顺序

| Phase | 内容 | 预计 Step |
|-------|------|-----------|
| Phase 8 | 复制下载 + 配置抽屉 + 历史记录 | 3 steps |
| Phase 9 | 版本回溯（段落版本管理 + 对比） | 2 steps |
| Phase 10 | 用户认证（Key 认证 + 管理员面板） | 3 steps |
| Phase 11 | DEBUG 模式（进度控制 + 日志面板） | 2 steps |
| Phase 12 | 多语言 i18n（中文 + 英文） | 2 steps |

---

## 验证方式

1. **复制/下载**：点击按钮 → 剪贴板/文件内容与结果一致
2. **配置抽屉**：打开 → 修改 temperature → 下次改写生效
3. **历史记录**：改写后刷新页面 → 历史列表中出现记录 → 点击继续编辑
4. **版本回溯**：完成一轮 → 段落出现版本历史 → 选择旧版本预览/恢复
5. **用户认证**：未登录 → 重定向到登录页 → 输入 Key → 进入主界面
6. **DEBUG 模式**：`?debug=true` → FAB 出现 → 点击查看日志 → 终止按钮生效
7. **多语言**：切换英文 → 所有按钮/标签变为英文
