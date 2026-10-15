---
id: TASK-0027
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0001
plan: PLAN-0001
source_issue:
execution: serial
branch: forge/dev
worktree: unassigned（共享工作区串行，不创建 Worktree）
base_commit: forge/dev
read_paths: [packages/plugins, packages/runtime-core/src/task, packages/runtime-core/src/task/read-contracts.ts, apps/desktop/src/main/task-activity, apps/desktop/src/main/capabilities/integrations/plugin, apps/desktop/src/renderer/domains/plugins, apps/desktop/src/renderer/domains/activity-panel]
write_paths: [apps/desktop/src/main/task-activity, apps/desktop/src/main/capabilities/integrations/plugin, apps/desktop/src/main/ipc/plugin-capabilities.ts, apps/desktop/src/preload/api-types/plugins.ts, apps/desktop/src/preload/apis/plugins.ts, apps/desktop/src/shared/plugin-capability-ipc.ts, apps/desktop/src/renderer/domains/plugins, apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/shared/store/plugin-atoms.ts, apps/desktop/src/shared/i18n/locales, project/tasks]
exclusive_paths: [apps/desktop/src/main/ipc/plugin-capabilities.ts, apps/desktop/src/preload/api-types/plugins.ts, apps/desktop/src/renderer/domains/activity-panel/components/TaskTabPanel.tsx]
depends_on: [TASK-0015, TASK-0016, TASK-0020, TASK-0021, TASK-0068]
conflicts_with: [TASK-0059, TASK-0061, TASK-0068]
integration_status: integrated（forge/dev 主工作区；TASK-0068 SDK 合同与 Desktop 宿主接线已落地，待本轮验证收口）
created: 2026-09-22
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# Plugin Artifact Renderer Registry 集成

## 目标

在独立的 TASK-0068 Plugin SDK 合同之上，为 Runtime Artifact descriptor 建立可验证的 Renderer 解析与宿主只读资源读取路径。插件只渲染其获授权的 Artifact 投影，不能取得原始 URI 或通过 Renderer 扩大文件权限。

## 范围

### 并发评估

- 结论：不支持与 TASK-0068 并发；也不与 TASK-0059/0061 并行（共享 Preload/IPC 或 Activity Panel 路径）。
- 执行方式：`forge/dev` 共享工作区串行。
- 可并行 Task：无（TASK-0068 → TASK-0027 的合同依赖；与 TASK-0059、TASK-0061 共享预留写路径）。
- 前置依赖：TASK-0015 Artifact descriptor、TASK-0016 grant/approval、TASK-0020 project root/URI 规范化、TASK-0021 Plugin contribution policy、TASK-0068 SDK API。
- 冲突文件/独占路径：Plugin capability IPC/preload、PluginGlobalSlotHost/PluginLocalContributions/Renderer registry、Task Activity Panel Artifact renderer host；TASK-0059 的共享 IPC/preload 接缝及 TASK-0061 的 Activity Panel 目录。
- Branch：`forge/dev`。
- Worktree：共享工作区串行，不创建 Worktree。
- 集成负责人：主会话。
- 集成顺序：TASK-0068 SDK API → TASK-0027 Desktop integration；TASK-0059/0061 不得与本链共享写路径并发。

### 做

- 复用 `ArtifactDescriptor.rendererType`；显式类型精确匹配，字段缺省时按已验证的 Artifact `kind` 查找 Renderer。未知显式类型不猜测、不尝试别的插件 Renderer。
- 把 SDK contribution 接入现有 `PluginLocalContributions` → `PluginGlobalSlotHost` 发布/清理流程；验证 TypeBox schema 后才挂载 Component。相同 Renderer type 冲突不覆盖已注册项。
- 扩展现有 attach-artifact descriptor 投影读取能力；`DesktopArtifactView`/Renderer 投影去掉原始 `uri`。Renderer 收到 URI-free descriptor 和绑定 `sessionId + artifactId + version + rendererType` 的只读 resource handle。
- Plugin capability read 每次重新验证 capability session、`ui.slot.artifact-renderer` grant、当前 Runtime 中 descriptor 身份/版本/type 与来源路径；路径必须属于该来源 Session 的 cwd，拒绝 scheme 不支持、越界、符号链接逃逸、文件缺失与 stale version。
- Task Activity Panel 用户打开 Artifact 时，匹配 Renderer 在面板内容区渲染；插件未注册、权限不足、schema 拒绝、插件停用、资源缺失或读取失败均回退到安全通用 Artifact 卡/本地化错误态，不影响同列表其它 Artifact。
- Plugin disable、permission revoke、capability session close、source Session release 和 Artifact version 更新后卸载旧 Renderer/source；未完成读取不向已切换的 session 回写。

### 不做

- 不引入第二套 Capability/Renderer Registry；注册与释放复用 Plugin contribution lifecycle。
- 不修改 `ArtifactDescriptor` JSONL schema；`rendererType` 已是可选字段。本任务不修改 `attach_artifact` Tool Schema，旧 Artifact 缺字段按 `kind` fallback。
- 不把 Artifact 内容或 renderer metadata 注入模型可见 message `content`；Plugin API 也不返回一般性绝对路径读取接口。
- 不修改 TASK-0059 的 Canvas artifact store/Agent tool 合同，也不实现 Canvas tab；不发布 Plugin SDK npm 包。

## Given / When / Then

- Given：当前 Session 有合法 Artifact descriptor，且一个已启用、获授新权限的插件注册了匹配 type/schema；
- When：用户在 Activity Panel 打开 Artifact，Renderer 通过注入的只读 source 读取内容；
- Then：schema 校验后显示自定义视图，插件看不到原始 URI；尝试越过来源 Session 项目根、使用未知 scheme、旧版本或已撤销 capability 时读取失败并安全降级。

## 必须保持

- 文件内容仍是 Artifact 唯一事实源；Renderer 只读投影，不修改 descriptor 或源文件。
- UI 展示数据与模型上下文隔离；descriptor、schema、读取错误和 Renderer Component 不进入模型可见 content。
- Plugin 权限是显式 grant；插件不能凭 descriptor 自述、`rendererType` 或只读标签扩大能力。
- 任何失败、无权限、未知 renderer、停用和 Session 关闭均不会影响其他 Artifact 的列表/渲染。

## 测试与验证

- SDK/注册合同：schema 合法/拒绝、type 冲突不覆盖、缺权限 registration 不可见、dispose/disable 后 Registry 项移除。
- Main 资源边界：descriptor 身份/版本不匹配、缺失/非本地/不支持 URI、项目根之外、symlink 逃逸均拒绝；来源 cwd 内资源可经 capability handle 读取；session/plugin capability 关闭后拒绝后续读取。
- 用户流程：插件声明 Renderer API/权限 → 授权并加载 → Artifact 出现在 Task 面板 → 打开并由 Renderer 读取 → 撤销权限或停用插件后安全回退；同时覆盖未知 type 和缺失文件。
- Desktop 组件/IPC 合同测试验证 TaskTab 接线、schema fallback、i18n、读内容不把 URI 传给 Component；使用显式 promise/barrier 测试 Session switch/disable 的过期读取，不使用 sleep。
- 命令：SDK task 的 public API 测试与 build；`bun run test:impact -- <changed files...>`、`bun run check:quick -- <changed files...>`；完整代码轮结束后 `bun run check`。不运行 `verify:ui:*`，除非本对话另行明确授权。

## 阻塞

- 已解除：TASK-0068 已把 URI-free Artifact Renderer contribution/source API、`ui.slot.artifact-renderer` 权限与 Plugin API `2.8.0` 合同集成到 `forge/dev`；本任务的 Desktop 注册、只读资源边界和 Activity Panel 接线也已落地。
- 发布说明仍受版本切换门禁约束：Desktop manifest 尚未从继承的 `0.5.59` 切到 Open Forge `0.1.0`，不得把 fork-only 条目写进继承的 Release Notes，候选说明保留在本 Task 交付记录。

## 交付记录

- 实际修改：
  - SDK `2.8.0` 的 Artifact Renderer contribution 经 `PluginLocalContributions` / `PluginGlobalSlotHost` 发布到宿主 registry；Activity Panel 按 descriptor 的显式 `rendererType` 或 `kind` 选择 renderer，并通过绑定 Task Session、Artifact id、version 与 renderer type 的只读 source 读取内容。
  - Main capability 每次读取重新验证 capability session、`ui.slot.artifact-renderer` 与 `fs.read`，再由 Task Activity Service 校验 descriptor 身份、版本、类型、来源 Session 与项目根；Renderer 投影不暴露原始 URI。
  - 本轮补齐 Desktop 的权限名称/说明/风险展示映射与中英文 catalog，并修正资源服务导入、React Error Boundary 值导入及测试 fixture 类型，使新增 SDK 权限能通过 Desktop 的穷举类型门禁。
- 实际运行：`apps/desktop` 定向合同测试 4 文件 8 例通过（`artifact-renderer-resource`、`task-activity-service.artifact-renderer`、`plugin-permission-labels`、`plugin-workspace-view-publication`）；`bun scripts/quality/run-vitest.mjs --run packages/plugins/plugin-sdk/test/public-api.test.ts` 3 例通过；`bun run check` 的 desktop tsc 与根 tsgo 全绿。
- 未运行及原因：`verify:ui:*` 未运行（用户未授权实机 UI 验收）；由组件、主进程合同测试和 Desktop 类型检查覆盖本轮风险。
- Release Notes：已按当前版本基线记入 `.github/release-notes/v0.1.1.md`（插件声明的任务产物专用预览器可完成宿主注册与权限展示；读取内容仍需单独的文件读取权限，撤销权限或来源失效时安全回退）。
- 剩余风险：真实第三方插件与 Electron 窗口的端到端加载未实机验收；低层测试覆盖注册、读取授权、失效回退和宿主投影。
