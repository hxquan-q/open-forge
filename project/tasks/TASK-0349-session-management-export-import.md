---
id: TASK-0349
type: task
status: verifying
priority: P2
owner: apps/desktop
requirement: []
plan: []
source: user-request（2026-10-21）：完善会话管理，包括加载、会话导出、项目会话导出、导入、恢复会话等功能
related_requirement: []
related_plan: []
related_tasks:
  - TASK-0119
  - TASK-0135
related_issues: []
related_bugs:
  - BUG-0031
  - BUG-0032
depends_on: []
conflicts_with: []
execution: serial
branch: main
worktree: unassigned（主工作区串行执行）
base_commit: 1b25abff0004fd32898eae4b442c3e73108fb0ae
read_paths: [apps/desktop/src/main/conversations/, apps/desktop/src/main/ipc/, apps/desktop/src/preload/, apps/desktop/src/renderer/domains/project/, apps/desktop/src/renderer/domains/conversation/hooks/useChatViewModel.ts, packages/runtime-storage/src/conversation/session-archive/, packages/theme-ui/src/project/]
write_paths: [apps/desktop/src/main/conversations/session-archive-service.ts, apps/desktop/src/main/ipc/session-archive.ts, apps/desktop/src/preload/apis/session-archive.ts, apps/desktop/src/preload/api-types/session-archive.ts, apps/desktop/src/renderer/domains/conversation/services/session-archive.ts, apps/desktop/src/renderer/domains/conversation/hooks/useChatViewModel.ts, apps/desktop/src/renderer/domains/project/components/ProjectContextMenu.tsx, apps/desktop/src/renderer/domains/project/hooks/useProjectContextMenuModel.ts, apps/desktop/src/renderer/domains/project/hooks/useProjectsPanelMenusModel.ts, apps/desktop/src/renderer/domains/project/components/sidebar/projects/panel/ProjectsPanelMenus.tsx, packages/theme-ui/src/project/ProjectContextMenuView.tsx, apps/desktop/src/shared/i18n/locales/, project/tasks/, .github/release-notes/v0.1.3.md]
exclusive_paths: []
integration_status: integrated（本地 main `35d35faec`；已随 `1af5c0253` fast-forward 推送 origin/dev 并核对远端）
created: 2026-10-21
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 完善会话管理闭环：项目会话导出、导入后即时可见与反馈体验

## 目标

用户要求完善应用的会话管理（加载、会话导出、项目会话导出、导入、恢复会话）。现状调查（TASK-0119/0135、BUG-0031/0032 与本轮源码梳理）结论：

- 单会话导出/导入 `.ofar` 已存在（chat 顶栏按钮，口令走应用内确认对话框）；
- **项目级（多会话）导出不存在**——OFAR 格式本身支持多会话（`encodeSessionArchive({ sessions: [...] })`），缺桌面侧枚举 + 打包 + IPC/UI 入口；
- **导入写入 `.jsonl` 后不通知渲染端**（`importSessionArchiveFromBytes` 不 `emitConversationListChanged`，会话目录无 watcher），侧栏要折叠/切换/重启才可见——直接破坏「导入 → 加载 → 恢复会话」闭环；
- 导入/导出结果与失败用 `alert()`（同步阻塞原生框，仓库定性为不推荐，BUG-0031 背景）。

本任务补齐：项目会话一键导出、导入后侧栏即时刷新（加载）、结果反馈 Toast 化，并保持既有单会话导出/导入与恢复（打开/续跑）语义不变。

## 范围

### 并发评估

- 结论：不支持并行——主进程会话归档服务/IPC、preload 合同与项目菜单接线互相依赖，需同一闭环内原子交付。
- 执行方式：serial。
- 可并行 Task：无。
- 前置依赖：无（TASK-0119/0135 已交付）。
- 冲突文件/独占路径：`session-archive-service.ts`、`ipc/session-archive.ts`、`useChatViewModel.ts`、项目菜单族。
- Branch：main（主工作区串行，沿用 TASK-0135 模式）。
- Worktree：unassigned。
- 集成负责人：本会话 Coordinator。
- 集成顺序：实现 → 定向测试 → test:impact → check:quick → 完整 check → 提交。

### 做

1. **项目会话导出（多会话 `.ofar`）**
   - 主进程：`exportProjectSessionsArchiveToBytes/WithDialog`——按项目枚举会话（复用 `listSessionHistory(cwd)`，含本地与 `ssh://` 远程项目的本地分片记录），逐文件读取打包进单个 OFAR；任一会话文件读取失败则整个导出失败并带文件名报错（不产半包）；零会话时不弹保存框，返回 `no-sessions`。
   - IPC：新通道 `vetta:session-archive:export-project`（参数 `cwd`/`passphrase`/`defaultFileName`）+ preload 合同与类型。
   - UI：项目右键菜单（非默认项目，含远程项目）新增「导出项目会话归档」→ 口令确认对话框 → 保存框；成功 Toast 带会话数，零会话/失败 Toast。
   - i18n：project/chat/main ns zh+en 全量。
2. **导入后即时可见（加载）**
   - `importSessionArchiveFromBytes` 对每个实际写入的会话按其记录 cwd 解析列表 cwd 后 `emitConversationListChanged`；渲染端沿用既有 `onSessionsChanged` 防抖重拉，无新通道；幂等跳过（skip-idempotent）不发事件。
3. **反馈 Toast 化**
   - `useChatViewModel` 归档导出失败/导入结果/导入失败由 `alert()` 改为 `showToast`；项目导出结果同走 Toast。
4. **回归保障**：导入的会话文件与源记录往返一致（round-trip 测试），可被现有打开/续跑链路加载。

### 不做

- 不改 OFAR 格式与冲突/指纹语义（TASK-0119 合同不动）。
- 不改侧栏「归档」（archived-sessions，TASK-0135 语义）与会话打开/续跑流程。
- 不做默认「对话」项目的批量导出入口（用户可逐条导出；真实反馈后再立项）。
- 不做导出附件收集（与单会话导出保持一致：仅会话记录）；不做自动/定时备份。
- 不改会话列表扫描与分页性能（transcript 窗口化另有任务）。
- 不运行 `verify:ui:*`（未获用户授权）。

## Given / When / Then

- Given 项目下有 2 条会话；When 用户右键项目 →「导出项目会话归档」→ 输入口令确认 → 选择保存位置；Then 生成单个 `.ofar`，含全部 2 条会话记录，成功 Toast 显示「已导出 2 条会话」。
- Given 项目下没有任何会话；When 用户触发项目导出；Then 不弹保存框，Toast 提示项目暂无可导出的会话。
- Given 上一台机器导出的项目 `.ofar`；When 用户「导入会话归档」选择该文件；Then 每条会话写入正确目录后侧栏对应项目下即时出现（无需折叠/重启），重复导入同一文件幂等跳过。
- Given 导入完成；When 用户点击新出现的会话；Then 走既有打开链路加载完整历史并可继续对话（恢复会话语义不变）。
- Given 导入口令错误或归档损坏；When 用户确认导入；Then Toast 显示失败原因（不再出现阻塞式 alert），侧栏无脏数据。

## 必须保持

- 单会话导出/导入、冲突判定（指纹幂等/复制/覆盖）与目录落点（BUG-0032 语义）不变。
- 消息、工具调用、usage、错误与取消语义不受影响；归档仅搬运既有 jsonl 记录，不改写内容。
- IPC 新通道为纯新增，不破坏既有 `export`/`import` 合同；preload 类型同步更新。
- 所有用户可见文案走 i18n（zh 为准，en 同步）；Electron 不支持的 `prompt`/不推荐的阻塞 `alert` 不新增。
- 项目菜单对远程项目保持现有可见性规则（导出入口对远程项目可见：会话记录在本机）。

## 测试与验证

- 定向测试（仓库 Node runner）：
  - `session-archive-service.test.ts`：多会话导出 round-trip（2 会话 → 解码还原记录与身份）、零会话、单文件读取失败整包失败；导入写入逐会话 emit 列表变更事件（含列表 cwd 解析）、幂等跳过不 emit。
  - 新增/扩展 IPC 合同测试：`export-project` 参数校验、零会话路径、通道注册。
  - preload 合同测试：`sessionArchive.exportProject` 通道名与参数透传。
  - `useProjectsPanelMenusModel.test.tsx`：导出动作 → 确认对话框 → IPC 调用 → Toast 分支（成功/零会话/失败）。
  - `useChatViewModel.archive.test.tsx`：alert 断言改为 Toast 断言。
  - theme-ui `ProjectContextMenuView`：新菜单项渲染与回调（若现有视图测试覆盖菜单则扩展）。
- 用户流程：导出 → 导入 → 侧栏即时可见 → 打开续跑（以服务层 round-trip + 既有打开链路测试共同证明）。
- 质量检查：`check:quick` → 定向 + `test:impact` → 完整 `bun run check`（含 desktop tsc）。

## 验收分层

- 工程验证：待执行；绑定上述命令与结果。
- 技术评审：自审（记录于交付记录）。
- 集成：与 frontmatter integration_status 同步。
- 人工功能验收：待验收（真实 Desktop 操作导出/导入/刷新/续跑）。
- 发布：未授权；仅更新当前版本 release notes，不触发发布。

## 功能验收包

- 入口与前置条件：侧栏项目（本地或远程）右键菜单；chat 顶栏「导出/导入会话归档」。
- 操作步骤：右键项目 →「导出项目会话归档」→（口令可空）→ 保存；再「导入会话归档」选回该文件 → 观察侧栏即时出现 → 点击会话继续对话。
- 预期行为与最终产物：`.ofar` 多会话归档；导入即时可见；Toast 反馈；历史完整可续跑。

## 交付记录

- 2026-10-21 工程交付（主工作区串行，branch main）：
  - **项目会话导出**：`session-archive-service.ts` 新增 `parseConversationFile`（单/多会话共用解析）与 `exportProjectSessionsArchiveToBytes/WithDialog`（多会话打包，零会话返回 `no-sessions` 不弹框，任一文件读取失败整包失败并带文件名）；IPC 新通道 `vetta:session-archive:export-project`（校验 cwd，经 `listSessionHistory` 枚举含 ssh:// 远程项目的本地会话）；preload 类型与 API 同步；项目右键菜单新增「导出项目会话归档」（`useProjectsPanelMenusModel` 口令确认对话框 → Toast 成功计数/零会话/失败）。
  - **导入后即时可见**：`importSessionArchiveFromBytes` 对每个实际写入的会话按记录 cwd 解析列表 cwd 后 `emitConversationListChanged`（默认对话 uuid 子目录映射回默认对话列表 cwd）；幂等跳过不发事件；渲染端沿用既有 `sessions-changed` 防抖重拉，无新通道。
  - **反馈 Toast 化**：`useChatViewModel` 归档导出失败/导入结果/导入失败由 `alert()` 改 `showToast`（doneCopy=success、其余 info、失败 error）。
  - **菜单重构**：`ProjectContextMenuView` 由手写按钮改为 `ContextMenuView` 声明式节点（与 SessionContextMenuView 同模式，消除 DESIGN D03 新增违规；禁用原因按会话菜单惯例写在行内）；远程项目可见导出入口。
  - **i18n**：project ns `contextMenu.exportSessions` + `projectExport.*`（zh/en）、main ns `sessionArchive.projectExportDialogTitle`（zh/en）。
  - **测试**：服务 8 例（新增 5：多会话 round-trip、零会话拒包、坏文件整包失败、导入逐会话广播+幂等静默、默认对话 cwd 映射）；IPC 合同 5 例（新文件）；preload 合同 1 例（新文件）；菜单模型 6 例（新增 4：口令对话框/IPC 载荷/零会话/失败）；chat 归档 6 例（新增 2：Toast 替代 alert）；theme-ui 项目菜单 4 例（新增 2：远程可导出+回调、无导出器不渲染）。
  - **验证**：定向 6 文件 30 例全过；`test:impact` desktop 18 文件 85 例 + theme-ui 25 文件 186 例全过；desktop `tsc --noEmit` 0 错；`check:quick`、完整 `bun run check`（lint+types+guards）exit 0。
  - **并行说明**：同工作区 TASK-0351（浏览器元素直发 Agent）在途；其提交 `79b7fe4bb` 连带提交了本任务先行写入的 3 条 v0.1.3 发布说明条目（内容无损，已在 HEAD）；本任务其余文件单独提交。
  - **未运行项**：`verify:ui:*`（未获用户授权）；真实 Desktop 人工验收（导出→导入→侧栏即时可见→打开续跑）待做。
  - **提交**：`35d35faec`（本地 main，24 文件；pre-commit 门禁通过）；2026-10-22 经用户授权 `git push origin main:dev`，`1b25abff0..1af5c0253` 抵达 origin/dev（含本任务两提交、TASK-0350 记录、TASK-0351 两提交），fetch 后 `origin/dev` == main == `1af5c0253` 核对一致；推送前复核：types/guards 全绿，lint 红仅来自另一会话未提交在途文件（不在推送范围），范围内 picker 测试 5 例补跑通过。
  - **跨实例迁移验证**（2026-10-22，应用户「从一个实例导出到另外一个实例」验收请求新增 3 例回归）：
    - 同一项目路径：A 的分片目录项目归档导出 → 换 `VETTA_CODING_AGENT_DIR` 模拟实例 B 导入，副本落 B 的分片目录、记录与解码结果往返一致、A 侧原文件不受影响、B 重复导入指纹幂等跳过、错误口令拒绝；
    - 源路径在 B 不存在（两机检出路径不同）：副本按记录中的源 cwd 落 B 对应分片——可见性取决于 B 是否登记该路径为项目，属现行按-cwd 分片设计语义，已用测试固化；
    - 默认对话跨 `VETTA_HOME`：`vi.resetModules` + 独立 VETTA_HOME 重载模块图模拟实例 B，副本落 B 的默认会话目录并广播 B 的默认对话列表 cwd；
    - 定向 11 例全绿（含新 3 例），`bun run fix` 后复跑全绿，`check:quick` 通过。
