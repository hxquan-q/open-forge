---
id: TASK-0201
type: task
status: done
priority: P2
owner: packages/plugins/presets/git
source: BUG-0077（TASK-0187 集成复验归因）
related_requirement: []
related_plan: []
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0077]
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: add53c55dcfd173172f253e28eb0cec0c78f8fc9
read_paths: [packages/plugins/presets/git, packages/plugins/presets/content-creation, packages/plugins/presets/scripts, packages/plugins/AGENTS.md, scripts/quality/run-vitest.mjs, project/bugs, project/tasks]
write_paths: [packages/plugins/presets/git/package.json, bun.lock, project/tasks, project/bugs, .github/release-notes/v0.1.3.md]
exclusive_paths: [bun.lock]
depends_on: []
conflicts_with: [TASK-0197]
integration_status: integrated（main 主工作区串行 235b33456）
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# 补齐 git preset 的 React 测试依赖声明（BUG-0077）

## 目标与范围

修复 BUG-0077：`packages/plugins/presets/git/test/noGit.test.tsx` 在标准检出下因 `@testing-library/react` 不可解析而 0 用例收集、包级测试退出码 1。按 `packages/plugins/AGENTS.md` 的测试要求，把该插件 React UI 测试栈改为包内显式声明（`vitest` + `jsdom` + `@testing-library/react`，版本对齐 content-creation / scripts / comfyui-media-provider 既有声明），不依赖根提升或 vitest peer 装配。

### 并发评估

- 结论：不支持并行（串行小修）
- 执行方式：serial
- 可并行 Task：无（`bun.lock` 独占）
- 前置依赖：无
- 冲突文件/独占路径：`bun.lock`（exclusive）；与 TASK-0197 共享 `project/tasks` 与 `.github/release-notes/v0.1.3.md` 写面（已登记 conflicts_with）
- Branch：main
- Worktree：无（主工作区实施，不拆独立树）
- 集成负责人：本会话（Coordinator 角色）
- 集成顺序：本修复先入 main；TASK-0197 批次后集成时逐项合并共享记录文件

### 做

- 在 git preset `package.json` 声明测试栈三依赖并更新根 `bun.lock`。

### 不做

- 不改测试断言、用例、环境 pragma 与超时；不改插件运行时代码、Vite/MF 配置；不动根依赖版本；不处理其它包（核查结果见交付记录）；不推送、不发版。

## Given / When / Then

- Given 标准检出执行 `bun install` 后的主工作区，When 运行 `bun run --cwd packages/plugins/presets/git test`，Then 11 个测试文件全部收集通过（含 noGit.test.tsx 2 例），退出码 0，无 import 解析错误。
- Given 标准检出的 node_modules 解析链，When 从 git preset 测试目录解析 `@testing-library/react`、`jsdom`、`vitest`，Then 全部解析到本包声明的版本（不再 MISSING）。

## 必须保持

- noGit.test.tsx 对「未装 git 引导与重新检测」的两条行为断言不变。
- 其余 10 个测试文件（60 例）保持通过。
- `bun install --frozen-lockfile` 的锁文件一致性保持。

## 测试与验证

- 定向：`bun run --cwd packages/plugins/presets/git test`（基线：1 文件失败 / 0 收集；目标：11 文件 62 例全绿）。
- 依赖解析：`node -e` 从测试目录对三依赖做 `require.resolve`。
- 锁文件：`bun install` 后 `bun install --frozen-lockfile` 通过。
- 质量检查：`bun run check`。

## 验收分层

- 工程验证：通过（2026-10-03，基线 HEAD `add53c55d` + 修复 `235b33456`）。修复前基线：`bun run --cwd packages/plugins/presets/git test` → 1 文件失败（noGit.test.tsx 0 收集）/ 10 通过，退出码 1。修复后：定向 `noGit.test.tsx` 2/2；全包 11 文件 / 62 例通过、退出码 0；三依赖从测试目录解析成功（RTL 16.3.2 / jsdom 26.1.0 / vitest 4.1.11）；`bun install --frozen-lockfile` 退出码 0；`bun run check` 退出码 0。
- 技术评审：自审（diff 为依赖声明 + 锁文件边 + 发布说明一行，无逻辑改动）。
- 集成：已提交本地 main（`49e0a2728` 记录、`235b33456` 修复）；integration_status: integrated。
- 人工功能验收：不适用（内部测试基础设施修复，无用户可见行为；既定完成标准为「标准检出下包级测试全绿」，对照 TASK-0145 先例）。
- 发布：已授权推送 origin/dev（`add53c55d..6e2c6537f`，2026-10-03，随收口批次）；未发版、未改已发布正文。

## 功能验收包

- 入口与前置条件：标准检出 + `bun install`。
- 操作步骤：`bun run --cwd packages/plugins/presets/git test`；或改动 git preset src 后由 `test:impact` / `test:changed` 选中该包。
- 预期行为与最终产物：全部测试文件可收集运行，退出码 0。
- 不通过表现与已知限制：重现 `Failed to resolve import "@testing-library/react"` 或 0 收集即未修复；不涉及运行时行为与界面。
- 验收反馈及回归案例：无用户可见变化。

## 交付记录

- 实际修改：`packages/plugins/presets/git/package.json`（devDependencies 增加 `@testing-library/react` 16.3.2、`jsdom` 26.1.0、`vitest` ^4.1.11）；`bun.lock`（工作区条目与 `@vetta/plugin-git/@testing-library/react` 解析条目，+5 行）；`.github/release-notes/v0.1.3.md`（「其他」一行）；`project/tasks/TASK-0201-*.md`、`project/bugs/BUG-0077-*.md` 与两个 README 索引行。
- 实际运行：修复前基线（HEAD `add53c55d`）：包级测试 1 failed / 10 passed（noGit 0 收集，退出码 1）、`require.resolve('@testing-library/react')` MISSING。修复后：`bun install`（锁文件 +5 行）→ `bun install --frozen-lockfile` 退出码 0；`node -e` 三依赖解析成功；`bun run --cwd packages/plugins/presets/git test -- noGit.test.tsx` 2/2；`bun run --cwd packages/plugins/presets/git test` 11 文件 / 62 例全部通过、退出码 0；`bun run check` 退出码 0。
- 未运行及原因：`test:impact` / `test:changed` 未单独运行——`package.json` 与 `bun.lock` 会触发全 workspace 选择面（含存量 CLI 环境类失败 BUG-0059 面，且易与并行会话争抢资源产生假红）；本次改动仅为叶子 preset 新增 devDependencies 边、无被依赖消费者，标准检出下该包整包测试与完整 `check` 已覆盖实际影响面。未运行 `verify:ui:*`（无 UI/运行时行为变化，且未获授权）。
- 同类核查：其余 preset / external 均未发现同类不可解析缺口；`vetta-ui-design` 两个 jsdom 环境文件未声明 jsdom，但可经 vitest 依赖条目内的 jsdom 正常加载、其套件全绿（106 文件 / 688 例），仅作观察，不在本任务范围。
- Worktree：未拆出 worktree（串行小修，主工作区直接实施；`bun.lock` 列 exclusive）。
- 剩余风险：测试栈版本从此随根锁文件固定；未来升级 RTL / jsdom 需与既有 preset 同口径同步，不改变插件运行时与发布产物。
