---
id: TASK-0279
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0122
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0122]
execution: serial
branch: main
worktree: 未拆出（串行小改，main 直接实施）
base_commit: 530308b68
read_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx, apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.tsx, apps/desktop/src/renderer/domains/conversation/services/interrupted-resume.ts, apps/desktop/src/renderer/shared/store/message-queue-atoms.ts, apps/desktop/src/renderer/shared/store/chat-atoms.ts, packages/runtime-core/src/kernel/agent-session.ts]
write_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.test.tsx, apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.tsx, apps/desktop/src/renderer/domains/conversation/services/interrupted-resume.ts, apps/desktop/src/renderer/domains/conversation/services/resume-failure.ts, apps/desktop/src/renderer/domains/conversation/services/interrupted-resume.test.ts, apps/desktop/src/shared/i18n/locales/zh/chat.json, apps/desktop/src/shared/i18n/locales/en/chat.json, .github/release-notes/v0.1.3.md, project/tasks/TASK-0279-resume-bar-busy-gating.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx, apps/desktop/src/renderer/domains/conversation/services/interrupted-resume.ts, apps/desktop/src/renderer/domains/conversation/services/resume-failure.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-16
updated: 2026-10-16
---
<!-- Copyright The Open Forge contributors. -->

# 续跑条忙碌期间不可点：在途锁、忙碌文案与主进程真值门控

## 目标

让续跑条在会话忙碌（活动轮次或已有待派发排队输入）期间不提供可点击入口；续跑被内核拒绝时按真实原因（忙碌 / `recovery_required`）给出可操作文案；同一次失败不因重复点击而反复打到主进程。保持 BUG-0109 已建立的「宿主调用只认本 feed 自己的 runtime id」契约不变。

## 范围

### 并发评估

- 结论：不支持
- 执行方式：serial
- 可并行 Task：无（与其它 renderer 会话域任务串行）
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`
- Branch：`main`
- Worktree：未拆出
- 集成负责人：本轮执行者（Coordinator 角色）
- 集成顺序：本 Task 单独落地，main 串行

### 做

- `MessageListFooter.tsx`：`onResume` 增在途点击锁（`resuming`），期间按钮 `disabled` 并标注 `aria-busy`；`finally` 释放。
- 新增 `services/resume-failure.ts`：把续跑失败分类为 `busy` / `recovery_required` / `unknown`（纯函数，可单测）。
- `MessageListFooter.tsx`：按分类选择文案（忙碌 / 需恢复 / 通用）。
- `interrupted-resume.ts`：`InterruptedResumeContext` 增 `hasPendingQueue`；为真时不返回 `interruptedErrorKind`。
- `SessionMessageList.tsx`：从 `messageQueueBySessionAtom` 读取当前会话是否存在排队输入，传入上述上下文。
- i18n：`zh`/`en` 的 `chat.json` 增 `messageList.resumeBar.busy`、`messageList.resumeBar.recoveryRequired`。
- 测试：`interrupted-resume.test.ts` 表驱动；`MessageListFooter.test.tsx` 交互断言；`SessionMessageList` 队列门控断言。
- `.github/release-notes/v0.1.3.md` 补一条内部改动。

### 不做

- 不改 `window.vetta.session.retry` 的 IPC 契约（仍 `Promise<void>`；调用方唯一，仅 `MessageListFooter`）。
- 不把「排队态」并入 `markRunning`/`runningSessionPaths`（会改变侧栏 spin 与 LRU 复检语义，属独立范围）。
- 不为「渲染端为何判空闲」的三种候选加测点/日志（本轮判定为不影响修复正确性；如需定位另立 Task）。
- 不改内核 `sessionBusyError` 文案与 `retry()` 语义。

## Given / When / Then

- Given：某会话存在待派发的排队输入（`messageQueueBySessionAtom` 非空）。
- When：该会话末轮以可恢复错误收尾、续跑条本应出现。
- Then：不渲染续跑条；队列卡片/输入栏仍提供各自的排队操作入口。

- Given：续跑条可见且用户点击「继续」。
- When：宿主调用在途。
- Then：按钮 `disabled` 且在途期间重复点击不再发出第二次 IPC；settle 后恢复。

- Given：续跑条可见且用户点击「继续」。
- When：内核以 `SESSION_BUSY`（`Session already has an active turn`）拒绝。
- Then：展示「会话正在运行，请等当前回复结束后再试」而非通用「继续失败，请稍后重试」。

## 必须保持

- BUG-0109 契约：宿主调用只传本 feed 自己的 runtime id（`session.sessionPath === props.sessionId` 守卫不变）。
- 续跑条「会话未建立时不显示」的门控。
- 自动重试进行中不显示续跑条（重试指示优先）。
- `retry` 被拒时提示失败、不静默吞掉。
- 非忙碌失败的文案仍为通用「继续失败」。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run apps/desktop/src/renderer/domains/conversation/services/interrupted-resume.test.ts apps/desktop/src/renderer/domains/conversation/services/resume-failure.test.ts apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.test.tsx`。
- 用户流程：可恢复错误 → 出现续跑条 → 点击「继续」→（空闲）重跑 /（忙碌）专属文案 + 按钮禁用。
- 质量检查：`bun run test:impact -- <改动文件>`、`bun run check:quick`，完成后 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行；与 frontmatter `integration_status` 一致。
- 人工功能验收：待验收（需真实会话触发续跑条与忙碌窗口）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：让某会话在活动轮次期间排队一条输入，并让该轮以可恢复错误收尾。
- 操作步骤或 AI 任务输入：观察续跑条是否出现；若出现则点击「继续」并连点。
- 预期行为与最终产物：排队期间不出现续跑条；忙碌时点击只发出一次调用并显示忙碌专属文案。
- 不通过表现与已知限制：续跑条在忙碌期间仍可点、重复点击产生多次 IPC、文案仍为通用重试。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：
  - `services/resume-failure.ts`（新增）：`classifyResumeFailure` 按内核稳定文案归类 `busy` / `recovery_required` / `unknown`。
  - `components/message-list/MessageListFooter.tsx`：`onResume` 增 ref 同步在途锁 + `resuming` 状态，按钮 `disabled`/`aria-busy`；失败按分类选 `resumeBar.busy` / `resumeBar.recoveryRequired` / `resumeBar.failed`。
  - `services/interrupted-resume.ts`：`InterruptedResumeContext` 增 `hasPendingQueue`，为真时不返回 `interruptedErrorKind`。
  - `components/SessionMessageList.tsx`：从 `messageQueueBySessionAtom` 读当前会话排队输入，计算 `hasPendingQueue`。
  - `shared/i18n/locales/{zh,en}/chat.json`：`messageList.resumeBar` 增 `busy` / `recoveryRequired`。
  - 测试：`resume-failure.test.ts`（新增，12 例）、`interrupted-resume.test.ts`（表驱动增「待派发排队输入」）、`MessageListFooter.test.tsx`（忙碌专属文案、未归类通用文案、在途锁只发一次 + disabled）、`SessionMessageList.resume.test.tsx`（排队门控 + 清空恢复）。
  - `.github/release-notes/v0.1.3.md`：修复节新增一条。
- 实际运行：
  - `bun ../../scripts/quality/run-vitest.mjs --run <四个测试文件>`（包内）：4 文件 / 35 例全绿。
  - `bun run test:impact -- <四个改动文件>`：desktop 侧 17 文件 / 101 例全绿。
  - `bun run check:quick`：全绿（含 `project-indexes` 校验本 Task 索引一致）。
  - `bun run check`：首轮 desktop typecheck 报 `t()` 键类型错误（分类函数返回 `string`），已改为字面量联合 `ResumeBarMessageKey`；`bun run --cwd apps/desktop typecheck:incremental` 复跑通过。
- 未运行及原因：`verify:ui:*` 未运行——本 Task 未获 UI 自动化授权，按 [Desktop 验证流程](../../docs/dev/README.md) 交人工验收。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：
  - 失败归类依赖内核稳定文案片段（`Session already has an active turn` / `session recovery is required`）；文本变化会降级为通用文案（不误报，只丢专属措辞）。
  - 排队门控对「暂停的队列」同样隐藏续跑条；暂停态用户走队列卡片/输入栏的排队操作，本轮不区分暂停与否（未在日志现场出现，登记为已知取舍）。
  - 渲染端为何在某帧判空闲的三种候选（agent_end→agent_start 窗口 / 辅助轮 / `cancelling`）本轮未加测点区分——不影响本修复正确性，如需定位另立 Task。
