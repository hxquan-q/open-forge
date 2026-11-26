---
id: TASK-0528
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: [TASK-0527]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: ad8e99c0c
read_paths: []
write_paths:
  - packages/plugins/presets/git/plugin.json
  - packages/plugins/presets/git/src/index.tsx
  - packages/plugins/presets/git/src/git/runtime.ts
  - packages/plugins/presets/git/src/git/tab-visibility.ts
  - packages/plugins/presets/git/src/components/GitPanel.tsx
  - packages/plugins/presets/git/src/components/useGitTabMeta.ts
  - packages/plugins/presets/git/test/
  - docs/plugin/ui-slots.md
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: [TASK-0527]
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# Git 面板改用 useMeta 固定上栏（useMeta 首个真实消费者）

## 合同

- 来源与目标：PLAN-0032 P9 工作空间主线真正闭环——手工合并上游 `d753d869f`「Git 面板在仓库存在时固定上栏且禁止隐藏」。依赖 TASK-0527 的 useMeta 管道（含 PluginGlobalSlotHost 透传的本地先行修复）；本地 Git 插件侧目前仍是旧会话切换探测方案（`claimTabAttach` + `setActivityTabVisible`），与上游 pre-d753d869f 状态一致，本次为近乎直接移植。
- 做（本任务）：
  - `useGitTabMeta.ts`（新增）：按上游——`useSyncExternalStore` 订阅探测缓存，cwd 有结论后返回 `{ pinned: true/false }`，探测中或无 cwd 返回 null 不参与候选。
  - `runtime.ts`：`attachedCwds`/`claimTabAttach` 删除，改 `gitTabProbes` Map + 订阅/发布/作废（`peekGitTabProbe`/`onGitTabProbeChange`/`publishGitTabProbe`/`invalidateGitTabProbe`）。
  - `tab-visibility.ts`：补 `ensureGitTabProbe`（inFlight 去重、失败按 not-repo 发布）。
  - `index.tsx`：删除 conversation-changed 探测链与 `claimTabAttach` 逻辑；turn-end 时 `invalidateGitTabProbe()`；注册处 `scope_use` 扩为 `["project", "batch", "automation"]`、补 `useMeta: useGitTabMeta`。
  - `GitPanel.tsx`：`git init` 成功后 `invalidateGitTabProbe(cwd)` 让标签卡重判——上游此处有重复的 `await load()` 两行（第二行冗余），本地只保留一行。
  - `plugin.json`：`pluginApiVersion` 升 `^2.15.0`（useMeta 自 2.15.0 起）；版本号已 0.4.0 与上游一致，不再动。ability.json 上游同提交升 0.4.0，本地已是 0.4.0（TASK-0515 先行），不动。
  - 测试：移植上游 `gitTabMeta.test.tsx` 三例与 `tabVisibility.test.ts` 缓存两例（invalidate 后重探测、同 cwd 去重）。
  - release fragment 一份。
- 不做：其它插件（browser 等）的 useMeta 迁移——上游未做即不做；`setActivityTabVisible` 宿主接口保留（文档已注明它只影响有会话在场的面板）；GitPanel 的 DiffStat 移除等本地既有分叉不回填。
- 保留本地分叉：`HeaderStatusAction`（useGitHeaderAction，TASK-0515 本地先行功能，上游没有）；GitPanel DiffStat 移除、GraphView 等既有本地形态。
- Given / When / Then：
  - cwd 是 git 仓库 → 标签卡固定上栏、无减号入口，历史 `-git:changes` 隐藏记录不再生效。
  - cwd 非仓库 → 标签卡在「+」可添加池（初始化仓库入口可达），不自动上栏。
  - 面板内 `git init` 成功 → 探测缓存作废，标签卡无需切会话即转为固定上栏。
  - 新会话页/项目详情页（无会话事件）也能按工作空间 cwd 正确判定显隐。
- 验证：presets/git 包测试（`bun run test:pkg` 或包内 vitest 定向）；`bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：实机打开 git 项目观察 Git 标签固定上栏无减号；非仓库目录从「+」池添加并执行初始化后自动转为固定。

## 本地先行修复（偏离上游，有意为之）

上游 `d753d869f` 的 `useGitTabMeta` 只在 effect 依赖 `[cwd]` 时触发探测，但宿主 fold 层按标签 id
键控、useMeta 返回 null 不重挂载实例：turn-end 或面板内 `git init` 的 `invalidateGitTabProbe()` 清空
缓存后，effect 永不重跑、探测永不重启，标签卡永久退出候选（实证：invalidate 后缓存永久 undefined、
git 命令不再被调用）。这恰好击碎本任务的核心场景「初始化后自动转为固定上栏」。

修复：effect 依赖扩为 `[cwd, probe]` 且条件 `cwd && probe === null`——缓存被作废（probe 回到 null）
时重跑探测；inFlight 去重保证不会并发重入。`gitTabMeta.test.tsx` 第 4 例改为计数 rev-parse 调用断言
重探测真实发生（上游同例直接等恢复值，会读到 React 尚未冲刷的旧快照而假阳性），并补 afterEach
先 `cleanup()` 再作废缓存的隔离顺序（反向会让未卸载 hook 在广播中串扰共享缓存）。若上游后续修复
同问题，回归合并时按上游形态对齐。

## 交付

- 实际修改：按合同全部落地——`useGitTabMeta.ts` 新增、`runtime.ts` 改 gitTabProbes 缓存订阅模型（`claimTabAttach`/`attachedCwds` 删除）、`tab-visibility.ts` 补 `ensureGitTabProbe`、`index.tsx` 删 conversation-changed 探测链并注册 `useMeta` + `scope_use` 扩三场景 + turn-end 作废、`GitPanel.tsx` init 后作废（一行 `await load()`）、`plugin.json` 升 `^2.15.0`；本地先行修复 effect 重探测（见上节）；测试 `gitTabMeta.test.tsx` 四例 + `tabVisibility.test.ts` 缓存两例；release fragment `git-tab-pinned-by-workspace.md`。
- 验证结果：
  - presets/git 全包：21 文件 109/109 通过；`gitTabMeta` 4/4 五连跑稳定；重探测修复经红绿验证（回退 effect 依赖后第 4 例必败）。
  - `bun run test:impact`（本任务文件清单）：presets/git 包全绿；desktop 套件 14 个失败全部与 TASK-0527 同一批既有 loopback SSH 环境问题，与本次改动无交集。
  - `bun run check`（包内 tsc + 全仓门禁）：通过。
  - 独立复查（verifier）：pass——上游 hunk 忠实、effect 修复正确性与必要性均确认、测试非假阳性。两条 P3 记录不阻断：turn-end 作废瞬间有一帧探测空窗导致 GitPanel view/滚动重置（上游的「永久消失」已降为「一次探测窗口」，后续可用 stale-while-revalidate 消除）；invalidate 不清 inFlight 的窄竞态（turn-end 与首次探测重叠时旧结论写回，下次 turn-end 自愈）。
- 未运行：`verify:ui:*` 与实机 Desktop 验收（需用户授权）；人工验收项：git 项目固定上栏无减号、非仓库从「+」池添加、初始化后自动转固定。
