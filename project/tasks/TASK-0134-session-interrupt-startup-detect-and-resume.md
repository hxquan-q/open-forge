---
id: TASK-0134
type: task
status: done
priority: P1
owner: apps/desktop
requirement: []
plan: []
source: 用户反馈（2026-09-28）：崩溃/中断后前端无提醒、无恢复入口；竞品调研（Claude Code #69456 启动时 offer resume、Codex/Cursor 反例）
related_requirement: []
related_plan: []
related_tasks: [TASK-0115]
related_issues: []
related_bugs: [BUG-0018]
depends_on: []
conflicts_with: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: main
read_paths: [packages/runtime-node/src/conversation/, apps/desktop/src/main/agent-runtime/, apps/desktop/src/renderer/domains/conversation/, apps/desktop/src/renderer/root-layout/]
write_paths: [packages/runtime-node/, apps/desktop/src/main/, apps/desktop/src/preload/, apps/desktop/src/renderer/, apps/desktop/src/shared/i18n/, .github/release-notes]
exclusive_paths: []
created: 2026-09-28
updated: 2026-09-28
---
<!-- Copyright The Open Forge contributors. -->

# 会话异常中断：启动检测提醒 + 失败提醒具体化 + 一键继续

## 目标

崩溃/强退后用户回到 app 时「看得见断过、点一下就能续」。三个子项同属一条用户故事，合一个 Task：

1. **启动检测**：app 启动时扫描最近会话，发现未闭合 Turn（崩溃在 turn 中途）或队列 sidecar 仍有待发条目，RootLayout Toast 提醒并可一键打开该会话。判定复用 `FailInterruptedTurnRecoveryPolicy`（与重开收敛同一规则，不造第二套）。
2. **失败提醒具体化**：TASK-0115 的 interrupt-health notify Toast 从通用文案升级为按 trigger（networkFailure / truncated / error）措辞，并带「打开会话」动作按钮。
3. **一键继续**：普通会话消息列表 Footer 在最后一条助手消息以错误收尾且会话空闲时显示「继续」条，点击经新增 `session.retry` IPC 走 kernel `retry()`（重跑最后一轮、丢弃失败的助手尝试，同一气泡语义）；错误卡本身不加按钮（避免 team 成员会话误触协调会话）。

## 范围

### 做

- `runtime-node` 新增只读助手 `assessConversationInterruption(sessionId, sessionPath)`：读 jsonl → `parseConversationFile` → `conversationFromFile` → `FailInterruptedTurnRecoveryPolicy.plan()`，返回 `interrupted | ready | unreadable`（文件损坏/协议非法一律 unreadable，fail-soft 不阻塞扫描）。
- 主进程启动扫描器（端口注入、可单测）：候选 = 配置内项目 + 默认对话 cwd 的 `DesktopConversationService.listSessions`（自带 team 会话过滤），按 modifiedAt 近 7 天、上限 20 个；逐个 assess + 读队列 sidecar 计数；非空结果经一次性 channel 推给 renderer。
- IPC 新增 `vetta:session:retry`（镜像 CONTINUE 的校验与接线）；preload 暴露 `session.retry` 与 `session.onInterruptedStartup`；interrupt-health 推送载荷补 `cwd`。
- renderer：RootLayout 两个 Toast（启动检测结果、trigger 具体化 + 打开动作）；`SessionMessageList` 派生「末尾错误且可恢复」，`MessageListFooter` 渲染「继续」条（quota/auth 不显示；streaming/compacting/retry 进行中不显示）。
- i18n zh/en 全文案；release notes v0.1.2。

### 不做

- 不自动续跑任何会话（BUG-0018 结论：恢复须用户显式触发，本任务只给提醒与入口）；
- 不记住「已提醒过」状态（每次启动重报，Toast 自动消失；若反馈扰民再立项做持久化抑制）；
- 不扫 IM 网关/知识库处理等专用 cwd 的会话（属主不在桌面交互面）；
- 不动 kernel 恢复语义、队列 pause-on-terminal 语义与 silent-turn；
- team/子代理会话不在本次提醒与续跑范围（各有协调器恢复路径）。

## Given / When / Then

- Given：app 崩溃时某会话 turn 未闭合，另一会话正常完成；
  When：用户下次启动 app；
  Then：Toast「检测到未完成的会话」带数量与「打开」动作，点击打开该会话；正常完成的会话不出现在结果里；打开的会话历史完整、中断轮以错误卡呈现。
- Given：驻留会话回复因网络中断收场（非手动停止）；
  When：监视器发出 notify；
  Then：Toast 文案指明「网络连接中断」而非通用措辞，带「打开会话」动作，点击跳转对应会话。
- Given：普通会话最后一条助手消息以错误块收尾（网络/服务端/停滞/未知类），会话空闲；
  When：用户看消息列表底部；
  Then：显示「上次回复未完成：{原因} [继续]」；点击后 kernel retry 重跑该轮，同一气泡续写；quota/auth 类错误不显示该条（保持设置引导）；点击时会话已转为忙碌则 IPC 拒绝并 Toast 提示失败。

## 必须保持

- 手动停止的会话永不出现续跑入口（abort 不产生错误块，天然规避）；
- 扫描只读：不在扫描路径写 jsonl / 不产生锁文件 / 不触发 resume 收敛；
- 损坏会话文件、协议非法历史、单项目列举失败均 fail-soft 跳过，不影响其他候选；
- `session.retry` 复用 kernel `retry()` 既有语义（idle 限定、recovery_required 拒绝），不新造恢复规则；
- 所有用户可见文案走 i18n。

## 测试与验证

- `runtime-node`：assessment 单测（真实临时 jsonl：未闭合→interrupted、已完结→ready、损坏/协议非法/缺文件→unreadable）；
- 主进程：扫描器单测（fake 候选 + fake assess/sidecar：窗口过滤、上限、逐项 fail-soft、队列计数、去重）；
- renderer：`resolveInterruptedErrorKind` 纯函数表驱动测试；`MessageListFooter` 组件测试（继续条渲染条件 × 点击调 IPC × IPC 拒绝弹 Toast）；
- 质量检查：`check:quick`、定向 vitest、`test:changed`、根 `check`。
- 不运行 `verify:ui:*`（未获用户授权）。

## 交付记录

- 2026-09-28 交付（主工作区串行执行，branch main）：
  - runtime-node：`assessConversationInterruption`（只读判定，复用 `FailInterruptedTurnRecoveryPolicy`）+ `index.ts` 导出；6 个单测（真实临时 jsonl：未闭合→interrupted、已完结/恢复后→ready、缺文件/损坏/嵌套协议违规→unreadable）全通过。
  - 主进程：`session-interrupt-startup-scan.ts`（端口注入：窗口过滤、上限排序、逐项 fail-soft、队列 sidecar 计数上限、去重）13 个单测全通过；`session-interrupt-bootstrap.ts` 挂启动一次性扫描（候选=默认对话 cwd+配置项目，非空才推送）；`ipc/session.ts` 新增 `vetta:session:retry`（沿用 CONTINUE 的校验与手动停止标记清理）。
  - preload：`session.retry`、`session.onInterruptedStartup`、interrupt-health 载荷补 `cwd`；类型单行声明满足 Biome。
  - renderer：`resolveInterruptedErrorKind` 表驱动 12 个单测全通过（可恢复类别白名单，quota/auth 排除，streaming/compacting 抑制）；`SessionMessageList` 派生并下传；`MessageListFooter` 续跑条 4 个新增组件测试全通过（渲染+点击调 retry / 无 sessionId 隐藏 / 重试进行中隐藏 / IPC 拒绝弹 Toast）；`useRootLayoutModel` 两个 Toast（启动检测、原因具体化+打开动作）接线。
  - i18n zh/en 文案齐全（`sessionInterrupt.reason.*`、`startupTitle/Body`、`messageList.resumeBar.*`），JSON 校验通过。
  - 验证：desktop `tsc --noEmit` exit=0；根 `tsgo --noEmit` exit=0；新增/改动测试 6+13+12+6 全通过；中断巡检/证据族回归 10/10；`test:changed` 全量超时（exit 143）后对疑似 src/main/agent-runtime/model-call-frame-contract.test.ts 单跑 11/11 通过，确认为并发重负载假红。`verify:ui:*` 未运行（未获授权）。
  - 遗留：`check:quick` 仅因并行工作区未跟踪文件 `apps/desktop/src/renderer/domains/conversation/hooks/useSessionManager.wedged-stream.test.ts` 的格式问题判负，未触碰。
  - 发布说明已并入 `.github/release-notes/v0.1.2.md`（新增×2、改进×1）。
  - 跟进（同日）：dev 实例报 `__vettaHostApi.session.onInterruptedStartup is not a function`。根因为 dev 环境产物陈旧——dev 实例 21:40 启动时按哈希复用 15:25 的 main/preload bundle，而 renderer 经 Vite HMR 已更新到新合同（非产品缺陷）；已重建产物。补 preload 通道合同测试（`preload/apis/session.test.ts`）并在 `apps/desktop/AGENTS.md` 补记 dev 重建语义。
