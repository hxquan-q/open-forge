---
id: TASK-0176
type: task
status: draft
priority: P2
owner: quality + desktop + cli-host tests
source: RESEARCH-0019; TASK-0172
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0148, TASK-0170, TASK-0173, TASK-0174]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（仅规划，未开始代码实施）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [scripts/quality/test-pkg.mjs, scripts/quality/run-vitest.mjs, scripts/quality/vitest-env.mjs, apps/desktop/vitest.config.ts, apps/cli-host/vitest.config.ts, docs/dev/quality-gates.md]
write_paths: [scripts/quality/test-pkg.mjs, scripts/quality/run-vitest.mjs, scripts/quality/vitest-env.mjs, scripts/quality/quality-gates.test.mjs, docs/dev/quality-gates.md, project/verification, project/tasks/TASK-0176-test-pipeline-cost-profiling.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0173]
conflicts_with: [TASK-0173, TASK-0174]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 回归测试耗时剖析与低风险提速

## 当前事实与目标

TASK-0171 最终全包阶段 1539.5 秒：Desktop 692.5、CLI 486.7、Coding Agent 114.6。前两包占约 76.6%；这些是历史单机观测，不是性能 SLA。此前高并发与偶发超时有关，不能直接恢复更多 worker。

目标：定位主要耗时是转译/模块载入、安装制品构建、夹具等待还是资源争用；只对已证实的瓶颈落一项低风险优化，缩短常规反馈而不降低可靠性和覆盖。

证据与同类去重见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。本记录为待执行合同，**本轮只建档，没有实施授权或修复结果**。

## 范围与取舍

先记录固定提交/Node/Bun/CPU/可用内存、冷暖缓存、测试清单、失败分布与峰值资源的基线；优先分析 Desktop 与 CLI，复用现有 package duration summary。稳定性结论依赖 TASK-0173，实验阶段不直接修改默认 worker、timeout 或测试集合；若没有优于运行抖动的改善，仅交付基线与否决结果。

不做：不硬编码未经测量的百分比目标、不调高超时、不删用例、不把跳过、重试或更多并行视作已解决问题。

## 输入、输出与并发

- 输入：上述固定源码快照、相关 Task/Bug 与可控测试夹具；开工先复核新 HEAD 和最近 AGENTS/README。
- 输出：本范围可独立回滚的改动或诊断/测量结论、对应回归与真实验证记录。
- 当前串行规划；依赖为 frontmatter 的 depends_on。未来仅在获得多 Agent 授权并补齐互斥写路径后使用独立 Task Worktree，不在主目录并行写。
- 共享冲突：记录的 conflicts_with 及公共索引/发布说明由 Coordinator 串行合并；性能/时序实验不得互相争抢同机资源。

## Given / When / Then 与验收

1. Given/When/Then：同快照、同资源、同测试集合的至少三组串行基线/候选对照，记录中位耗时和失败次数，不把不同机器/缓存/负载作同条件对比。
2. Given/When/Then：候选优化保持全部断言、超时、取消与进程内部并发，必要脚本合同能防止显式参数失效；无可靠改善或引入失败时不改默认值。
3. Given/When/Then：最终标准 test:changed 和 check 仍执行完整应有集合；局部 impact 提速不能作为缩小 CI 或跳过全量闸门的理由。

完成标准：结构化基线、瓶颈证据、候选/否决理由及同条件对照可复查；默认策略变化必须有可靠改善，否则保留当前策略。

## 必须保持

原有错误/取消、资源释放和公开合同；不新增 any、静默本地回退或凭据暴露，不降低测试基线。工具不接触真实用户实例/配置，不调用付费 Provider。

## 验证命令

- `bun run test:changed --base <固定基线提交>`、`bun run --cwd apps/desktop test`、`bun run --cwd apps/cli-host test`，固定文件列表与环境后选最小有代表性的重复范围。
- 若修改 runner/选择器：`bun run test:quality`、`bun run test:changed --base origin/dev`、`bun run check`。
- 只允许本地假服务与临时制品；实验不能与其他重负载验证同时运行，不启动 Desktop dev。

## 验收分层与当前交付

当前只完成规划，未来行为测试/实现/技术验收均未执行；源码/证据自审不等于产品测试通过。集成 pending，未创建代码分支或 Worktree。实现后回填 red/green、实际命令、提交与未验证边界，功能人工接受与发布分别处理。
