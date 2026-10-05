---
id: BUG-0077
type: bug
status: done
priority: P2
owner: packages/plugins/presets/git
requirement:
plan:
source: TASK-0187 集成复验归因
related_requirement: []
related_plan: []
related_tasks: [TASK-0187, TASK-0201]
related_issues: []
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# git preset 的 noGit 回归缺少 @testing-library/react 依赖声明

## 用户流程

- Given：本仓任一执行 `bun install` 后的标准检出（如主工作区）。
- When：影响面选择器把 `packages/plugins/presets/git` 纳入测试（例如改动其 src 后运行 `bun run test:impact` / `test:changed`）。
- Then：`test/noGit.test.tsx` 在 vite import-analysis 阶段报 `Failed to resolve import "@testing-library/react"`，整个文件 0 用例收集，该 scope 退出码 1。

## 期望行为

测试文件的可解析依赖应在其所属包 `package.json` 中声明；标准检出安装后 preset 测试应可收集运行。

## 根因证据

- 该测试由 `a156f19e7`（feat(desktop): 未安装 Git 的检测与安装引导）引入，但 git preset 的 `package.json` 未声明 `@testing-library/react`（同仓声明该依赖的有 apps/desktop、content-creation、scripts 等，均不在 git preset 的 node 解析祖先链上）。
- 主工作区实测：`require.resolve('@testing-library/react', { paths: [<git preset test 目录>] })` 返回 `MODULE_NOT_FOUND`；root 与各中间层 `node_modules` 均无该包。
- TASK-0187 隔离工作树不含 `noGit.test.tsx`（其基线早于 a156f19e7），因此该失败与稳定性批次改动无关；合并后主树复现同一解析失败，属于存量环境/声明缺口。

## 复现

```bash
bun scripts/quality/run-vitest.mjs --run --config packages/plugins/presets/git/vite.config.ts packages/plugins/presets/git/test/noGit.test.tsx
```

## 修复方向

在 git preset `package.json` 声明 `@testing-library/react`（对齐其他 preset 的 `16.3.2` 固定版本）并 `bun install --frozen-lockfile` 复验；不排除顺带核查其他 preset 是否存在同类未声明测试依赖。修复时补一条"标准检出可收集"的验证记录。

## 关联

- TASK-0187 集成复验首次在主树触发并完成归因；修复独立立项，不阻塞该批次集成结论。

## 回归与修复

归入 [TASK-0201](../tasks/TASK-0201-git-preset-test-deps.md)：按 `packages/plugins/AGENTS.md` 测试要求，把该插件 React UI 测试栈改为包内显式声明（`@testing-library/react` 16.3.2 + `jsdom` 26.1.0 + `vitest` ^4.1.11，对齐 content-creation / scripts / comfyui-media-provider），不再依赖根提升与 vitest peer 装配。

- 修复证据：标准检出包级 11 文件 / 62 例通过（修复前 1 文件失败、0 收集）；三依赖从测试目录解析成功；`bun install --frozen-lockfile` 与完整 `bun run check` 通过；修复提交 `235b33456`。
- 同批核查：其余 preset / external 未发现同类不可解析缺口（`vetta-ui-design` 的 jsdom 环境文件经 vitest 依赖条目内的 jsdom 可加载、套件全绿，仅观察，不在本修复范围）。
