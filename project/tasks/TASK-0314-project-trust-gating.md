---
id: TASK-0314
type: task
status: done
priority: P1
owner: packages/coding-agent
requirement:
plan:
source: RESEARCH-0032 / GHSA-mqxh-6gq7-558m（上游修复 89a92207 及 718215bd、ff3e9df5、38f18be4）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0314-project-trust-gating
worktree: unassigned（已集成，待推送后清理）
base_commit: ede70346e3446de681463ef7a6768b773c8ac245
read_paths:
  - packages/coding-agent/src/resources/packages/package-source-runtime.ts
  - packages/coding-agent/src/resources/packages/resource-package-projector.ts
  - packages/coding-agent/src/resources/runtime/session-resource-runtime.ts
  - packages/coding-agent/src/resources/runtime/skill-resource-state.ts
  - packages/coding-agent/src/host/sdk-session/resource-runtime.ts
  - packages/runtime-node/src/host/project-trust-store.ts
  - apps/desktop/src/main/task-activity/tool-approval-broker.ts
  - apps/desktop/src/main/agent-runtime/resource-runtime.ts
  - apps/cli-host/src/coding-agent-resource-runtime.ts
write_paths:
  - packages/coding-agent/src/resources/contracts/project-resource-trust.ts
  - packages/coding-agent/src/resources/contracts/resource-source.ts
  - packages/coding-agent/src/resources/contracts/resource-runtime.ts
  - packages/coding-agent/src/resources/index.ts
  - packages/coding-agent/src/resources/packages/package-source-runtime.ts
  - packages/coding-agent/src/resources/packages/resource-projection.ts
  - packages/coding-agent/src/resources/runtime/session-resource-runtime.ts
  - packages/coding-agent/src/resources/runtime/skill-resource-state.ts
  - packages/coding-agent/src/host/sdk-session/resource-runtime.ts
  - packages/coding-agent/src/public-api/host-services.ts
  - packages/coding-agent/test/project-resource-trust.test.ts
  - apps/desktop/src/main/agent-runtime/project-resource-trust.ts
  - apps/desktop/src/main/agent-runtime/project-resource-trust.test.ts
  - apps/desktop/src/main/agent-runtime/resource-runtime.ts
  - apps/desktop/src/shared/i18n/locales/
  - apps/cli-host/src/coding-agent-resource-runtime.ts
exclusive_paths:
  - packages/coding-agent/src/resources/contracts/project-resource-trust.ts
  - apps/desktop/src/main/agent-runtime/project-resource-trust.ts
depends_on: []
conflicts_with: [TASK-0154, TASK-0218]
integration_status: integrated
created: 2026-10-18
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 工作区信任门禁：项目本地扩展/skills 确认后加载（GHSA-mqxh）

## 目标

打开含 `<cwd>/.vetta`（改名后 `.openforge`）项目级 extensions/packages/skills 的仓库时，必须先经用户信任确认才加载执行；非交互（headless/SSH）模式默认拒绝。对齐上游 pi 0.79.0 project trust 门禁。

## 范围

### 并发评估

- 结论：支持（本会话独立 Worktree 单 Worker 执行，占用独立并行 scope）
- 执行方式：parallel
- 可并行 Task：除 TASK-0154（见 conflicts_with）外无在途冲突
- 前置依赖：已解除（4 项 UX 决策已收敛，见下）
- 冲突文件/独占路径：`packages/coding-agent/src/resources/runtime/` 内三个具体文件与 `apps/desktop/src/main/agent-runtime/resource-runtime.ts` 落在 TASK-0154 登记的写范围内（其 Worktree 仍在登记表），已声明 `conflicts_with: [TASK-0154]`；`test/`、`resources/` 等已收窄到具体文件/子目录，避免与 TASK-0218 等目录级登记误撞（收窄先例 f0a0cbb71）
- Branch：task/TASK-0314-project-trust-gating
- Worktree：../open-forge-wt/task-0314-project-trust-gating
- 集成负责人：本会话（Coordinator 集成后推送 origin/dev）
- 集成顺序：单 Task，独立合并

### 已决策（2026-10-18 用户答复「按照推荐」）

1. 信任载体：扩展 `NodeProjectTrustStore`（`.vetta-local/trust.json`），新增 capability `resources:project-load`（对齐既有 `tool:<name>` 命名空间字符串先例）；单一事实源，无迁移。
2. 门禁范围：仅项目级资源加载（`<cwd>/.vetta` 的 packages/extensions/skills/prompts/themes）；`AGENTS.md` 类指令文件按既有 AI 数据边界处置，不进本门禁。
3. 桌面端 UI：打开工作区后首个会话解析项目资源时弹一次对话框（信任并记住 / 仅本次 / 拒绝），按路径记忆（`projectRoot` 粒度）；已信任或已拒绝不再打扰。
4. 非交互默认：headless/CLI/agent-rpc 默认拒绝并记录结构化原因；`OPENFORGE_TRUST_PROJECT=1` 显式信任（同时读取同一 trust.json，桌面已信任的项目免开关注入）。

### 做（草案）

- 资源加载链在 project scope 前查询信任状态；未信任 → 拒绝加载并上报原因。
- desktop 工作区打开流接信任对话框；选择持久化。
- 回归测试：恶意仓库 fixture（带 `.vetta/skills`）在未信任时不执行任何项目级代码；信任后正常加载。

### 不做（草案）

- 不改 user scope 资源加载。
- 不引入目录内容指纹级 diff 提示（v1 按路径记忆）。

### 技术设计（2026-10-18 侦察收敛，待 4 项 UX 决策定稿）

- 域层端口：`coding-agent` 资源合同新增 `ProjectResourceTrustPort`（按 `cwd` 返回 trusted/denied + 结构化原因）；接入点两处——`package-source-runtime.ts` 的 `resolve()`/`resolveAdditionalSources({local})` project 分支与 `skills/discovery.ts` 的 `<cwd>/.vetta/skills` 目录；未信任时跳过加载并产出可观测诊断（不静默），`skill-resource-state.ts` 指纹相应不含被拒资源。
- 信任记录：复用 `PermissionGrant`（runtime-core `task/contracts`：scope=project + projectRoot + capabilities），新增 capability `resources.project.load`；存储沿用 `NodeProjectTrustStore`（`.vetta-local/trust.json`，fail-closed/撤销即时，已有 `project-trust-store.test.ts`）。桌面先例：`tool-approval-broker.ts` 的 `trustStoreFor()`（会话 → sessionPath → header cwd → projectRoot → 缓存 store）。
- 桌面端实现：组合根注入交互 adapter（检测 `<cwd>/.vetta` 项目资源存在 → 未信任时按决策 3 弹窗 → 授权写 store）；非交互（CLI/headless/agent-rpc/SSH）adapter 默认拒绝 + 按决策 4 的显式开关。
- 兼容不变量：user/temporary scope 与已信任项目的加载行为不变；store 未知版本/损坏整体忽略（fail closed）；共享 `.vetta/` 内不写任何信任数据。
- 测试分层：域层合同（未信任不加载 + 诊断、信任后加载、user scope 不受影响、恶意仓库 fixture）；runtime-node store capability 扩展；desktop 对话框接线与 i18n（文案走 catalog，遵循 desktop AGENTS §7）。影响面：`package-source-runtime.ts`、`skills/discovery.ts`、`skill-resource-state.ts`、desktop 工作区打开流/agent-runtime 组合根。

## Given / When / Then

- Given：用户打开一个包含项目级扩展/skills 的未信任仓库；
- When：会话启动、资源解析尝试加载 project scope 包；
- Then：弹出信任确认；拒绝时不加载/不执行任何项目级代码并给出可见原因；接受后记住选择，下次直接加载；headless 默认拒绝并记录。

## 必须保持

- user scope 与内建资源不受影响；信任状态不改变 L3/L4 工具审批语义（分层独立）。

## 测试与验证

- 定向测试：待设计
- 用户流程：打开恶意 fixture 仓库 → 拒绝 → 无代码执行；接受 → 正常加载
- 质量检查：待设计

## 验收分层

- 工程验证：待执行
- 技术评审：未执行
- 集成：与 frontmatter integration_status 一致
- 人工功能验收：待验收
- 发布：未授权

## 功能验收包

- 入口与前置条件：desktop 打开含 `.vetta` 项目级资源的工作区
- 操作步骤或 AI 任务输入：打开 → 面对信任对话框 → 拒绝/接受各一次
- 预期行为与最终产物：拒绝零执行；接受后加载且记忆
- 不通过表现与已知限制：—
- 验收反馈及回归案例：

## 交付记录

- 实际修改：域层新增 `resources/contracts/project-resource-trust.ts`（端口 + `resources:project-load` capability）并在 `SessionResourceRuntimeOptions` 暴露可选注入；`SessionResourceRuntime` 在 reload（resolve 传 `projectScope`）/updateSkills（不并入 `.vetta/skills`）/技能指纹三处按判定拦截，拒绝时落 warning 诊断，端口异常 fail closed；`ResourcePackageRuntime.resolve` 与 `ResourceProjector`（含自动发现与祖先 `.agents/skills`）支持 `projectScope:false`；sdk-session 新增 `createNonInteractiveProjectResourceTrustPort`（env 显式信任 + 读 trust.json，异常 fail closed）并作为默认注入，cli-host 同款接线；desktop 新增 `project-resource-trust.ts`（本机项目首次解析弹原生对话框：信任并记住→写 `NodeProjectTrustStore` grant / 仅本次 / 拒绝；`ssh://` 远端与非决仓库按非交互拒绝/放行），zh/en i18n `projectTrust.*`。集成修正：导出 `ProjectTrustStoreLike`、bootstrap 测试 fake 补接口方法。
- 实际运行：新增 15 例（coding-agent 7：未信任不加载+诊断可见/信任加载/无端口兼容/端口异常 fail closed/非交互矩阵 3；desktop 8：已记住免弹/记住写授权/仅本次/拒绝/无资源放行/ssh 拒绝/env 优先/store 异常 fail closed）全绿；受影响既有套件（resource-loader/package-manager/locations-port/git-update 106 例、coding-agent-bootstrap 1 例）零回归；`check:quick`（worktree）与合并后完整 `bun run check`（lint/types/guards/mobile-lint）全绿；`test:impact` 见下方补充。
- 未运行及原因：desktop 实机对话框目验与真实恶意仓库克隆演练留人工验收（对话框文案/焦点/记忆行为）；agent-rpc 子进程路径由 sdk 默认策略覆盖（代码级同源）。
- Worktree：task-0314-project-trust-gating（branch task/TASK-0314-project-trust-gating，Worker 提交 `a3566d09c`）。
- 集成：`89827bfb1`（--no-ff 合并，18 文件）。
- 剩余风险：拒绝不持久记忆（按决策③，下个会话再次询问）；`resolveAdditionalSources({local:true})` 调用链当前仅 temporary 场景使用、未加门禁（无现实调用面，登记后续观察）。
- 人工验收（2026-10-21）：用户在会话中确认本批次验收完成，据用户结论闭合；批次记录见 TASK-0342。
