---
id: TASK-0080
type: task
status: done
priority: P1
owner: apps/desktop renderer/conversation + workspace-mode
requirement: REQ-0004
plan: PLAN-0001
source: code review 修复批（4 个 finder 独立命中；修复 TASK-0077 引入的徽章派生缺陷）
execution: parallel（code review 修复批，与其他修复 task 文件集不重叠）
branch: forge/dev
worktree: unassigned（forge/dev 主工作区）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarView.tsx, apps/desktop/src/main/conversations/resolve-session-config.ts]
write_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.test.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar/InputBarView.test.tsx]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/session-axes.ts, apps/desktop/src/renderer/domains/conversation/components/input-bar/DefaultInputBarConnector.tsx]
depends_on: [TASK-0077]
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
---
<!-- Copyright The Open Forge contributors. -->

# session-axes 徽章派生单点化

## 根因（finder 交叉确认）

1. **复制粘贴缺陷**（`DefaultInputBarConnector.tsx:106-107`）：`axis` 与 `profile` 用逐字相同的三元（OR 两个轴），两标签永不相异；`(agentMode=work, capabilityProfile=coding)` 会话误报 coding/coding，恰好掩蔽双轴徽章本要暴露的分歧。
2. **与 main 侧折叠口径相反**：`DesktopAgentMode` 是裸 string；renderer 折叠「非 coding 即 work」，main（`resolve-session-config.ts:135-139`）对 profile 是「非 work 即 coding」——第三值（手编 defaultAgentMode='architect' 类）两侧结论相反，徽章谎报工具面。
3. **双重插值 + 单次替换**（`session-axes.ts:26`）：`t(key, values)` 已由 i18next 插值，helper 的手动 `.replace("{{...}}")` 是第二遍 no-op，且 `String.replace` 只替换首个占位符——重复占位符的翻译会渲染字面花括号。

## 做

1. `session-axes.ts` 新增 `resolveSessionAxes(agentMode, capabilityProfile)`：`axis` 只从 `agentMode` 派生、`profile` 只从 `capabilityProfile` 派生；未知值的折叠口径与 main 侧逐一对齐（profile 未知→coding；axis 未知→work 侧对齐后写入注释），成为唯一派生点。
2. `DefaultInputBarConnector.tsx` 删除两处内联三元，改调 helper。
3. `formatSessionAxesBadge` 去掉手动 replace（i18next 是唯一插值层），或改接 raw key 由 helper 统一处理——选一种，不留双通道。
4. 补 `InputBarView` 组件测试（AGENTS.md §9：条件渲染必须有组件/hook 测试）：有/无 axes、`(work, coding)` 分歧场景两标签不同、未知第三值的折叠。

## Given / When / Then

- Given `(work, coding)` 会话，When 输入栏徽章渲染，Then 显示 work 解释 · coding 工具（两标签可分）。
- Given 手编第三值 agentMode 的旧会话，When 徽章渲染，Then profile 标签与 main 实际 resolve 的工具面一致。
- Given 普通会话（无 axes），Then 无徽章（现状保持）。

## 测试与验证

- `session-axes.test.ts` 表驱动（各轴独立、未知值、与 main 口径对齐）；`InputBarView.test.tsx` 组件级。
- 命令：`cd apps/desktop && bun ../../scripts/quality/run-vitest.mjs --run <file>`；tsc 定向。

## 交付记录

- 实际修改（2 源文件 + 2 测试）：
  - `session-axes.ts`：新增 `resolveSessionAxes(agentMode, capabilityProfile)` 成为徽章轴唯一派生点——axis 只读 agentMode（非 coding 即 work，同 main `normalizeDesktopAgentMode`/`LEGACY_SESSION_AGENT_MODE`）、profile 只读 capabilityProfile（非 work 即 coding，同 main `resolveDesktopSessionConfig`），两轴互不借用取值；`formatSessionAxesBadge` 去掉 `interpretation`/`profile` 参数与手动 `.replace`——i18next `t(key, values)` 是唯一插值层，只保留「无轴返回 null」裁决与模板透传。
  - `DefaultInputBarConnector.tsx`：删除 `sessionAxesLabel` 里两处逐字相同、互相 OR 的内联三元（复制粘贴缺陷：`(work, coding)` 会话误报 coding/coding），改调 `resolveSessionAxes`，连接层只做取词与拼装。
  - `session-axes.test.ts`：`resolveSessionAxes` 表驱动 7 例（恒等、双轴分歧、undefined/第三值/脏空串折叠，每例注明与 main 对齐点）+ badge「单轴也展示」「模板透传不做第二遍替换」2 例。
  - `InputBarView.test.tsx`（新建）：组件级 4 例——有轴展示、无轴不渲染 testid、`(work, coding)` 两标签各自成立（含不泄漏 `{{`）、未知第三值折叠与 main 口径一致；跨包组件按仓库惯例打桩。
- 实际运行：定向 4 文件（session-axes + InputBarView + 邻居 InputBarFooter/workspace-mode-copy）共 24/24（主线复跑）；Biome 2 个 .ts 文件零问题（2 个 .tsx 被 biome.json `files.includes` 既有策略排除）；desktop 全量 tsc 对本任务文件零命中。
- 未运行及原因：全量 `bun run check` 混入并行任务在途文件噪声，以定向 Biome + 定向 tsc 过滤替代；发布说明按 ISSUE-0007 门禁暂存本记录。
- 剩余风险：`(agentMode="work", capabilityProfile=undefined)` 的 ADR-0128 前旧会话，徽标工具面按常量折叠报 coding 而 main 若重算会折 work——main 对已恢复会话不重算，无运行时矛盾，helper 注释已说明；`InputBarView.test.tsx` 的文案断言固定当前 locale 措辞，locale 改名需同步；并行会话的 bun.lock react 版本漂移（react@19.3.0 vs react-dom@19.2.8）使渲染真实 theme-ui 的既有组件测试基线失败（与本任务无关，测试已按惯例打桩规避），需依赖归属会话收敛。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【修复】输入栏的模式徽章如实区分解释模式与工具面，不再把两者混报为同一档。
