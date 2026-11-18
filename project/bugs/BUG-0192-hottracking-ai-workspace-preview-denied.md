---
id: BUG-0192
type: bug
status: verifying
priority: P1
owner: desktop
requirement: REQ-0031
plan: []
source: user-report（2026-11-18 dev 实例热追踪预览失败）
related_requirement: [REQ-0031]
related_plan: []
related_tasks: [TASK-0479]
related_issues: []
created: 2026-11-18
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# code 会话热追踪跟随 AI 工作区文件时右栏预览报「无法读取此文件」

## 用户流程

- Given：dev 实例中项目 `D:\Coding\WorkSpace\Practice\xiaoai` 的 code 会话「清场原始记录表」（2026-11-18）。
- When：AI 把 `requirements.md` 等辅助文件写入项目 AI 工作区 `C:\Users\Chenxuhua\.openforge-dev\workspace\code-projects\ae74ed42…\pipeline\2026-11-18-qingchang-form\`，LLM 行为热追踪把右侧文件预览切到该文件。
- Then：预览应正常打开并可编辑（与跟随项目根源码一致）；实际报「无法读取此文件 / 重新加载」。

## 实际行为与期望行为

- 实际：内嵌文本预览走可编辑链路（`.md` ∈ TEXT_EXTENSIONS → EditableTextFileView → `vetta:fs:read-editable-text`），主进程抛 `Path is outside any known project directory`，渲染层翻译为「无法读取此文件」。
- 期望：code 会话热追踪对「写在 AI 工作区的辅助文件」与「写在项目根的源码」都能正确跟随并预览（可编辑视图可用）；跨项目/非本会话目标仍按原边界拒绝。

## 最小复现

1. dev 实例打开任一项目的 code 会话，让 AI 往项目 AI 工作区写一个文本文件（或手动把右栏预览指向 `<vettaHome>/workspace/code-projects/<hash>/pipeline/x.md`）。
2. 热追踪/预览切到该文件。
3. 右栏报「无法读取此文件」；同一路径的只读预览链路不报错（homedir 放行差异）。

## 环境与失败证据

- 环境：Windows 11，dev 实例（数据目录 `~/.openforge-dev`），desktop 0.1.4 基线，2026-11-18 实测。
- 会话 transcript（`~/.openforge-dev/agent/sessions/--D--Coding-WorkSpace-Practice-xiaoai--/NGIxNjgyOGQtOTZmYi00MTA2LWJjMTctZGNiODg0ZGViZjU5.conversation.jsonl`）：全部 6 次 write/edit 的 path 均为 AI 工作区**绝对路径**，写入全部成功、零拒绝；所有会话分片不存在 `../pipeline` 相对路径调用。
- 渲染层链路无断点：`ai-activity-atoms.ts` 的 `toAbsolutePath` 对绝对路径原样放行；`useFollowAiFileEdits.ts` 的 `target.cwd === workspace.cwd` 过滤通过；`setPreview` 拿到正确绝对路径。

## 影响

P1：REQ-0031 交付后 code 会话的常规工作流（AI 辅助材料默认写 AI 工作区）在桌面端不可跟随预览，用户对 AI 工作区产出零可见性；仅影响读取/保存边界判定，不涉及文件工具写入权限（写入本身一直成功）。

## 根因证据

- 断点在主进程读取边界：`filesystem-service.ts` 的 `readEditableTextFile`（:268）用 `assertFilesystemPathWithinProject`（:107）——只认 `allowProjectRoot` 注册的 `allowedRoots`，没有 homedir 放行。
- `allowedRoots` 注册点：`ipc/fs.ts` CONFIG_GET（:404-415，projects/allstarProjects/workspacePath 等）与 `resolve-session-config.ts:198`（会话 cwd）。**AI 工作区目录从未被注册**。
- 对照：只读断言 `assertPathReadableForPreview`（:162）有 homedir 放行，所以只读链路本可通过——但内嵌面板文本文件默认进可编辑链路，踩中的正是无放行那条。项目根文件在 allowedRoots 里，所以跟随项目根源码正常。
- 根因定论：REQ-0031 给 code 会话文件工具授权了「项目根 + 项目 AI 工作区根」两根，但 desktop 主进程 fs 的可编辑文本读取/保存边界没有同步认识 AI 工作区。置信度：高（调用链各环节均有代码锚点与 transcript 证据）。
- 已证伪假设：早先推测「toAbsolutePath 把相对路径 `../pipeline/…` 拼到会话 cwd 导致错位」——取证证明模型从未传相对路径，渲染层解析无错；不改 `ai-activity-atoms.ts` / `useFollowAiFileEdits.ts` / `toAbsolutePath`。

## 回归测试

`apps/desktop/src/main/conversations/resolve-session-config.test.ts` 新增「AI 工作区 fs 授权（BUG-0192）」组（先红后绿；`allowProjectRoot` mock 换为真实实现，真实断言 `assertFilesystemPathWithinProject`/`readEditableTextFile` 边界）：

1. coding 会话解析后，AI 工作区目录内文件 `readEditableTextFile` 成功（旧实现红）。
2. 恢复链（sessionPath header cwd 重算）首个解析同样注册工作区，读取成功（旧实现红）。
3. work 档会话不产生 AI 工作区注册，工作区路径仍被拒。
4. 边界不回归：同一 `code-projects` 父目录下另一 hash 目录（伪造他项目工作区）与无关临时目录仍被 `assertFilesystemPathWithinProject` 拒绝。

## 修复与验证

- 修复：`resolve-session-config.ts` 解析出 `projectAiWorkspace` 后调用 `allowProjectRoot(projectAiWorkspace.directory)`——与同文件 :198 注册项目根同一机制；只在 coding 档注册当前会话项目的这一个工作区（directory 恒为本机路径，SSH 项目不涉远端边界）；不改 `assertFilesystemPathWithinProject` / `assertPathReadableForPreview` 判定逻辑，不注册 `code-projects` 父目录，不动文件工具权限与 `code-project-file-policy.ts`，不动热追踪语义。
- 恢复路径结论（修复要求验证项）：会话重启恢复/历史会话重开全部必经 `resolveDesktopSessionConfig`——交互恢复 `ipc/session.ts:867` → `conversationService.createSession` → `resolveDesktopSessionConfig`（读 sessionPath header cwd 重算 projectAiWorkspace）；Team 主控/成员/重配 `team-runtime-manager.ts` 三处调用同样必经（`TEAM_AGENT_MODE="coding"`）。定时任务 `task-executor.ts` 直连 runtime 且固化 `agentMode:"work"`（无 AI 工作区，无需注册）。无需补注册点。
- 按用户决定不另建修复 Task，本 Bug 记录独立承载修复与验证记录。
- 验证（2026-11-18）：
  - 红灯：新增 4 用例中 2 个正向用例在旧实现失败，错误即生产报错 `Path is outside any known project directory`（`readEditableTextFile` → `assertFilesystemPathWithinProject`，filesystem-service.ts:115）；负向 2 例与存量 21 例通过，非环境故障。
  - 绿灯：实施修复后 `bun ../../scripts/quality/run-vitest.mjs --run src/main/conversations/resolve-session-config.test.ts` 23/23 通过；相邻 `session-agent-mode.test.ts` 8/8 通过；`bun run check:quick -- <两改动文件>` 通过（Biome 格式一次自动修复后）。
  - 未运行及原因：impact/全量测试按约定由用户决定另行执行；真实 Desktop/模型实机验收（dev 实例重开会话跟随预览）待用户；不启动 dev、不发布。
- 剩余风险：`allowedRoots` 为进程级累积状态且无清理接口——本修复只会随会话解析单调增加授权根（与既有项目根注册语义一致），不缩小既有边界；测试用例已按互不依赖清理设计。真实模型热追踪全链路（含渲染层跟随动画）未经自动化覆盖，依赖既有热追踪合同测试与实机验收。
