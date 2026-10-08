---
id: TASK-0192
type: task
status: done
priority: P1
owner: desktop-build
source: user-request; RESEARCH-0022; upstream 34a350058
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0187]
related_issues: []
related_bugs: [BUG-0076]
execution: serial
branch:
worktree:
base_commit: 48b8e487fd47e4009da7edf0d09169426a873529
read_paths: [apps/desktop/scripts/build-dev-processes.mjs, apps/desktop/scripts/build-dev-processes.test.ts]
write_paths: [apps/desktop/scripts/packaged-native-dependencies.mjs, apps/desktop/scripts/packaged-native-dependencies.d.mts, project/bugs/BUG-0076-dev-cache-missing-workspaces.md, apps/desktop/scripts/main-bundle-workspace-inputs.mjs, apps/desktop/scripts/main-bundle-workspace-inputs.d.mts, apps/desktop/scripts/build-dev-processes.d.mts, apps/desktop/vite.main.config.ts, apps/desktop/scripts/build-dev-processes.mjs, apps/desktop/scripts/build-dev-processes.test.ts, project/tasks/TASK-0192-dev-bundle-cache-inputs.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: []
conflicts_with: [TASK-0187]
integration_status: pending
created: 2026-10-03
updated: 2026-10-07
---
<!-- Copyright The Open Forge contributors. -->

# 开发主进程缓存覆盖实际打包输入

## 目标与范围

适配上游 34a350058 的一个行为切片；来源研究 RESEARCH-0022，Upstreamable；保留 Open Forge 既有增强，不整文件覆盖。仅改列明的实现和必要测试；额外路径在编辑前补记。

## 并发评估

串行。在 TASK-0187 的专用集成检出内执行，不另建工作树、不派并发 Worker；本 Task 的 branch/worktree 留空表示没有第二个独立工作树。上一切片提交并验证后才启动下一片。主树其他 Owner 的修改不得复制或夹带。

## Given / When / Then

缓存已建立；修改实际 bundle 的 workspace 产物；必须失效重建，未打包包不无故失效。

## 必须保持

保留现有 toolkit 源码与配置输入，不改打包策略或升级依赖。 不访问用户实例/状态、真实 Provider/SSH，不降低检查、删除断言或扩大权限。

## 测试与验证

先在现有测试/稳定入口增加可失败回归；通过仓库 Node Vitest runner 跑目标包对应测试，确认旧实现因预期断言失败而非依赖错误。最小修改后跑定向与代表性用户流程；test:impact、跨包 test:changed 和完整 bun run check 由 TASK-0187 在最终组合执行。内部代码允许自审；无实机授权，不运行 verify:ui。

## 验收分层与功能验收包

工程/技术评审待执行，集成 pending，人工验收待用户；开发候选推送授权见 TASK-0187，稳定发布未授权。
用户按上面的正常流程操作，预期与不通过表现以 Given/When/Then 为准；自动化结果不能替代真实 UI/模型接受。

## 交付记录

实施前合同已落盘；后续回填红绿测试、实际命令、提交、未运行项和剩余风险。

实施细化：先行为保持抽取缓存输入/可导入构建入口，既有覆盖改为实际输入断言；再以临时 manifest 图证明漏掉 runtime-storage 的红测。Vite 与缓存共用 dev external 规则，遍历 Desktop 可达 workspace 依赖而非整个 packages 目录，保留嵌套 SDK 和 toolkit source alias。测试不调用构建 main、不准备模型、不读真实 .env。

基线：将既有输入提取为可测试函数并使构建入口导入无副作用，原 runtime-desktop/runtime-node 验证改为实际 inputs 断言，1 测试通过。新增临时依赖图与真实 hashPaths 回归后 1 失败/1 通过，失败明确为缺失 runtime-storage/dist。external 正则归既有 packaged-native-dependencies 唯一事实源，避免 Vite 导入带文件扫描的 helper。

绿测：`bun scripts/quality/run-vitest.mjs run apps/desktop/scripts/build-dev-processes.test.ts`；实际 Main inputs、临时图/字节 hash、external 共享边界和 toolkit source 合同。`node --test apps/desktop/scripts/packaged-native-dependencies.test.mjs` 7 通过。未运行 build-dev-processes CLI（会准备模型），仅必要 workspace 依赖构建和无副作用脚本导入。

中间门禁发现 Desktop 构建脚本不能相对导入根 quality 模块；未修改边界白名单，改为 Desktop 内构建专用 manifest 读取，external 仍复用既有同模块事实源。默认 Biome 排除这些脚本，因此最初显式格式命令无匹配文件；不据此声称格式检查通过，保留标准 quick/完整检查。

### 人工验收实测（2026-10-07，VERIFY-0017 组一）

方法：真实运行开发主进程构建 CLI（`bun run build:dev-processes` / `build-dev-processes.mjs`），按 Given/When/Then 变化输入产物并读缓存判决日志；此前交付记录明记「未运行 build-dev-processes CLI」，本轮补齐这一缺口。

- 输入图先核对：用仓内 `main-bundle-workspace-inputs.mjs` 的 `getMainBundledWorkspaceInputs(root)` 实算，Desktop 可达 workspace 依赖共 **20 个已打包**、**9 个未打包**（其余 `packages/*` 有 dist 但不在出口图内）。
- **缓存已建立**：`完成，构建 0/4 个任务`（1.36 s；4 个任务 preload/ocr-preload/ocr-runner/main 全部命中，日志逐条 `跳过 <name>（无变更）`）。
- **修改实际 bundle 的 workspace 产物 → 必须失效重建**：改 `packages/runtime-storage/dist/index.js`（已打包包，md5 `5296d630835938e7fd6230329610e100` → `4530377818b22017e00df5435a83a70c`）后重跑，日志 `构建 main …` + `完成，构建 1/4 个任务`——**恰好只失效 main**，preload/ocr 系仍命中；还原该文件后再跑一次又只重建 main（缓存里存的是被改后的 hash），再跑 `0/4`。
- **未打包包不无故失效**：改 `packages/runtime-core/dist/contracts.js`（未打包包，md5 `5003647d3deeb4287cdbcf34a4e8eb12` → `53a508cf7ad57477364a69cc58f16ec2`）后重跑，`完成，构建 0/4 个任务`，main 仍 `跳过`；还原后 `0/4`。
- 负例非空转的依据：缓存输入侧的排除规则与真实打包侧共用同一事实源——`main-bundle-workspace-inputs.mjs` 跳过 `DEVELOPMENT_WORKSPACE_EXTERNAL` 命中的包，`vite.main.config.ts:6,39` 的 `external` 列表导入的正是 `packaged-native-dependencies.mjs:92-93` 定义的同一常量，所以 runtime-core 同时不在缓存输入、也不被 main 打进包，`0/4` 与「它本来就与 main 产物无关」一致。
- 环境要点：输入 hash 由 `hashPaths(paths, env)` 计算，**把每个 `VETTA_*` 环境变量一并计入**；首次基线在 UI 验收 harness 环境外跑出现 4/4 全量重建，即源于 env 差异，之后全程固定同一环境，结果可复现（这条应在后续任何「缓存莫名失效」排查中优先检查）。
- 干净性：全程只改 `apps/*/dist`、`packages/*/dist` 下 gitignore 的产物，改前改后 md5 一一比对还原；收尾 `git status --porcelain` 仅剩本轮之前就存在的 ` M bun.lock`。

结论：GWT 四个分句（缓存建立 / 改动已打包产物 / 必须失效重建 / 未打包包不失效）均在真实 CLI 上逐条观察到，闭合为 `done`。
