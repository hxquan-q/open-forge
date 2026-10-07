---
id: TASK-0154
type: task
status: verifying
priority: P2
owner: coding-agent + runtime-mcp + desktop
source: user-request; upstream d04645196, 027fba36a, 887017560, fb5fb060d, 3f8ec3161
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148, TASK-0155]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0154-resource-mcp-team-startup
worktree: ../open-forge-wt/task-0154-resource-mcp-team-startup
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [packages/coding-agent/src/composition/turn, packages/coding-agent/src/resources/runtime, packages/coding-agent/src/model-context, packages/runtime-mcp, apps/desktop/src/main/agent-runtime, apps/desktop/src/main/agent-teams]
write_paths: [packages/coding-agent/src/composition/turn, packages/coding-agent/src/resources/runtime, packages/coding-agent/src/model-context, packages/runtime-mcp, apps/desktop/src/main/agent-runtime, apps/desktop/src/main/agent-teams, project/tasks/TASK-0154-resource-mcp-team-startup.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/coding-agent/src/composition/turn]
depends_on: [TASK-0148]
conflicts_with: [TASK-0122, TASK-0123, TASK-0181, TASK-0194, TASK-0196]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 资源准备、MCP 作用域与团队首轮优化

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：d04645196（本轮切片）、027fba36a、887017560、fb5fb060d、3f8ec3161。

本轮批次只实施 d04645196 的 **MCP application/workspace 资源作用域**：全局 MCP 条目默认成为应用级连接并在工作区间复用，引用 `${PROJECT_ROOT}` 或项目配置仍保持工作区级隔离；保留 TASK-0053/0054 的空闲回收、延迟启动与工具目录缓存，保留 roots 权限隔离。其余来源 SHA（资源准备合并与团队首轮优化）不在本轮切片，继续保持待评估，实施前另行扩充合同。

先建立准备耗时/扫描数基线，再复用已校验资源与应用级 MCP；保留 TASK-0053/0054 的延迟启动、目录缓存和空闲回收，以及 PLAN-0013 的团队让出/唤醒语义。成员模型 UI 接已有团队合同，不能重建旧团队编排。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

技能下一轮热更新、工作区隔离、MCP 回收后重启、取消/释放；队长先响应而成员完整就绪；既有 team 安全与进度合同。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 由泳道 B 在独立 Task Worktree 串行实施；前置 TASK-0148 已集成。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014。
- `conflicts_with` 登记已入库的写路径重叠任务（TASK-0122/0123/0181，以及经 dev 合入后的 TASK-0194/0196）。尚未入库的 TASK-0187/0197 按 prose 记录共享 `.github/release-notes/v0.1.3.md`、`project/tasks/` 与 apps/desktop/packages 写路径，待其经 dev 合入后再补登。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 由 Coordinator 集成时归并。
- 工程验证：见下「交付记录」；技术评审：已完成 diff 与合同自审；集成：待推送后回填；人工功能验收：待用户；发布：未授权。

## 交付记录

### 实际修改

- `packages/runtime-mcp`：`McpServerCommonConfig` 新增 `resourceScope?: "application" | "workspace"`（`src/protocol/types.ts`）；TypeBox schema 与字段级校验同步（`src/config/schemas.ts`）；supervisor 增加 `MCP server startup timing …` 分段耗时日志（`src/server/supervisor.ts`）。
- `packages/runtime-node`：`FileMcpConfigSource` 新增 `includeServer({ origin, name, config })`，在合并前按来源过滤（`src/mcp/config/file-config-source.ts`）。
- `apps/desktop`：
  - 新增 `src/main/agent-runtime/mcp-resource-scope.ts`（`resolveDesktopMcpServerResourceScope` 作用域推断）。
  - 新增 `src/main/agent-runtime/mcp-resource-manager.ts`（`DesktopMcpResourceManager`：应用级连接持有、按工具名合并视图、释放重试、认证 generation）。
  - `mcp-supervisor.ts` 新增 `resourceScope`：应用级只装载应用级条目与内置 server、不通告 roots；工作区级只装载工作区级条目、不含内置 server。
  - `composition.ts` 接入 manager：`createMcpRuntimeSource → mcpResources.acquire`、`prewarmApplication`，dispose 先释放池再释放应用源。
  - `mcp-config-validation.ts`、`preload/api-types/mcp.ts`、`renderer/domains/settings/components/useMcpSettingsModel.ts` 支持并透传 `resourceScope`（表单往返，不新增可见控件，因此无 i18n 文案变更）。
- 文档：新增 `docs/adr/0135-desktop-mcp-resource-ownership.md`；`.github/release-notes/v0.1.3.md` 追加一条。

### 保留而不改

- TASK-0053/0054 的空闲回收、延迟启动与工具目录缓存；`resolveMcpRoots` 的本地/SSH roots 语义；插件 MCP 的会话级能力选择。
- 来源 `027fba36a` / `887017560` / `fb5fb060d` / `3f8ec3161`（资源准备合并、团队首轮优化、成员模型配置、反向确认）本轮未实施，保持待评估。

### 运行与结果

- `bun scripts/quality/run-vitest.mjs --run <5 个定向测试文件>`：5 文件 25 用例通过。
- `bun run test:impact -- <11 个变更文件>`：desktop 75 通过 / 1 跳过（481 通过 / 2 跳过）、runtime-mcp 9 文件 76 用例、runtime-node 6 文件 24 用例，全绿。
- `bun run check`：通过（lint / types / guards / mobile-lint）。
- `cd apps/desktop && bun run prepare:workspace:dev`：成功（turbo 26/26）。

### 未运行项与原因

- `verify:ui:*`：本模型无视觉能力且未授权；本改动只在设置表单内往返字段，无新增可见控件。
- 真实 Provider、真实 Desktop 会话、真实 SSH：未授权，未运行。
- `test:changed`：变更集中在已由 `test:impact` 覆盖的三个包，未再单独运行。

### 剩余风险

- 上游报告的启动耗时与团队首轮时延改善属于其自身测量，本仓未复算，不主张具体收益。
- 全局 server 依赖 roots 但未引用 `${PROJECT_ROOT}` 且未声明 `resourceScope` 时会进入应用层；需显式 `resourceScope: "workspace"`，已在 ADR-0135 记录。
- 应用级连接复用依赖 `resolveApplicationRevision` 的登录态，真实登录/退出切换未在真机验证。
- 人工功能验收与视觉验收归属用户；Task 保持 `verifying`。

### 集成

- 已 fast-forward 推送 `origin/dev`：`2b82d59a1`（分支提交 `8fa5dca3c` 实现、`361ab56d1` 记录补登、两次 `merge(origin/dev)` 纳入远端候选；推送前 `bun run check` 全绿）。
- 集成只合并了共享文件 `.github/release-notes/v0.1.3.md` 的双方追加内容，未夹带其他 Task 的文件。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：本 Task 的验证合同有 6 条子句，但本 Task **自己的「目标、范围」段**就写明「本轮批次只实施 d04645196 的 MCP application/workspace 资源作用域」，其余 4 个来源 SHA「不在本轮切片，继续保持待评估」。故本轮先逐条判定每条子句「是否落在已交付切片内」，再对落在切片内的条款复跑测试并核对源码。

| 子句 | 是否在已交付切片内 | 本次结论与读数 |
|---|---|---|
| 工作区隔离 | **在** | 成立。`mcp-resource-scope.test.ts`「keeps project config workspace-scoped even when it asks for application scope」「keeps `PROJECT_ROOT` consumers workspace-scoped」「honors an explicit global workspace scope」「shares global config that has no project dependency」；`mcp-supervisor.test.ts`「does not advertise a workspace root on an application-scoped connection」⇒ roots 权限隔离未被应用级连接绕过。 |
| MCP 回收后重启 / 取消释放 | **在** | 成立。`mcp-resource-manager.test.ts`「reuses one prewarmed application source across workspace acquisitions」「**retries application disposal failures without recreating the connection**」「creates a new application generation after authentication ownership changes」；工具视图合并「lets the workspace binding override an application tool with the same name」。本轮实跑 desktop 三个 MCP 文件 **12 例全绿**，`packages/runtime-node` 整包 **82 文件 / 518 例全绿**（含 `test/mcp/file-config-source.test.ts` 的来源级 `includeServer` 过滤）。 |
| 技能下一轮热更新 | **不在** | **未实施**。属被推迟的来源 SHA（资源准备合并），交付记录的「保留而不改 / 未实施」清单里点名；`project/` 内这 4 个 SHA 中 `027fba36a` / `fb5fb060d` / `3f8ec3161` **无任何其它 Task 承接**。 |
| 队长先响应而成员完整就绪 | **不在** | **未实施**。对应上游 `887017560`（perf(agent-teams): 优先准备队长与首轮响应）。该 SHA 在本仓另有承接方：`TASK-0125`「团队编排 rebaseline」，其 frontmatter **status: blocked**，理由即「上游 commit `887017560` 不在本地 `main` 祖先链中，上游 rebase 前提未满足」。即这条子句的验收对象在本仓尚不存在。 |
| 既有 team 安全与进度合同 | **不适用（未触碰）** | 本切片实际改动集中在 MCP 资源作用域与设置表单透传，交付记录列出的文件里没有 `agent-teams` 相关改动 ⇒ 既有 team 安全/进度合同**未被修改**，属「不退化由不改动保证」而非「改动后验证通过」。 |

- 源码核对（独立复跑）：`packages/runtime-node/src/mcp/config/file-config-source.ts:15-19` 新增可选 `includeServer({origin,name,config})`，`:82-91` 在**合并之前**按来源过滤（`:87` 每个 server 逐条判定），与「工作区级只装载工作区级条目」一致；`mcp-supervisor.ts:101-104` 用 `resolveDesktopMcpServerResourceScope(origin, config) === options.resourceScope` 做装载筛选，`:116` `includeBuiltinServers: !options.dynamicOnly && options.resourceScope !== "workspace"` ⇒ 工作区级连接不含内置 server。
- 未复跑（不宣称通过）：交付记录的影响面数字（desktop 75/481、runtime-mcp 76、runtime-node 24）不追平；`test:changed`、完整 `bun run check` 未重跑。真实登录/退出切换（应用级连接复用依赖 `resolveApplicationRevision` 的登录态）仍未在真机验证——交付记录已自列为剩余风险。
- 关闭建议：**不闭合**。合同 6 条里只有 3 条有验收对象（且这 3 条测试级成立），另外 2 条的被推迟实现**在本仓不存在**（其中一条的承接方 TASK-0125 处于 blocked），第 6 条是「未触碰」。请用户裁定：① 把验证合同收窄为本轮切片实际交付的三条（工作区隔离 / 回收重启释放 / roots 隔离），其余两条另挂在 TASK-0125 与「待评估」来源上，然后闭合；② 或维持宽合同、接受本 Task 长期 verifying 直到那 4 个 SHA 另行立项。
