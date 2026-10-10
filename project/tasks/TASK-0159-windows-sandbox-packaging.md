---
id: TASK-0159
type: task
status: done
priority: P2
owner: desktop build + runtime-node sandbox
source: user-request; upstream f174cf914, cca02889c, 34a350058
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0148]
related_issues: []
related_bugs: [BUG-0022]
execution: parallel
branch: task/TASK-0159-windows-sandbox-packaging
worktree: ../open-forge-wt/task-0159-windows-sandbox-packaging
base_commit: 886173e67999a2f46aaaf27f2b896f0ca11bfdd7
read_paths: [apps/desktop/scripts, packages/runtime-core/sandbox, packages/runtime-node/src/sandbox, .github/workflows/desktop-release.yml]
write_paths: [apps/desktop/scripts, packages/runtime-core/.gitignore, packages/runtime-core/sandbox/windows, packages/runtime-core/sandbox/docs, apps/desktop/package.json, project/tasks/README.md, project/tasks/TASK-0159-windows-sandbox-packaging.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/scripts]
depends_on: [TASK-0148]
conflicts_with: [TASK-0039, TASK-0122, TASK-0123, TASK-0154, TASK-0181, TASK-0196]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# Windows 沙盒制品完整性适配

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：f174cf914, cca02889c, 34a350058。

保留 Open Forge 两档品牌、独立版本、安装/更新身份和安全目录。仅适配沙盒产物固定版本/校验、缺失阻断与 dev 输入哈希覆盖；不触发下载生产私有配置、tag、发布或上传。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## 用户决策（2026-10-03）

用户选定方案 A：**受控构建产物 + SHA-256 清单钉死**——新增受控清单（3 个 exe 名 + sha256 + 来源提交），打包时逐个校验存在与摘要，缺失/不一致按清单阻断，仅显式环境变量可降级为告警；不引入任何外部下载源。方案 B（固定外部发布源下载）因需新增网络来源与授权被否决；仅强化校验而不解决来源（C）与推迟决策（D）均被否。

## 现状核实（2026-10-03，基线 `886173e67`）

1. `prepare-pack.js:645–684` 只在 `packages/runtime-core/sandbox/bin` 存在时整体 `cpSync`，然后由 `sandbox-staging-guard.mjs` 报「目录 missing/empty」；`classifySandboxSource()` 是「目录非空即 present」，**不校验文件名、不校验字节、不要求三个 exe 齐全**——放一个无关文件就能让产物看起来带沙盒。
2. 本仓 `packages/runtime-core/sandbox/` 只有 `docs/`，没有 `bin/`，也没有任何步骤产出 Windows 沙盒 host，于是 Windows 产物必然 `sandbox.status=unavailable`（BUG-0022）。运行时能力检查（`sandbox-permissions.ts` 等）仍在，**不是**「运行时无检查或自动降为完全访问」。
3. 上游 `f174cf914`/`cca02889c` 的形态是「固定 repo/tag/commit + 归档 SHA-256 + 归档内 `manifest.json` 逐文件 SHA-256 + 三个指名 exe + `--capabilities --json` 八项能力探针，任一不符即失败」。其中**外部下载源**与**运行 exe 的能力探针**在本仓不可用（本仓没有可下载该制品的公开来源；打包机非 Windows 时无法执行 exe），因此只适配「固定制品集合 + 摘要校验 + 缺失阻断」，探针不在本次范围。

## 范围

### 做

- 新增受控清单 `packages/runtime-core/sandbox/windows/sandbox-artifacts.json`（3 个受控制品名 + SHA-256 + 来源提交；未钉时为 `null`）；
- 新增 `apps/desktop/scripts/windows-sandbox-artifacts.mjs`：清单结构校验（fail-closed）、逐文件存在/摘要校验、未受控文件检测、`--write` 用真实字节生成清单、`--check` 独立校验入口；
- `prepare-pack.js` 接入：声明 win32 且清单校验不过时**默认中断构建**，只有 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` 才降级为告警；保留 `sandbox-staging-guard.mjs` 作为无清单平台/外部分叉的既有告警路径；
- 打包合同测试（`verify-packaging-contract.mjs`）与 `test:packaging` 注册新用例；沙盒文档补「打包期制品完整性」一节。

### 不做

- 不引入任何外部下载源，也不新增下载动作或网络依赖（本轮未授权）；
- 不运行 exe 做 `--capabilities` 探针（需要 Windows 与真实制品，本轮未授权真实打包）；
- 不改 `packages/runtime-node/src/sandbox` 的运行时能力检查与降级语义；
- 不改 `packages/runtime-core/sandbox/linux` 的 bwrap 路径（仍走既有告警），不碰 `.github/workflows/*`；
- 不实现 RESEARCH-0022 中可拆的 dev 缓存输入小片（`build-dev-processes.mjs` / `vite.main.config.ts`），留待后续独立 Task。

## Given / When / Then

- Given：构建声明要打包 win32，受控制品尚未产出（当前仓库状态）
  When：运行 `prepare-pack.js`（`dist:win` / `pack:win:test`）
  Then：构建在打包阶段以明确错误中断，错误列出缺失/未钉的制品与修复步骤；设置 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` 后只告警并继续
- Given：受控构建产出三个 exe 并用 `--write` 钉好摘要
  When：再次打包
  Then：清单校验通过、构建继续；若其中任一 exe 被替换或缺失，摘要/存在性校验再次中断构建
- Given：只声明 darwin/linux
  When：打包
  Then：不读 Windows 清单、不受其影响（`not-declared`）

## 必须保持

- `sandbox-staging-guard.mjs` 的既有告警语义与用例不变；darwin/linux 打包路径行为不变；
- 运行时沙盒能力的既有检查与「不可用即 sandbox.status=unavailable」的用户可见语义不变；
- 不含二进制入库：只有清单进库，`sandbox/bin` 仍在 `.gitignore` 覆盖内。

## 测试与验证

- 定向测试：`bun run --cwd apps/desktop test:packaging`（含新增 `scripts/windows-sandbox-artifacts.node-test.mjs`，覆盖结构 fail-closed、缺件、摘要不一致、未受控文件、未钉摘要、声明过滤、降级开关、write→assess 闭环，以及「旧判定放行半个制品」的对照）；
- 游离校验入口：`node apps/desktop/scripts/windows-sandbox-artifacts.mjs`（按受控清单校验 win32 制品，失败非零退出）；
- 打包合同：`bun run verify:desktop:contracts`（断言 `prepare-pack.js` 确实消费清单校验）；
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；完成后 `bun run check`；
- 未运行：真实 `dist:win` / CI 打包（会按设计因缺少受控制品中断，需先产出制品或由用户决定降级）、exe `--capabilities` 探针（需 Windows 与真实制品）、`verify:ui:*`、发布与上传。

## 并发与验收分层

- 条件支持：独立 Worktree `task/TASK-0159-windows-sandbox-packaging`，内部串行；前置 TASK-0148 已 `done`；与 TASK-0196 等共享发布说明/焦点表的冲突在 dev 集成时合并解决。
- 工程验证：见「实际验证」；技术评审：自审；集成：`integrated`——已 fast-forward 推送 `origin/dev`（`a156f19e7..1c1a50b9e`；本 Task 提交 `7397ec931` 实现、`75392cde7` 合并 dev、`1c1a50b9e` 证据回填）；人工功能验收：待用户（含「缺受控制品即中断打包」对发版路径的影响判断）；发布：未授权。

## 实际验证

| 命令 | 结果 |
|---|---|
| `node --test scripts/windows-sandbox-artifacts.node-test.mjs` | 绿：14/14，含「旧判定把半个制品当 present、新清单校验报缺件」的对照用例 |
| `bun run --cwd apps/desktop test:packaging`（合并 `origin/dev` 后复跑） | 绿：122 例通过（含新增 14 例；`sandbox-staging-guard.node-test.mjs` 原用例全部保留通过） |
| `bun run verify:desktop:contracts` | 绿：`[desktop-packaging-contract] ok`（新增两条接线断言生效） |
| `bun scripts/quality/run-vitest.mjs --run apps/desktop/scripts/verify-packaging-contract.test.mjs` | 绿：1 文件通过 |
| `node scripts/quality/check-modified-file-notices.mjs --baseline …` | 绿：`new=0` |
| `bun run check`（合并后最终一轮） | `check:lint` 0、`check:types`（root·cli·desktop·docs·mobile）0、mobile lint 0、`[project-indexes]` 通过、notices `new=0`；**`check:guards` 红**，仅 5 条既有悬挂引用（见下），不涉及本 Task 文件 |

既有红灯（基线，非本 Task 引入）：`[task-worktrees]` 报 5 条 `conflicts_with references unknown task`——`TASK-0160 → TASK-0187`、`TASK-0194 → TASK-0187/0197`、`TASK-0196 → TASK-0186/0187`。`origin/dev` 同样不含 `TASK-0186/0187/0197` 记录文件（`git ls-tree origin/dev project/tasks` 0 命中），即合并前 dev 已有同一红灯。按「保护其他泳道记录」边界，本次未删除这些引用，留待各 Owner/Coordinator 在其记录落地时修正。

`bun run test:impact -- apps/desktop/scripts/…` 对脚本类 `.mjs` 找不到 vitest 关联文件，回退包测试脚本后以「No test files found」退出 1；这些脚本的注册入口是 `test:packaging`（node runner，已绿），合同测试由 `test:quality` 覆盖，故不以该回退结果作为结论。

## 交付记录

- 批次备注（承接 `origin/dev` 的 TASK-0196 批次记录）：该批次 2026-10-03 曾把本任务标记为「暂缓跳过（保持缺失只告警）」，等待可信制品源决策；用户当日选定方案 A 后，本 Task 按该决策实施，批次备注中的「暂缓」不再有效。
- 实际修改：
  - `apps/desktop/scripts/windows-sandbox-artifacts.mjs`（新增）：清单结构 fail-closed、存在/摘要/未受控文件校验、`--write`/`--check` CLI。
  - `apps/desktop/scripts/windows-sandbox-artifacts.node-test.mjs`（新增）：14 例 node 测试。
  - `packages/runtime-core/sandbox/windows/sandbox-artifacts.json`（新增，入库）：3 个受控制品名 + SHA-256（当前 `null` = 未钉）+ 来源提交。
  - `apps/desktop/scripts/prepare-pack.js`：接入 `assessWindowsSandboxArtifacts`（默认阻断、显式变量降级），保留 `sandbox-staging-guard` 既有告警路径。
  - `apps/desktop/scripts/verify-packaging-contract.mjs`：新增两条接线断言；`apps/desktop/package.json`：`test:packaging` 注册新测试。
  - `packages/runtime-core/.gitignore`：放行清单、继续忽略二进制；`packages/runtime-core/sandbox/docs/README.md`：补「打包期制品完整性」。
  - 记录与发布说明：本 Task、焦点表、`.github/release-notes/v0.1.3.md`。
- 实际运行：见「实际验证」。
- 未运行及原因：真实 `dist:win` / CI 打包（会按设计因缺少受控制品中断；需先产出制品或由用户决定降级设置）、exe `--capabilities` 探针（需 Windows 与真实制品）、`verify:ui:*`、发布与上传。
- Worktree：`../open-forge-wt/task-0159-windows-sandbox-packaging`（`task:worktree create --no-write --no-setup` 创建，`bun install` + `prepare:workspace:dev` 初始化；主检出未留改动）。
- 剩余风险：
  - **发版影响（需用户确认）**：本仓当前没有 Windows 沙盒 exe、清单摘要为 `null`，因此 Windows 打包（`dist:win`、`pack:win:test` 与 release 流水线）会**按设计失败**，直到 (a) 受控构建产出三个 exe 并 `--write` 钉摘要，或 (b) 在对应流水线显式设置 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1`。本次未擅自修改 workflow。
  - 未实现上游的归档级摘要与 `--capabilities` 八项探针（本仓无归档制品、打包机非 Windows）。
  - 来源目录混入未受控文件即中断打包（刻意，避免打包未审计字节）。
  - 焦点表按 dev 一致版本重建：合并 `origin/dev` 时发现 `main` 侧焦点表引用 `TASK-0186/0187/0188…0199` 等未入库记录（dev 无该引用），故取 dev 版本 + 本 Task 行，避免把既有悬挂引用带进 dev。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待用户裁定）

方法：在**主检出**（当前 HEAD）独立复跑声明的三条命令，并绕开单测包装、直接调用 `assessWindowsSandboxArtifacts` 读出三个 GWT 分支的返回结构（`status` / `enforcement` / `message`），再以游离 CLI 实测默认与降级两种入口。

| 命令 / 读数 | 结果 |
|---|---|
| `node apps/desktop/scripts/windows-sandbox-artifacts.mjs` | **exit=1**，打印四类问题（清单 `sourceCommit` 为 null、三个受控 exe 全缺，各带绝对路径）与可行动修复步骤（`--write --source-dir … --commit …` 重钉摘要），并指明只有显式接受「本次产物不带 Windows 沙盒」才设 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1`。 |
| 同一 CLI + `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` | **仍 exit=1**（与设计一致：降级只作用于**构建路径** `prepare-pack.js`，游离校验入口恒按清单判定失败）。 |
| `bun run --cwd apps/desktop test:packaging` | **绿 125/125**（含「目录非空即视为有沙盒」的旧判定对照、未钉摘要不放行、字节被替换拦下、未受控文件混入报出、write→assess 闭环）。 |
| `bun run verify:desktop:contracts` | **绿** `[desktop-packaging-contract] ok`（`prepare-pack.js` 确实消费清单校验）。 |
| 直接调 `assessWindowsSandboxArtifacts`（主检出，清单未钉、`bin/` 不存在） | `declaredFamilies=['win32']` → `status=blocked`、`enforcement=block`、`message` 非空 ⇒ 对应 `prepare-pack.js:699-704` 的 `throw new Error(message)`，即**构建中断**；`['darwin']` 与 `['linux']` → `status=not-declared`、`message=null` ⇒ 不读清单、不阻断；win32 且设 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` → `enforcement=warn` ⇒ 走 `console.warn` 继续构建。 |

- 三条 GWT 在可及范围内全部成立：**未钉/缺件 → 默认中断且错误可行动**；**显式变量 → 降级告警**；**非 Windows 声明 → `not-declared` 不受影响**。
- 未覆盖（不宣称通过）：真实 `dist:win` / CI 打包的中断现场（评估点位于 `prepare-pack.js` 较后段，全量跑一次打包代价与风险都不合适，改以「返回结构 + 抛错分支源码 + 合同断言」三证）；「三个 exe 齐全且摘要一致」的**通过**路径（清单摘要当前为 `null`，无受控制品）；exe `--capabilities` 八项探针（需 Windows 与真实制品）。
- 待用户裁定项（即交付记录「发版影响」）：Windows 打包在当前仓库状态**按设计失败**。选项：① 由受控构建产出三个 exe 后 `--write` 钉摘要；② 在 Windows 发版流水线显式设 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1` 并接受产物不带沙盒；③ 暂缓 Windows 发版。Agent 未擅自改 workflow。

### 用户裁定闭合（2026-10-10，VERIFY-0017 分档口径；用户授权托管批量裁定）

按「按未覆盖成因分档」口径裁定（用户已授权托管批量闭合）。

- **清单行验收对象成立**：「缺受控沙盒制品时打包默认阻断」有三证——判定函数返回结构 `status=blocked/enforcement=block`、`prepare-pack.js` 抛错分支源码、游离 CLI exit=1；`test:packaging` 125/125 与 `verify:desktop:contracts` 绿（2026-10-08 组二续测四）。
- **通过路径无验收对象**：三个受控 exe 尚未产出（`sourceCommit=null`），「齐全且摘要一致」的通过分支在当前环境无对象，属发版时刻才会出现的形态。
- **发版政策项显式移交用户**（不随本闭合消失）：受控构建产出 exe 后 `--write` 钉摘要／流水线显式降级并接受无沙盒产物／暂缓 Windows 发版——三选一在发版流程中裁定。
