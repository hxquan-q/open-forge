---
id: TASK-0174
type: task
status: done
priority: P1
owner: ssh-transport + quality
source: RESEARCH-0019; TASK-0172
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0168, TASK-0153, TASK-0165, TASK-0177]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（2026-10-03 主检出串行实施完成）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/ssh-transport, scripts/quality/lib.mjs, scripts/quality/test-changed.mjs, scripts/quality/test-impact.mjs, .github/workflows/quality.yml]
write_paths: [packages/ssh-transport/package.json, packages/ssh-transport/vitest.config.ts, packages/ssh-transport/README.md, scripts/quality/quality-gates.test.mjs, project/tasks/TASK-0174-ssh-standard-test-entry.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0168]
conflicts_with: [TASK-0168, TASK-0176, TASK-0177]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# SSH 标准测试入口与选择器覆盖合同

## 当前事实与目标

当前包有 17 个 src/**/*.test.ts，但 package.json 没有 test。只读调用 createChangedTestPlan([ssh2-runner.ts]) 的 toTest 只有 runtime-desktop/desktop；test:impact --dry-run 同样回退，不能替代 SSH 自身测试。quality.yml 已有 Linux/macOS/Windows 矩阵，缺口是测试注册和夹具适配，**不是缺少 CI 平台矩阵**。

目标：让 SSH 生产文件变更通过标准入口自动选择并实际运行所属包的测试，防止只能手动跑、消费者绿灯掩盖直接测试缺失。

证据与同类去重见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。本记录为待执行合同，**本轮只建档，没有实施授权或修复结果**。

## 范围与取舍

在 TASK-0168 的跨平台夹具合同明确并通过后，添加使用仓库 Node runner 的 package test 脚本和必要 Vitest 配置；补 SSH 选择器防回退合同。默认复用现有 quality.yml，不新增重复 CI 工作流或全仓“每包必须有 test”的泛化门禁。README 的测试命令与 TASK-0177 串行合并。

不做：等待 TASK-0168；不能只加入口后排除所有当前 Windows 失败用例，也不能靠改 root TESTABLE_PACKAGES 把该包再次藏掉。

## 输入、输出与并发

- 输入：上述固定源码快照、相关 Task/Bug 与可控测试夹具；开工先复核新 HEAD 和最近 AGENTS/README。
- 输出：本范围可独立回滚的改动或诊断/测量结论、对应回归与真实验证记录。
- 当前串行规划；依赖为 frontmatter 的 depends_on。未来仅在获得多 Agent 授权并补齐互斥写路径后使用独立 Task Worktree，不在主目录并行写。
- 共享冲突：记录的 conflicts_with 及公共索引/发布说明由 Coordinator 串行合并；性能/时序实验不得互相争抢同机资源。

## Given / When / Then 与验收

1. Given/When/Then：只改 ssh2-runner.ts，createChangedTestPlan 与 test:impact 都包含 SSH 直接测试及必要消费者；删除 test 脚本会使新合同失败。
2. Given/When/Then：通过 package test 和三平台现有 quality job 执行核心 URI、命令引用、主机密钥、认证、取消、二进制传输；故意破坏 SSH 断言时进程必须非零退出。
3. Given/When/Then：明确 POSIX 进程语义与 Windows ssh2 各自适用集合；跨平台核心不能被整文件 skip，Go/helper 前置缺失须显式报告，不能当作已测试。

完成标准：选择计划、标准本地入口和现有 CI 三者一致；故障回归会使标准命令失败，测试清单与平台差异可审查。

## 必须保持

原有错误/取消、资源释放和公开合同；不新增 any、静默本地回退或凭据暴露，不降低测试基线。工具不接触真实用户实例/配置，不调用付费 Provider。

## 验证命令

- 实施后 `bun run --cwd packages/ssh-transport test`；`bun run test:quality`。
- `bun run test:impact -- packages/ssh-transport/src/ssh2-runner.ts`；`bun run test:changed --base origin/dev`；`bun run check`。
- 分别保留现有 Windows/macOS/Linux CI 的直接测试选择及执行证据；本机不能代替其他平台实测。

## 验收分层与当前交付

当前只完成规划，未来行为测试/实现/技术验收均未执行；源码/证据自审不等于产品测试通过。集成 pending，未创建代码分支或 Worktree。实现后回填 red/green、实际命令、提交与未验证边界，功能人工接受与发布分别处理。

## 交付记录（2026-10-03，主检出串行实施，前置 TASK-0168 已落地）

- 实现：`packages/ssh-transport` 新增 `test` 脚本（`bun ../../scripts/quality/run-vitest.mjs --run --config vitest.config.ts`）与显式 `include: src/**/*.test.ts` 的 vitest.config；`TESTABLE_PACKAGES` 由 manifest 自动派生，入口存在即被 `test-pkg`/`test:impact`/`test:changed` 选择。`quality-gates.test.mjs` 新增防回退断言：ssh-transport 必须在 TESTABLE_PACKAGES 中，且 `createChangedTestPlan([ssh2-runner.ts])` 的 toTest 必须包含 `ssh-transport`——删除 test 脚本会使该合同失败。
- 入口首跑暴露并收口（配合 TASK-0168）：此前从未被标准入口执行的三份文件（remote-command / remote-listeners / helper.e2e）进入集合，Windows 侧按 0168 适配/显式门控后包级 195 通过 25 显式跳过。
- 验证：`bun run --cwd packages/ssh-transport test` 195/25 绿；`bun run test:quality` 484 通过（含新断言）；`bun run test:impact -- packages/ssh-transport/src/ssh2-runner.ts` 实际选择并运行 ssh-transport 自身测试（36 相关用例）；批次级 `test:changed --base origin/dev` 与完整 `bun run check` 见批次收口记录。
- 未验证项：三平台 CI 矩阵的实跑证据待 push 后由 quality.yml 产生（本机只代表 Windows）；README 测试章节按依赖顺序归 TASK-0177 更新。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
