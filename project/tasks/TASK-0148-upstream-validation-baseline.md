---
id: TASK-0148
type: task
status: done
priority: P1
owner: desktop + theme-ui + quality
source: user-request; upstream 46df74190, 197a7645c
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: []
related_issues: []
related_bugs: [BUG-0056]
execution: parallel
branch: task/TASK-0148-upstream-validation-baseline
worktree: ../open-forge-wt/task-0148-upstream-validation-baseline
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [apps/desktop/vitest.config.ts, packages/theme-ui/package.json, scripts/quality/quality-gates.test.mjs, docs/dev/quality-gates.md]
write_paths: [packages/theme-ui/src/settings/achievements/achievement-badge-lazy-boundary.test.ts, project/tasks/README.md, scripts/quality/run-vitest.mjs, scripts/quality/vitest-env.mjs, apps/desktop/vitest.config.ts, packages/theme-ui/package.json, scripts/quality/quality-gates.test.mjs, docs/dev/quality-gates.md, project/tasks/TASK-0148-upstream-validation-baseline.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/quality/run-vitest.mjs, scripts/quality/vitest-env.mjs, packages/theme-ui/package.json]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 验证入口与 Windows 并发适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：46df74190, 197a7645c。

将上游 Windows 并发限制适配到共享 Node runner，Windows 默认 2 worker，保留 CLI 显式覆盖；为 theme-ui 增加既有 Node runner 测试入口。先验证当前工作区，保留 TASK-0147 功能与所有测试断言/超时。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

质量脚本合同、theme-ui 全包、Desktop 全包；无检查并行的单独全量回归。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：无。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## 适配取舍

上游本地 8/CI 2 的配置在当前机器完整影响面仍出现多个超时（运行中 16 逻辑 CPU、32 GiB 内存、约 3 GiB 空闲）；theme-ui barrel 的单包首次运行通过、影响面再次运行触发 5 秒超时。改为共享 Node runner 默认 Windows 2 worker，让 theme-ui 与 Desktop 使用同一资源边界；不是复制同一值到每个包。CLI 显式限制仍被保留。所有原 test/hook 超时不变，未删除或跳过测试。该调整仍需最终全量回归验证，不先声称根因已解决。

## 工作区隔离调整

本轮进行中主树出现其他参与者的项目侧栏/远程主机标签修改，5 个受保护 UI 文件也发生非本任务变化。停止在共享主树写实现或据此宣告全量验收。TASK-0148 转独立 Worktree，仅复制本任务明确拥有的候选文件，不搬动或回退主树改动；其他 Task 暂留独立候选补丁等待后续隔离验证。此举不是新增 Agent 派工。

与历史 active Task-0122/0123 的 release notes/宽路径声明有交集，已显式登记 conflicts_with；不修改对方实现，集成时逐项串行审查。隔离基线未包含 TASK-0147 等未提交 UI 修改，因此本工作树结果不等于主工作区整体验收。

## 已定位的本仓测试适配

补齐 Electron 后，theme-ui 的懒边界测试仍在 5 秒默认 testTimeout 上失败；它在测试体里动态加载整个 settings barrel，将 Vite 冷编译耗时误计进结构合同。该合同实际要求“不静态求值 three.js，导出仍是同一个 lazy 壳”，没有 5 秒产品性能 SLA。将相同模块作为测试模块初始化导入，保留会抛错的 three mock 与两个原断言，不调整任何超时、不跳过用例、不改生产导出。模块错误仍使测试收集失败。

## 隔离提交回写

工程在 task/TASK-0148-upstream-validation-baseline 完成，提交 1020b7c59f051cafe5b808ba9982d0c01b9b25c3；未合入主树、未推送。Desktop 876 文件/4624 测试通过，6 文件/29 测试为既有跳过；theme-ui 冷编译测试修正后全包 23 文件/169 测试通过；test:quality 36 文件/483 测试及最终完整 check 通过。首次聚合命令的 theme-ui 失败保留在工作树记录中，不篡改退出码。此为内部测试工具合同，人工产品验收不适用；不替代 TASK-0147 或主树其他 WIP 的验收。
