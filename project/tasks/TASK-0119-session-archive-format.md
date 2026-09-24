---
id: TASK-0119
type: task
status: done
priority: P2
owner: packages/runtime-storage
requirement: []
plan: PLAN-0012
source: RESEARCH-0012 WorkDaddy P2（WDS4 魔数+AES-GCM(gzip(定长帧)) 流式归档 + canonical 指纹冲突判定——AGPL，净室重写）
related_requirement: []
related_plan: [PLAN-0012]
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0119-session-archive-format
worktree: ../open-forge-wt/task-0119-session-archive-format
base_commit: ec9891130ac9f1080b218c89dc8e00f1a904efc6
read_paths: [packages/runtime-storage/src/conversation/, apps/desktop/src/main/conversations/, apps/desktop/src/renderer/domains/conversation/]
write_paths: [packages/runtime-storage/, apps/desktop/src/main/conversations/, apps/desktop/src/main/ipc/, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/shared/i18n/, .github/release-notes, tsconfig.json, apps/desktop/tsconfig.json]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated（dd3847e1c，随本批推送 origin/dev）
created: 2026-09-24
updated: 2026-09-25
---
<!-- Copyright The Open Forge contributors. -->

# 会话归档迁移格式（可携带导出/导入）

## 目标

本仓会话导出目前是渲染视图产物（`ChatExportHost`），无可迁移归档格式。参照 WorkDaddy `session-transfer.js`（净室重写）：魔数 + 定长认证头 + `AES-GCM(gzip(定长帧记录))` 流式读写、附件字节不进 JS 字符串；跨副本同会话判定用 **canonical JSON 指纹 + 身份键别名化**（`sessionId`/`conversationId` → `__session__`，同会话跨账号不因 id 不同误判冲突），**文件时间只做竞态探测器不决定胜者**；导出格式 `aes-256-gcm+scrypt`、先 gzip 后加密（认证覆盖压缩数据）、随机 salt。

## 范围

### 并发评估

- 结论：支持并行——写面在 runtime-storage + 会话导出 UI，与 scheduler 域任务不相交。
- 执行方式：可独立 Worktree。
- 可并行 Task：本批大部分。
- 前置依赖：无。
- 冲突文件/独占路径：`packages/runtime-storage` conversation 面、desktop 会话导出 UI（与 TASK-0106/0115 的 renderer 域相邻，注意文件级协调）。
- Branch：独立 task 分支。
- Worktree：按 workflow 派工。
- 集成负责人：Coordinator。
- 集成顺序：PLAN-0012 阶段 B 任意位。

### 做

- 定义归档格式：魔数头 + 版本 + 元数据区（来源 app 版本/会话数/创建时间）+ 流式帧记录（消息、附件引用）；
- 加密：`aes-256-gcm` + `scrypt` 派生密钥、随机 salt、先 gzip 后加密、认证覆盖压缩数据；附件字节流式不落字符串；
- 导入冲突判定：canonical JSON 指纹 + 身份键别名化（同会话不同副本幂等合并，不重复导入）；文件时间只做 hint 不做胜者判定；
- `safePath` 逐组件拒绝 `..`/符号链接（解压安全）；
- 导出/导入 UI 入口挂到会话域（i18n），导入默认新建副本不覆盖在库会话。

### 不做

- 不做跨设备自动同步（归档是手动导出/导入）；
- 不做云存储上传（lite 版无远端）；
- 不复制 WorkDaddy 代码——只借格式形状与冲突判定思想。

## Given / When / Then

- Given：会话 A 在设备 X 导出归档；
- When：在设备 Y 导入（或同机重复导入）；
- Then：canonical 指纹判同会话幂等不重复；篡改归档任一字节认证失败拒绝；`..` 路径被 `safePath` 拦下。

## 必须保持

- 归档格式版本字段必须显式（未来兼容演进）；
- 解密失败/认证失败明确报错不静默；
- 导入不覆盖现有会话（冲突时新建副本）。

## 测试与验证

- 定向测试：归档读写 round-trip、篡改拒绝、`..`/符号链接拒绝、canonical 指纹幂等；
- 用户流程：导出 → 删会话 → 导入恢复 → 再导入验证幂等；
- 质量检查：`bun run test:pkg runtime-storage`、`bun run check:quick`。

## 交付记录

- 实际修改：
  - `packages/runtime-storage/src/conversation/session-archive/**`：OFAR 魔数 + v1 元数据 + AES-256-GCM(gzip(定长帧)) + 纯 scrypt、fingerprint、safePath、冲突策略；导出 `@vetta/runtime-storage/session-archive` 与 `/conversation`
  - `apps/desktop/src/main/conversations/session-archive-service.ts` + IPC/preload 薄接线
  - Renderer 会话顶栏导出/导入入口 + zh/en i18n（chat + main）
  - `.github/release-notes/v0.1.1.md` 新增/改进条目
- 实际运行：
  - `bun run test:pkg runtime-storage` → 8 files / 56 tests passed
  - `session-archive-service.test.ts`（desktop vitest）→ 1 passed（指纹幂等导入）
  - `bun run check:quick -- <本次改动文件>` → passed（含 package-boundaries / release-notes）
  - `packages/runtime-storage` `bun run build` → passed
- 未运行及原因：
  - 完整 `bun run check` 与 UI 实机验证未跑（本 Task 未授权 `verify:ui:*`）；`agent-controls.test.tsx` 在根 vitest 配置下因既有 `@vetta/ssh-transport` 解析问题未作为本 Task 门禁
  - 导入后侧栏刷新依赖既有 sessions-changed，未加独立 E2E
- Worktree：`../open-forge-wt/task-0119-session-archive-format`（branch `task/TASK-0119-session-archive-format`）
- 剩余风险：
  - 主仓并行出现了另一套 `session-archive-format.ts` / `runtime-node` codec 草稿，集成时需择一或合并，避免双事实源
  - 纯 scrypt 未对 RFC 向量做独立对照（round-trip 自洽）；口令用 `window.prompt` 属最小接线，后续可换正式对话框
  - 指纹索引目前只扫默认会话目录，项目内 `.vetta/sessions` 的幂等索引可能不全
