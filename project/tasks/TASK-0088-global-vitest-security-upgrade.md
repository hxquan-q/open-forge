---
id: TASK-0088
type: task
status: done
priority: P1
owner: workspace
source: BUG-0012
execution: parallel
branch: forge/dev
worktree: unassigned
base_commit: 3b5ec8bad
read_paths: [package.json, apps/remote-relay, packages/*/package.json, scripts/quality]
write_paths:
  - package.json
  - bun.lock
  - apps/remote-relay/package.json
  - apps/remote-relay/vitest.config.ts
  - apps/desktop/src/main/agent-teams/team-session-concurrency.test.ts
  - packages/*/package.json
  - packages/*/vitest.config.ts
  - packages/plugins/presets/vetta-ui-design/test/engine-recovery-ui.test.tsx
  - scripts/quality
  - docs/dev/quality-gates.md
exclusive_paths: [package.json, bun.lock]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0087, TASK-0089, TASK-0090]
related_issues: []
related_bugs: [BUG-0012]
---
<!-- Copyright The Open Forge contributors. -->

# 全局工作区 Vitest 测试框架统一安全升级（消除 15 项安全告警）

## 目标

升级根目录 `package.json` 及相关子包中的 `vitest` 测试依赖至安全版本（`>= 4.1.11`），消除 Dependabot 检出的 15 处 GHSA-952p-64cx-cqcp (CVE-2026-39884) 安全告警。

## 背景事实

- 根目录 `package.json` 当前指定 `"vitest": "^3.2.4"`。
- Dependabot 扫描显示，根目录与 `packages/runtime-*`、`packages/plugins/*`、`packages/themes/*` 等共计 15 个模块的 `package.json` 均因此触发了中危漏洞告警。
- 项目的测试运行器脚本 `scripts/quality/run-vitest.mjs` 在 Windows 环境下通过 Node 启动 Vitest。在升级后必须确保该运行脚本与 Vitest 4.x 配置选项保持兼容。

## 范围

### 并发评估

- **并发结论**：**条件支持并发**
- **执行方式**：serial / 集中更新（由于涉及根 `package.json`，建议在与其它改动合并时或在独立分支完成升级）
- **可并行 Task**：`TASK-0087`（修改路径完全正交）
- **前置依赖**：无
- **冲突文件/独占路径**：`package.json`
- **Branch**：`forge/dev`
- **Worktree**：主工作区或独立 Worktree
- **集成负责人**：本 Task 执行者

## 行为规范

- Given：项目测试体系依赖 Vitest 执行单元测试与影响测试。
- When：更新根 `package.json` 及各子包中的 `vitest` 版本为 `^4.1.11`，并更新 lockfile。
- Then：
  1. `bun run test:impact` 能够正常执行且行为与此前一致；
  2. `scripts/quality/run-vitest.mjs` 测试引导逻辑运行无错误；
  3. GitHub Dependabot 中 15 项关于 Vitest 的告警被关闭。

## 验收标准与验证命令

1. **依赖升级验证**：
   - 检查 `package.json` 及所有涉及包的 `vitest` 版本均不低于 `4.1.11`。
2. **测试运行验证**：
   - 运行受影响模块的定向测试：`bun run test:impact`。
   - 验证 Node 启动 Vitest 机制正常运行。
3. **代码与架构门禁**：
   - 运行 `bun run check:quick -- package.json`。

## 实际修改与验证记录

### 实际修改

- 根 `package.json`：`vitest` 升至 `^4.1.11`，`@vitest/coverage-v8` 升至 `4.1.11`。
- 16 个直接声明 Vitest 的 workspace 清单统一升级至 `^4.1.11`。
- `apps/remote-relay`：Cloudflare Workers 测试池升至 `0.22.0`；配置从旧 `defineWorkersConfig()` 迁移为 `cloudflareTest()` 插件，保持单 Worker 与非隔离存储语义。
- `check-vitest-runner.mjs`：新增 Vitest 安全版本下界守卫，后续任何直接声明低于 `4.1.11` 都会使质量门禁失败。
- `run-vitest.mjs`：在支持的 Node 版本上通过 `NODE_OPTIONS` 关闭实验性 Web Storage，使 happy-dom / jsdom 能正常注入 `localStorage`。
- `runtime-core`、`runtime-node`、`runtime-desktop`、`runtime-telemetry`、`coding-agent`：显式排除 `dist/**`，避免 Vitest 4 默认排除项变化后重复收集构建产物测试。
- Desktop Team 并发测试改为保存 mock 的原始实现再包装，适配 Vitest 4 对既有 `vi.fn` 的 `vi.spyOn()` 行为。
- `vetta-ui-design` 恢复测试改为显式使用 `window.localStorage`。
- `docs/dev/quality-gates.md`：同步 Vitest 4、安全下界与 Web Storage 启动约定。
- `.github/release-notes/v0.1.0.md`：记录测试基础设施安全升级。

### 验证证据

- `bun run check:quick -- <本次修改文件>`：通过，Biome 与全部 guards 无错误。
- `bun scripts/quality/run-vitest.mjs --run scripts/quality/quality-gates.test.mjs`：92 项通过。
- `bun run test:pkg remote-relay`：2 个测试文件、11 项通过。
- `bun run test:pkg runtime-core`：87 个测试文件、531 项通过。
- `bun run test:pkg runtime-node`：76 个测试文件、474 项通过。
- `bun run test:pkg runtime-telemetry runtime-desktop coding-agent`：全部通过（5 / 48 / 1446 项，另有 3 项跳过）。
- `bun run test:pkg presets/vetta-ui-design`：106 个测试文件、688 项通过。
- Desktop 定向回归：`team-session-concurrency.test.ts` 56 项通过；`useTheme.test.tsx` 与 `InputBarToolbar.test.tsx` 共 5 项通过。
- 实际安装解析：`vitest@4.1.11`、`@vitest/coverage-v8@4.1.11`、`@cloudflare/vitest-pool-workers@0.22.0`。

### 未运行及原因

- `bun run test:changed` 未取得全绿：该命令首先运行的质量脚本包含仅面向 Ubuntu 的 Bash fixture，在本机 Cygwin Bash 下因 Windows `RUNNER_TEMP` 反斜杠路径失败；全量运行期间并行 Agent 同时执行 `bun install --force` 与 Desktop 测试，导致 Vitest 依赖目录竞争。随后已按包完成稳定状态下的定向复跑。
- `bun run check` 未取得全绿：当前工作区同时存在 Electron、adm-zip/svgo、Runtime Task 身份等其他任务未提交改动，失败点是 `safe-zip-extract.test.ts` 格式、`context-runtime.test.ts` / `session-assistance-runtime.test.ts` 类型，以及 `RuntimeTaskIdentity.generation`；本任务修改涉及的检查均已通过。

### 剩余风险

- Vitest 4 对 mock 包装与默认 `exclude` 有行为变化；本次已修复现有命中的测试，但后续新增测试若直接扩展既有 `vi.fn` 或依赖默认忽略 `dist`，应在对应包回归中显式保持合同。
- GitHub Dependabot 告警关闭状态依赖远端安全扫描重跑；本地仅能验证声明版本、锁文件解析与实际测试运行。
