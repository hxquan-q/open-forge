---
id: TASK-0039
type: task
status: done
priority: P2
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P1-5
execution: parallel
branch: task/TASK-0039-webview-pinned-bounds
worktree: ../open-forge-wt/task-0039-webview-pinned-bounds
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/src/renderer/domains/activity-panel, apps/desktop/src/renderer/domains/plugins, docs/plugin/ui-slots.md]
write_paths: [apps/desktop/src/renderer/domains/activity-panel, docs/plugin/ui-slots.md, packages/plugins/plugin-sdk/CHANGELOG.md, project/tasks/README.md, project/tasks/TASK-0039-webview-pinned-bounds.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0122, TASK-0123, TASK-0154, TASK-0181, TASK-0194, TASK-0196]
integration_status: integrated
created: 2026-09-23
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# webview 剩余口子收口：插件 pinned 上限 + 面板收起卸载校验

## 目标

`activity-tab-residency.ts:4,24` 的 warm=2 + 空闲逐出已生效，唯一无界口子是插件页签声明 `keepAliveWhenAvailable===true` 的 pinned（`plugin-ui-context.ts:353`）。每个 guest webview 是一个独立渲染进程（估算 50–150MB），pinned 无上限即可无限累积。

## 范围

### 并发评估

- 结论：条件支持——activity-panel/plugins 目录与在途任务无代码交集，但 `.github/release-notes/v0.1.3.md`、`project/tasks/README.md` 与 TASK-0196 批次共享，按 dev 逐项集成 + 合并解决。
- 执行方式：parallel（隔离 Worktree）/ 单 Agent 内部串行。
- 分支与 Worktree：`task/TASK-0039-webview-pinned-bounds` @ `../open-forge-wt/task-0039-webview-pinned-bounds`；基线本地 main `48b8e487f`，建树后 fast-forward 到 `origin/dev`（`e1605e4d2`）以取到 TASK-0196 记录。
- 集成顺序：本 Task 独立提交 → 审核 `origin/dev..HEAD` → `git push origin HEAD:dev`（仅 ff）；最终 main 合并归泳道 A Coordinator。

### 做

- 插件 pinned 页签设非活动总量上限 + LRU 驱逐，并保持驱逐可逆（已实现：`DEFAULT_INACTIVE_PINNED_TAB_LIMIT = 3`，驻留集合由 pinned 顺序尾部派生）；
- 校验活动面板整体收起时 webview 是否卸载（核实为**已有等价实现**，retain + 回归验证，未改代码）；
- 一次性预览场景评估改非 persist 分区（评估后不做，见「现状核实」）。

### 不做

- 不动 warm=2 + 空闲逐出既有语义；
- 不降级 webview 的 sandbox/contextIsolation 安全姿态；
- 不手动限制 Chromium 进程数（render_process_host 自适应上限默认生效）；
- 不改内置浏览器的主进程 WebContentsView / `persist:vetta-browser` 分区（见「现状核实」第 3 条）。

## Given / When / Then

- Given：多个插件页签声明 pinned 保活
  When：非活动 pinned 数超过上限
  Then：最久未激活的 pinned 被逐出（页签可透明重建），驻留的 pinned 页签数有硬上限
- Given：插件 pinned 页签已在面板中打开
  When：用户把活动面板整体收起
  Then：docked 页签内容（含 guest `<webview>`）卸载，residency 记录保留；重新展开恢复同一批页签

## 必须保持

- pinned 是插件显式契约：驱逐必须可恢复，逐出后再次打开状态可重建；
- warm 语义与空闲逐出既有行为不回退（pinned 不占用 warm 预算）；
- 当前活动与浮动页签始终驻留。

## 现状核实（2026-10-03，基线 `origin/dev` `e1605e4d2`）

1. **pinned 无上限确认存在**：`services/activity-tab-residency.ts` 旧实现对 `retention === "pinned"` 无条件返回驻留，`activityTabRetention()` 把 `keepAliveWhenAvailable === true` 与 `retention: "pinned"` 一并映射为 pinned。插件任意数量页签声明 pinned 即全部常驻，每个 guest 渲染进程（约 50–150MB）累积无上限。已实现有界 LRU 收口。
2. **面板收起卸载已有等价实现（retain + 验证）**：`components/activity-panel/ActivityPanelView.tsx` 的 `renderDockedPanel = model.isOpen`（commit `11805ee44`）在收起时不再渲染 docked 表面，非浮动页签组件（含 guest `<webview>`）随之卸载；`ActivityPanel.plugin-tabs.test.tsx` 的「does not mount the docked tab bar or docked content while closed」已覆盖该合同。residency 状态保存在仍挂载的 `useActivityPanelModel`/`useActivityTabResidency` 中，重新展开恢复同一批页签，符合「warm 保留 DOM 挂载」语义。未改代码，只复验。
3. **一次性预览改非 persist 分区：不做**。内置浏览器按 ADR-0134 使用主进程 `WebContentsView` + `persist:vetta-browser` 共享分区，改非 persist 会丢失登录态/cookie，属用户可见降级；该收益是磁盘而非内存，超出本 Task 的内存收口目标，也不在本次授权范围内。

## 测试与验证

- 定向测试：`activity-tab-residency.test.ts`（pinned 超限驱逐、被逐出页签重新打开后重建、活动 pinned 不被驱逐、pinned 与 warm 预算互不占用）、`useActivityTabResidency.test.ts`（面板 hook 层的驱逐与重建）、`ActivityPanel.plugin-tabs.test.tsx`（收起卸载既有回归）；
- 用户流程：开多个插件 pinned 页签 → 切换/收起面板 → 展开 → 被逐出页签按需重建；
- 质量检查：`test:impact`、`check:quick`、`bun run check`；
- 未运行：`app.getAppMetrics()` 真实 Electron 进程计数断言（需要真实 Desktop/Electron 边界）；改为纯策略 + 组件层证据 + **真实实例 UI 实测**（见「真实 Desktop UI 实测」），进程上限由「驻留 pinned 页签数有硬上限」间接证明。

## 交付记录

- 实际修改：
  - `apps/desktop/src/renderer/domains/activity-panel/services/activity-tab-residency.ts`：新增 `DEFAULT_INACTIVE_PINNED_TAB_LIMIT = 3`、`pinnedLru` 状态与 `resolveResidentPinnedActivityTabIds()`；`resolveResidentActivityTabs()` 按尾窗口派生 pinned 驻留集合（逐出可逆、活动/浮动始终驻留），`reconcileActivityTabResidency()` 维护 pinned 顺序。
  - `apps/desktop/src/renderer/domains/activity-panel/hooks/useActivityTabResidency.ts`：透传 `maxInactivePinnedTabs`。
  - 测试：`activity-tab-residency.test.ts`、`useActivityTabResidency.test.ts`。
  - 合同文档：`docs/plugin/ui-slots.md`（pinned 预算与进程代价）、`packages/plugins/plugin-sdk/CHANGELOG.md`（`[Unreleased]`，说明为什么，`pluginApiVersion` 不变）。
  - 发布说明：`.github/release-notes/v0.1.3.md`。
- 实际运行：见「实际验证」小节（含红测基线）。
- 未运行及原因：真实 Electron `app.getAppMetrics()` 进程计数、`verify:ui:*`（本批明确不做视觉校验，且需真实 Desktop 授权）。
- Worktree：`../open-forge-wt/task-0039-webview-pinned-bounds`（`bun run task:worktree -- create --no-write --no-setup` 创建，`bun install` + `prepare:workspace:dev` 初始化；主检出未留改动）。
- 剩余风险：pinned 预算改变了插件可见的驻留语义（已在手册与 CHANGELOG 记录）；超过预算时长驻页签（如未激活的内置浏览器页签）不再预先挂载，首次打开时才建 WebContentsView（功能不变，首帧略晚）；无真实 Electron 进程数实测证据。

## 验收分层

- 工程验证：通过——见下方「实际验证」，绑定本分支提交；完整 `bun run check` 在本次全部代码/文档/记录改动落地后跑绿，并在合并远端 dev（含 TASK-0154/0166/0167/0194 批次）后复跑再绿。
- 技术评审：自审（diff + 合同比对 + 门禁）；未做独立评审。
- 集成：`integrated`——已 fast-forward 推送 `origin/dev`（`d5a29042f..2de27ed59`）；本 Task 提交 `48e02a380`（实现/文档/记录）、`033e0baa8`（合并远端 dev）、`f7c91c04d`（补登写路径冲突），后续集成与本地 main 合并归泳道 A Coordinator。
- 人工功能验收：**本轮在「全程自动」授权下由 Agent 在隔离 Debug 实例上实测闭合**（见「真实 Desktop UI 实测」）；判据为 DOM 挂载集合与实例 id，非主观观感。仍无真实 Electron 进程计数实测。验收结论仍归用户。
- 发布：未授权。

## 真实 Desktop UI 实测（2026-10-08，VERIFY-0017 组一续测十九）

GWT 要求「多个插件页签声明 pinned」，随包预设无此声明，故本轮自建夹具插件测：

- **夹具**：`packages/plugins/externals/pinned-probe/`（复制兄弟插件目录 + `node_modules` junction + `bunx vite build` 产 MF `dist/`，**未动 `bun.lock`**），注册 PP-A…PP-D 四个 `retention: "pinned"` 活动页签，各渲染一次性生成的 `data-mount-id`（逐出/重建可直接从 DOM 判读）；以 `VETTA_PLUGIN_DEV`（16 预设 + `pinned-probe`）dev-link 进隔离 Debug 实例。候选池 = 4 夹具页签 + 随包 `plugin:content-creation:workspace` = 5 个 pinned 候选，预算 3；驻留集合用 `[data-activity-tab-content]` 枚举。
- **重置初态后的读数**（重载渲染进程 + 重开面板，`active=file`）：驻留 = `file` + PP-B/PP-C/PP-D，PP-A 与 `content-creation` 被逐出 ⇒ 非活动 pinned 驻留硬上限 3。
- **逐出可透明重建、驻留保持实例**：点开已被逐出的 PP-A → 新 id `ew81wu` 重建并驻留（驻留 4 = 3 非活动 + 1 活动，活动不占非活动预算），PP-B/PP-C/PP-D 的 id `u930fi`/`qubfh1`/`br8xbw` 逐个不变。
- **逐出跟随激活顺序**：随即切到内置 `browser`（非 pinned 活动）→ 被逐出的是 PP-B（此时最久未激活者），刚激活的 PP-A 与 PP-C/PP-D 保留、id 不变。
- **收起卸载 + 记录保留**：点「关闭活动面板」→ `[data-activity-tab-content]` 归零（docked 表面整体卸载）；重新展开 → 仍是同一批 PP-A/PP-C/PP-D（PP-B 依旧逐出）。判别：若记录随收起丢失并从头登记，`active=browser` 下驻留会回到 {B,C,D} 且 A 被逐出——实测相反。
- **未覆盖（如实记录）**：夹具页签渲染普通 React（插件 SDK 与 `docs/plugin/ui-slots.md` 无 `webview` 贡献面），故「guest `<webview>` 卸载」无实时读数，证据为同一 `renderDockedPanel = model.isOpen` 闸门 + 既存组件测试 `ActivityPanel.plugin-tabs.test.tsx:95`；`app.getAppMetrics()` 进程计数仍不做。夹具目录已在提交前删除。
- 截图：`0039-pinned-residency-strip.png`（artifactDir）。

## 实际验证

| 命令 | 结果 |
|---|---|
| `bun run --cwd apps/desktop test -- …/services/activity-tab-residency.test.ts`（**旧实现基线**，仅回退该源文件） | 红：新增 3 例 failed、原有 5 例 passed（旧实现对 pinned 无条件驻留） |
| 同上（新实现） | 绿：8/8 |
| `…/hooks/useActivityTabResidency.test.ts` | 绿：2/2 |
| `…/components/ActivityPanel.plugin-tabs.test.tsx` | 绿：4/4（含既有「收起时不挂载 docked 内容」用例 → 本 Task 第 2 项为 retain + 验证） |
| `bun run test:impact -- apps/desktop/src/renderer/domains/activity-panel/services/activity-tab-residency.ts apps/desktop/src/renderer/domains/activity-panel/hooks/useActivityTabResidency.ts` | 绿：25 个测试文件 / 108 例通过（95.01s） |
| `bun run check:quick -- <上述 4 个受改动源/测试文件>` | 绿：Biome 4 文件 0 fix |
| `node scripts/quality/check-modified-file-notices.mjs --baseline scripts/quality/baselines/modified-file-notices.txt` | 绿：`new=0` |
| `bun run check`（最终一轮，全部改动落地后） | 绿：`check:lint` / `check:guards` / `check:types`（root·cli·desktop·docs·mobile）/ mobile lint 全部 exit 0 |

首轮 `check` 曾红并已修复：`check:lint`（Biome 期望单行 `toEqual`）、`check:guards`（4 个改动文件缺 `// Modified by The Open Forge contributors.` 声明头；TASK-0039 与 TASK-0122/0123/0181 的 `write_paths` 重叠未登记）、`check:types`（新测试使用了非 `ActivityTabKey` 字面量与未导入的类型）。修复后最终一轮全绿。

> 记录说明：`check:guards` 的告警 `fatal: Not a valid object name upstream/dev` 为环境缺 `upstream` remote 的既有噪音（基线回落 `upstream/dev@d217984c72ef`），本 Task 未新增或放宽任何检查。

推送前复验（合并远端 dev 后）：远端两次前进（TASK-0154/0166/0167/0194 等批次）均先 merge 再复验。合并后的内容上，定向 3 文件 / 14 例、`bun install --frozen-lockfile`、完整 `bun run check`（lint·guards·types root/cli/desktop/docs/mobile·mobile lint）全部通过，随后 `git push origin HEAD:dev` fast-forward 成功（`d5a29042f..2de27ed59`）。

过程偏差（如实记录）：为把远端 dev 纳入分支，第二次合并使用了 git 默认英文单行 merge 标题（`2de27ed59`）。`--amend` 被规则禁止、改写已合并历史风险更高，且并行批次已先推入同形的默认 merge 标题（`d5a29042f`、`2b1f4272c`），故保留原样并在交付中披露；后续合并改用 `--no-commit` + 显式中文多行消息。实现与验证结论不受影响。
