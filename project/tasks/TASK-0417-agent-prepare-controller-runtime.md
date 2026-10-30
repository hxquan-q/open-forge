---
id: TASK-0417
type: task
status: verifying
priority: P1
owner: scripts/agents
requirement: REQ-0002
source: user-request; ISSUE-0035; TASK-0412 isolated preparation timing
related_requirement: [REQ-0002]
related_plan: [PLAN-0019]
related_tasks: [TASK-0412, TASK-0416]
related_issues: [ISSUE-0035]
related_bugs: []
execution: serial
branch: task/TASK-0412-delivery-blockers
worktree: unassigned（主检出串行实施）
base_commit: f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0
read_paths: [scripts/agents/, scripts/worktree/, project/, docs/adr/0146-repository-autonomy-controller.md]
write_paths: [scripts/agents/prepare.mjs, scripts/agents/integrate.test.mjs, project/tasks/TASK-0417-agent-prepare-controller-runtime.md, project/tasks/TASK-0412-desktop-delivery-baseline.md, project/tasks/README.md, project/issues/ISSUE-0035-windows-desktop-test-baseline.md, project/decisions/waivers/WAIVER-0016-delivery-repair-release-fragments.md, .github/release-notes/fragments/v0.1.4/task-0417-agent-prepare-controller-runtime.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Worktree 准备沿用控制器运行时

## 目标与范围

prepareTask 从 Node 控制器固定切换到 Bun 执行兼容 Node 的 worktree CLI。第七批 integrate beforeAll 触及原 10000ms；之后两文件诊断 bqsaty7ge 实际 15/15 通过，但准备阶段的 Bun 子进程约 5.16 秒。独立隔离环境探针中，Node 的 Git 启动约 63–81ms，Bun 新进程首次约 4 秒、后续约 60–90ms；绝对 Git 路径仍复现首次延迟。该证据只定位可消除的运行时切换成本，不宣称解释所有历史超时。

直接使用 process.execPath 运行同一 scripts/worktree/cli.mjs，优于新增运行时配置、PATH 改写或 Mock Worktree。命令、cwd、隔离环境、取消、租约、状态、真实 Git 及安全重验保持；Node 控制器沿用 Node，Bun 控制器仍沿用 Bun。不改变用户命令、公共 API 或状态模型，无需新增 ADR。

## 并发评估

串行，与 TASK-0416 共用同一 integrate 测试候选；没有实现 Worker。当前只读审查不修改文件，最终新差异另交实际评审。不提前集成或推送。

## Given / When / Then

- Given 从 Node 运行控制器且 Task 为 ready，When prepareTask 调用真实 Worktree CLI，Then 子进程使用当前控制器的绝对运行时路径，不额外选择 Bun；转发真实 spawn 的合同先在旧实现有效 red。
- Given 同一真实 Task/仓库，When 准备并执行原连续集成流程，Then Task 元数据与独立分支真实创建，原修复、独立评审、逐检查、main 前进拒绝和最终应用断言全部保持。
- Given 初始化取消或失败，When 收尾，Then TASK-0416 的取消、等待及 fail-closed 语义不变。

## 必须保持

不提高 timeout/retry，不新增 skip，不删除原断言或安全重验，不新增依赖、不改全局 PATH/Git。保持真实 worktree CLI，不复制已准备状态或缓存执行证明。不启用模型、发布或用户实例，不操作真实远端，不移动 v0.1.3 或选择版本。

## 测试与验收

1. integrate.test.mjs 在 child_process.spawn 外部边界转发真实调用，新增当前运行时与原 CLI 参数/cwd 合同，先确认旧实现失败于运行时不匹配而非初始化超时。
2. 单行修改 prepareTask 后同命令 green，再以仓库 Node runner、单 worker、原设置运行 process/runner/integrate 完整文件。
3. 独立只读评审、check:quick、diff 和定向 Task 合同；最终以 TASK-0412 冻结完整候选的 test:changed 与完整 check 决定集成条件。
4. 内部说明沿用 WAIVER-0016 的候选暂存及原到期日，不豁免其他门禁。

## 验收分层与交付记录

工程：新增真实 spawn 转发合同，旧实现准确失败于 expected node.exe / received bun，1 失败、5 项名称未选中，9.23 秒；不是初始化超时。prepareTask 改用 process.execPath 后同合同 1 通过、5 项未选中，4.72 秒；原 beforeAll 10000ms 与其他上限不变。随后完整 process/runner/integrate 三文件 22/22 通过（62.35 秒），原连续流程及六项 integrate 均实际执行；不是完整候选通过。首轮 check:quick 报 command 数组换行格式，已按 Biome 提示局部修正；复跑六文件 quick、全部 guards、diff 与 TASK-0417 定向 worktree 合同均通过。最新评审返修组合 bcef7fb0r 的 process/runner/integrate/git/policy/release 六个完整文件 63/63 通过（95.30 秒）。修复后完整 check（bk47qkrk6）退出 0，lint、全部类型、guards 和 mobile lint 通过。冻结候选行为门禁仍待完成。技术评审：a890db6753dc3bec5 对运行时选择和真实 spawn 转发合同只读复核，未发现可确认问题；未运行测试，不替代门禁。集成：pending。人工功能验收：不适用，内部准备流程不涉及产品 UI。发布：未执行。
