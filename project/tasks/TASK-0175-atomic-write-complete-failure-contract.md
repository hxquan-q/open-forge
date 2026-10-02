---
id: TASK-0175
type: task
status: ready
priority: P1
owner: toolkit
source: RESEARCH-0019; TASK-0172
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0150, TASK-0151, TASK-0173]
related_issues: []
related_bugs: [BUG-0060]
execution: serial
branch: main
worktree: unassigned（仅规划，未开始代码实施）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/toolkit/AGENTS.md, packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts, project/bugs/BUG-0060-atomic-write-pre-rename-failures.md]
write_paths: [packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts, project/tasks/TASK-0175-atomic-write-complete-failure-contract.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0150]
conflicts_with: [TASK-0150]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 原子写入的完整字节与失败清理合同

## 当前事实与目标

对当前源码转译后做隔离 I/O 故障注入：writeSync 只写 1 字节并返回 1 时函数成功返回，new-value 被提交为 n；同步/异步 fsync 失败留 1 个 tmp；fsync 和 close 同时失败时上抛 close 错误。详见 BUG-0060；不是已观测到真实用户磁盘损坏。

目标：只有全部内容写完且同步/关闭成功才提交目标文件；受控失败不破坏旧目标、不会被清理错误覆盖首个异常，并只清理本次拥有的临时文件。

证据与同类去重见 [RESEARCH-0019](../research/RESEARCH-0019-post-integration-optimization-audit.md)。本记录为待执行合同，**本轮只建档，没有实施授权或修复结果**。

## 范围与取舍

同步写入验证完整字节进度，覆盖部分写和零进度；同步/异步写入阶段统一保持主错误与 best-effort 临时清理。保留 TASK-0150 的唯一临时名、同路径异步队列、rename 重试代码集合/预算、公开 API 与正常内容格式。

不做：不新增跨进程锁、全盘 tmp 扫描、目录 fsync 方案或存储迁移；不把 Windows/真实断电尚未验证的持久性宣称为保证。

## 输入、输出与并发

- 输入：上述固定源码快照、相关 Task/Bug 与可控测试夹具；开工先复核新 HEAD 和最近 AGENTS/README。
- 输出：本范围可独立回滚的改动或诊断/测量结论、对应回归与真实验证记录。
- 当前串行规划；依赖为 frontmatter 的 depends_on。未来仅在获得多 Agent 授权并补齐互斥写路径后使用独立 Task Worktree，不在主目录并行写。
- 共享冲突：记录的 conflicts_with 及公共索引/发布说明由 Coordinator 串行合并；性能/时序实验不得互相争抢同机资源。

## Given / When / Then 与验收

1. Given/When/Then：对含多字节字符的完整内容注入一次短写，后续成功时最终文件字节完整；尚有剩余字节时连续零进度不无限循环、不把部分内容 rename 到目标；空内容仍是合法成功写入。
2. Given/When/Then：write/fsync 失败（含随后 close 或 cleanup 再失败）时，原目标保持原样、返回首个失败，按所有权尝试关闭已打开句柄并尽力删除本次 tmp，关闭/清理失败不能覆盖主错误；单独 close 失败也不能提交。
3. Given/When/Then：同一路径失败后继续正常写入可以完成，不同写入的临时文件互不删除；既有 24 项 Toolkit 测试与 rename 预算回归保持。

完成标准：五个已观察故障模式与多字节/零进度/后续队列恢复覆盖，旧实现 Red、新实现 Green；独立可回滚，无调用方迁移。

## 必须保持

原有错误/取消、资源释放和公开合同；不新增 any、静默本地回退或凭据暴露，不降低测试基线。工具不接触真实用户实例/配置，不调用付费 Provider。

## 验证命令

- cwd `packages/toolkit`：`bun ../../scripts/quality/run-vitest.mjs run test/atomic-write.test.ts`；先把 BUG-0060 注入场景写成在旧代码失败的回归。
- `bun run --cwd packages/toolkit test`；`bun run test:impact -- packages/toolkit/src/atomic-write.ts packages/toolkit/test/atomic-write.test.ts`；`bun run check`。
- 仅使用自有临时目录，断言实际文件字节、残留文件及错误身份，不能只断言 mock 调用次数。

## 验收分层与当前交付

当前只完成规划，未来行为测试/实现/技术验收均未执行；源码/证据自审不等于产品测试通过。集成 pending，未创建代码分支或 Worktree。实现后回填 red/green、实际命令、提交与未验证边界，功能人工接受与发布分别处理。
