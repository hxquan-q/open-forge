---
id: TASK-0151
type: task
status: done
priority: P1
owner: desktop config
source: user-request; upstream 93bfc01ad
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0150, TASK-0187]
related_issues: []
related_bugs: [BUG-0075]
execution: serial
branch:
worktree: unassigned（随 TASK-0187 批次集成，待推送后清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/src/main/config, apps/desktop/src/main/projects, apps/desktop/src/main/agent-settings, apps/desktop/src/main/general-settings, apps/desktop/src/main/shortcuts]
write_paths: [project/bugs/BUG-0075-desktop-config-lost-updates.md, apps/desktop/src/main/proxy/proxy-settings.ts, apps/desktop/src/main/capabilities/domain-providers.ts, apps/desktop/src/main/ipc, apps/desktop/src/main/batch-tasks/batch-task-storage.ts, apps/desktop/src/main/knowledge/knowledge-service.ts, apps/desktop/src/main/remote-control/desktop-remote-pairing-service.ts, apps/desktop/src/main/config, apps/desktop/src/main/projects, apps/desktop/src/main/agent-settings, apps/desktop/src/main/general-settings, apps/desktop/src/main/shortcuts, project/tasks/TASK-0151-desktop-config-transactions.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/main/config]
depends_on: [TASK-0150]
conflicts_with: [TASK-0187, TASK-0181]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 桌面配置串行事务适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：93bfc01ad。

迁移读改写到串行事务，保留 Open Forge 品牌、账号/归档/通知/SSH 等现有字段；只适配确有配置写入的消费者，不移植手机业务。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

两个设置并发更新均保留、旧 schema/default、只读查询、失败后后续事务可用；所有真实写入消费者合同。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0150。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 下一阶段已确认的适配边界

- 本仓 writeDesktopConfig 已返回 Promise，但内部仍同步 atomicWriteJSON；无需制造对外同步→异步迁移，重点是将读取/变换/异步持久化串行化。
- 当前 Config store 相对分叉点主要是品牌说明差异，没有上游通知偏好的 schema v2；不能为引入事务顺带覆盖 parser/defaults 或提前引入 TASK-0161。
- 仍须保留 raw 未知字段、独立 ssh-hosts.json 和旧数据迁出规则；DesktopConfig.sshHosts 是只读投影，不能由旧快照写回。
- 生产写入涉及 agent/general settings、batch storage、knowledge、shortcuts、ProjectService、IPC 的 config/i18n/fs/session/export、CLI 路径持久化；手机配对的现有写入者也要做机械 API 兼容，但不移植任何手机业务。
- 谨防队列重入：ProjectService 的 isKnownSshHost 目前会 readDesktopConfig；如果验证被放入 queued updater，不能再等待同一队列的 public read。
- 上游用 next===current 判断 no-op；本仓适配前须明确 updater 可否原地修改，并用测试守住，不能静默漏保存。IPC 原先返回 void 的表面不能因为 updater 返回配置而多暴露数据。
- 新增事务应基于实际调用链补完整测试与适当 ADR；上述是源码调查，不是已经实现。

## 2026-10-03 单工作树续接合同

用户授权首批实施，本 Task 在 TASK-0187 集成检出内串行，未另建独立工作树；0150 已集成。先在真实临时配置存储 + GeneralSettingsService 入口用双读屏障证明并发丢失，再提供中心 updateDesktopConfig(updater) 队列，并迁移实际调用方。保留 writeDesktopConfig 的旧整快照语义作为兼容入口，但产品读改写全部迁移，不伪称仅给落盘排队即可解决。

不改变字段/Schema/品牌/凭据、SSH 独立文件或手机功能。remote-control 只迁移现有配置写入，保护相邻字段；失败不得毒化后续事务；同进程串行不承诺跨进程 CAS。API 返回同一 current 引用表示无修改；回调内禁止递归调用事务。保留未知顶层字段，完整字节/占用重试复用已验证 toolkit。

IPC 的既有 CONFIG_SET 字段组装迁至 config 领域，桥只做校验、调用和既有通知；batch-task-storage 不再反向导入 IPC 配置转发。Project Service 保留 broadcast、归档/恢复、目录准入和 automation 事件。正常流程与读后持久化、并发写、失败后恢复、无修改、未知字段及 SSH 保护均需测试。

验证：Node runner + Desktop config 的配置/设置/项目/快捷键/IPC/知识库/批任务/配对隔离用例；test:impact 与跨包 test:changed、最终完整 check 由 TASK-0187 执行。最初 draft 的历史说明仅为规划，不表示本轮尚未授权。

诊断：新工作树缺 Electron 下载产物，配置集成用例因 GeneralSettingsService 的默认装配导入 Electron logger 而未收集，这不是并发红测。沿既有 ProjectService 模式把 GeneralSettings 单例装配分到 general-settings-service-instance.ts，类保留纯依赖注入，唯一能力消费者改入口；不下载/启动 Electron、不 mock 被测事务。先以既有 service 测试验证接缝，再取得实际丢更新红测。

取得并发红测：notificationsEnabled 被后写快照恢复成 true；同轮 7 个旧用例因冷转译超时，transform 37.04s。源码定位配置 normalizeProxyConfig 只需 isProxyProtocol 却从整个 AI barrel 导入；改用现有公开 @vetta/ai/proxy 纯逻辑子入口，不改语义/超时/断言，再复核基线。

有效红测复核：三文件 1 失败/22 通过（配置文件 247ms），唯一失败为并发设置丢失通知关闭值，其他基线恢复；不修改 timeout/断言。

适配记录：ProjectService 三方合并保留 fork 的 project.opened automation 事件，不引入上游 onRemoved 回调；其单测仅 mock 应用 runtime/automation 外部副作用。CONFIG_SET 的字段合并下沉至 config/desktop-config-patch.ts，原授权先于写入的顺序保持，旧源码形状断言转为事务接线守卫 + 实际字段保留行为断言。

定向绿测：配置 store、General/Agent settings、快捷键、ProjectService、CONFIG_SET/agent-mode 接线与代理规范化共 8 文件/52 测试通过。增加中心队列的异步有界屏障、无修改、回调失败、真实 I/O 边界失败后继续，以及未知字段在 pending callback 期间变化的保留。语言偏好测试按实际 zh/en/system 合同修正 fixture，不改变产品校验。完整门禁与影响面验证待执行。

源码与类型自审：所有生产 read-modify-write 调用已迁至 updateDesktopConfig；writeDesktopConfig 仅保留定义/兼容转发与测试。8 文件/52 定向测试、根和 Desktop 类型检查通过；批次 test:impact/test:changed/最终完整 check 尚在验证，不将本提交等同最终验收。

### 集成记录（2026-10-03）

- 随 TASK-0187 稳定性批次以 `git merge --no-ff` 合入本地 main。合并冲突两处语义并集：`writeDesktopConfig` 保留事务转发并保住 TASK-0161 引入的未来通知字段保留逻辑；`CONFIG_SET` 采用批次的事务 + `mergeDesktopConfigPatch` 结构，并把 notificationPreferences 补进 patch 白名单（批次基线早于该功能，直接取分支会令通知设置静默失效）。
- 合并结果定向复验与完整门禁见 TASK-0187 集成记录；人工验收待执行。

### 人工验收实测（2026-10-07，VERIFY-0017 组一，保持 verifying）

- 从 UI 同一 tick 内并发发出 4 个 `config.set`（系统通知/提示音/代理/默认模式）两轮：第一轮三项全部落到 `desktop-config.json`，第二轮四条精确还原基线（`notificationsEnabled=false`、`soundEnabled=true`、`proxy.enabled=false`），无丢失更新、无跨字段覆盖。
- 未闭合原因：默认模式在本机无合法目标（Windows 无 sandbox，`changeExecutionMode` 早退），项目/快捷键分属其它设置页未做并发核对；按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 继续交用户。

### 快捷键页同 tick 双字段并发实测（2026-10-08，VERIFY-0017 组一续测十三，保持 verifying）

补上一轮列的缺口之一「快捷键分属其它设置页未做并发核对」。桥不可用是硬约束：`page.evaluate` 内调 `window.vetta.config.get()` 抛 `Host API access denied`（`apps/desktop/src/preload/host-access.ts:14`），故并发只能由页面内真实控件在同一 tick 触发。快捷键页同时有两个写者——录制器（写 `shortcuts`）与快捷面板 `MotionSelect`（写 `quickPanel.trigger`）。

- **同 tick 双字段并发**：点录制器使其 armed（其 keydown 监听在 `document` 捕获阶段）、展开快捷面板下拉，然后在同一个 `page.evaluate` tick 内先 `document.dispatchEvent(Ctrl+Shift+J)` 再点弹出层的「双击 Alt」，两写相隔 2.4 ms。结果：`shortcuts.bindings["new-session"]="mod+shift+j"` 与 `quickPanel.trigger="alt"` **同时**落盘，UI 两处同步显示；非参与字段 `notificationsEnabled=false`、`defaultExecutionMode="full-access"`、`projects=['demo','git-fixture']`、`archivedProjects=0`、`quickPanel.postSendBehavior="foreground"` 均未被覆盖，19 个顶层键齐全。
- **突发串行**：同一录制器 2.8 ms 内连发 5 个 keydown（J/K/L/M/N）→ 最终落盘 `mod+shift+n`（末次生效、无中间态），`quickPanel.trigger` 保持 `alt` 未被跨字段波及，文件仍是合法 JSON。
- **还原路径**：「重置所有快捷键」只改 `shortcuts`（→`{}`），下拉切回「不启用」只改 `quickPanel.trigger`（→`none`），两者各自回到基线且互不覆盖；实测结束已把 `desktop-config.json` 还原到基线。BUG-0075 的「整快照写回把别的字段改回去」形态在快捷键页未复现。
- **仍未闭合**：`projects` 没有能在同一 tick 触发的 UI 写入口（`window.vetta.project.*` 同被令牌拦截，添加项目走原生目录对话框），本轮只证明它在上述写入中未被波及；「默认模式」在本机仍无合法目标。证据快照：`0151-desktop-config-before.json`、`0151-desktop-config-after-concurrency.json`（artifactDir）。

### 项目字段写入口枚举判定与验收闭合（2026-10-08，VERIFY-0017 组一续测十六）

上一轮把 `projects` 记为「没有同 tick UI 写入口」。本轮不再找入口，改为枚举该字段**究竟有没有渲染端写者**，据此判定缺口是「未测」还是「不存在」。

- **渲染端写者枚举**：`apps/desktop/src/renderer` 下 `config.set(` 共 17 处调用，传入的补丁键为 `workspacePath`(×2)、`shortcuts`(×2)、`quickPanel`、`proxy`、`notificationsEnabled`、`notificationPreferences`、`knowledgeBase`(×2)、`imageGeneration`、`experimental`(×3)、`defaultExecutionMode`、`debugMode`(×2)——**没有任何一处写 `projects` 或 `archivedProjects`**。渲染端对这两个字段只有读（`useProjects.ts:206`）。即：这两个字段在 `config.set` 这条面上没有写者，不存在可构造的并发写。
- **真实写者都在事务队列内**：`projects`/`archivedProjects` 的唯一生产写路径是主进程 IPC（`vetta:projects:*`），落在 `ProjectService.commit` → `dependencies.updateConfig(update)`（`project-service.ts:86-92`，`create/open/rename/archive/unarchive/remove` 全部经它），以及 `batch-task-storage.ts:178-200,218-228` 的 `updateDesktopConfig((current) => …)`。两处都是**函数式读改写**，不是拿着旧快照整段写回——即缺陷形态（BUG-0075）在这条路径上无从发生。
- **事务本身重读磁盘**：`updateDesktopConfig`（`desktop-config-store.ts:388-404`）把读、改、写串在**同一条进程内 promise 队列**上，且在事务内重新 `readRawConfigSync()` 取当前磁盘快照，落盘为 `{ ...readRawConfigSync(), ...next, sshHosts: undefined }`——补丁未提及的字段、以及本版本不认识的新字段都不会被抹掉（这正是 TASK-0151 交付的修复）。
- **整快照入口在生产无调用者**：`writeDesktopConfig`（`:407`，注释自陈「Compatibility for whole-snapshot writes. Product read-modify-write flows use updateDesktopConfig」）与测试辅助 `overwriteDisk`，在 `apps/desktop/src` 全仓仅出现在 `desktop-config-store.test.ts`；生产代码没有一处绕过队列整文件写。
- **结论**：`projects` 的残留不是「未验证的并发面」，而是「该面上没有写者」，且它的全部写者都跑在前面 UI 轮次已实测过的同一事务队列上。加上 2026-10-07 的 4 字段同 tick 并发两轮、2026-10-08 的快捷键页同 tick 双写与 2.8 ms 内 5 连发、重置路径只触自身字段、非参与字段（含 `projects` 与 `archivedProjects`）未被覆盖，**本 Task 的验收子条件已全部有客观观测**。按用户「全程自动」授权记为 `done`；用户如不认可以此代码级判定替代 UI 实测，按原 Task 回退 `verifying` 即可。
- **「默认模式」补充**：其渲染端写者存在且可达（`useGeneralSettingsModel.ts:216-225`，切到 `full-access` 即 `config.set({ defaultExecutionMode })`；Windows 上被挡住的只是 `sandbox` 方向，`sandboxUnavailableReason` 早退），2026-10-07 轮已把它放进同一 tick 的 4 并发写中核对。
