---
id: TASK-0261
type: task
status: verifying
priority: P1
owner: apps/desktop
requirement:
plan:
source: BUG-0109（用户实机日志 2026-10-14(2).log）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0109]
execution: serial
branch: main
worktree:
base_commit: 9801e62fc
read_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx, apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.tsx, apps/desktop/src/renderer/domains/conversation/components/ChatView.tsx, apps/desktop/src/renderer/shared/store/chat-atoms.ts]
write_paths: [apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.tsx, apps/desktop/src/renderer/domains/conversation/components/message-list/MessageListFooter.test.tsx, apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.tsx, apps/desktop/src/renderer/domains/conversation/components/SessionMessageList.stability.test.tsx, .github/release-notes/v0.1.3.md, project/bugs/BUG-0109-resume-bar-passes-path-as-runtime-id.md, project/bugs/README.md, project/tasks/TASK-0261-resume-bar-runtime-id-seam.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-14
updated: 2026-10-14
---
<!-- Copyright The Open Forge contributors. -->

# 续跑条改用 runtime session id：拆开门控与宿主调用的语义

## 目标

点击续跑条「继续」时把 canonical runtime session id 交给宿主，retry 正常重跑；路径不再冒充 id 穿过组件接缝。

## 范围

### 并发评估

- 结论：不支持并行
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：无
- Branch：main
- Worktree：未拆出（串行小改）
- 集成负责人：Coordinator
- 集成顺序：与其他两个修复串行提交

### 做

- `MessageListFooter`：把 `sessionId` prop 拆为 `sessionPath`（仅用于「会话已建立」门控）与 `runtimeSessionId`（宿主调用）；续跑条显示条件与 `onResume` 都改用 `runtimeSessionId`。
- `SessionMessageList`：传入 `session?.runtimeId`（该文件已读 `activeSessionAtom`），路径继续作为门控值。
- 回归测试从真实入口（`SessionMessageList` 层）喂路径形态的 `sessionId`，断言 `window.vetta.session.retry` 收到 runtimeId。

### 不做

- 不改 `session.retry` / `continue` 的内核语义与 IPC 契约。
- 不改 `useChatViewModel` 的 `model.sessionId` 语义（它就是 feed 身份，被多处依赖）。
- 不处理 checkpoint 300s 预算与 `elapsedMs` 字段口径（另案）。

## Given / When / Then

- Given：某会话末轮以可恢复错误收尾，续跑条可见。
- When：用户点击「继续」。
- Then：`session.retry` 收到该会话的 runtime id 并正常重跑；若内核拒绝（忙碌等），透传明确原因。

## 必须保持

- 续跑条「会话未建立时不显示」的门控行为。
- 自动重试进行中不显示续跑条（重试指示优先）。
- retry 被拒时提示失败、不静默吞掉。

## 测试与验证

- 定向测试：`bun run test:pkg desktop`（或 desktop impact）覆盖 `MessageListFooter.test.tsx` 与 `SessionMessageList.stability.test.tsx`。
- 用户流程：可恢复错误 → 出现续跑条 → 点击「继续」→ 重跑该轮。
- 质量检查：`bun run check` + `test:impact`。

## 验收分层

- 工程验证：待执行。
- 技术评审：自审。
- 集成：main 串行。
- 人工功能验收：待验收（需真实会话触发续跑条）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：让某会话末轮以网络错误收尾，底部出现「上次回复未完成：[继续]」。
- 操作步骤或 AI 任务输入：点击「继续」。
- 预期行为与最终产物：该轮重新开始输出，不再出现「继续失败，请稍后重试」。
- 不通过表现与已知限制：仍弹失败提示；日志出现 `SESSION_NOT_FOUND` 且 message 为路径。
- 验收反馈及回归案例：待回写。

## 交付记录

- 实际修改：`MessageListFooter.tsx`（`sessionPath` 只做「会话已建立」门控；`session.retry` 改用 `runtimeSessionId`）、`SessionMessageList.tsx`（拆开两个身份；runtimeId 取自 active session）。
- 评审修正（2026-10-15 收编）：`runtimeSessionId` 补身份守卫（`session.sessionPath === props.sessionId`，与同文件 AnnotationScope 同款）——active 切到别的会话的中间态不再把 B 的 runtimeId 交给 A 的续跑条（原稿会把无害 SESSION_NOT_FOUND 升级成跨会话重跑）。
- 实际修改（测试）：`SessionMessageList.resume.test.tsx` 3 例（匹配/缺失/错配身份），Virtuoso mock 补渲染 `components.Footer` 插槽——MessageFeed.Footer 是 portal，mock 不渲染插槽则 footer 在 jsdom 永不挂载（原稿夹具缺陷导致匹配用例恒红）；`MessageListFooter.test.tsx` 同步新 props。
- 实际运行：desktop 包内 runner 3 文件 12 例全绿。
- 未运行及原因：真实内核拒绝分支的提示文案未实现（评审发现 #9：忙碌/recovery_required 仍弹笼统「继续失败」——任务书验收条款未兑现，待后续切片或调整验收口径）。
- Worktree：未拆出（串行小改，main 直接实施）。
- 剩余风险：`Object.assign(window, …)` 夹具在 isolate:false 下不还原（per-file 隔离下无害）。
