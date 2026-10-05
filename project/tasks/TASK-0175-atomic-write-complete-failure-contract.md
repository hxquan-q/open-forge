---
id: TASK-0175
type: task
status: done
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
worktree: unassigned（2026-10-02 主检出串行实施，无多 Agent 授权）
base_commit: c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa
read_paths: [packages/toolkit/AGENTS.md, packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts, project/bugs/BUG-0060-atomic-write-pre-rename-failures.md]
write_paths: [packages/toolkit/src/atomic-write.ts, packages/toolkit/test/atomic-write.test.ts, project/tasks/TASK-0175-atomic-write-complete-failure-contract.md, .github/release-notes/v0.1.3.md]
exclusive_paths: []
depends_on: [TASK-0150]
conflicts_with: [TASK-0150]
integration_status: integrated
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

工程完成转 verifying；验收分层含义见交付合同，人工功能接受与发布分别处理。

## 交付记录（2026-10-02，主检出串行实施）

- 实现：`atomicWriteFile` / `performAtomicWrite` 改为完整字节循环（`writeAllSync` / `writeAllAsync`，零进度抛 `EIO` 不无限循环）；失败合同统一为「记录首个失败 → finally 关闭（关闭失败仅在无更早失败时成为首个错误）→ 尽力删除本次 tmp → 上抛首个错误」，成功需写满 + fsync + close 全部通过才进入 rename。异步路径由 `file.writeFile` 改为显式 `file.write` 循环，与同步同语义。TASK-0150 的唯一临时名、同路径异步队列、rename 重试预算与公开 API 全部保持。
- Red/Green：旧实现红——新增 11 项用例中 9 项失败（同步/异步短写截断提交、连续零进度、fsync 单独失败残留 tmp、fsync+close 双失败上抛 close 错误、仅 close 失败仍提交、失败后同路径恢复与不误删他人 tmp）；修复后 20/20。BUG-0060 五种注入模式全部覆盖，另补多字节内容与空内容边界。
- 实际命令与结果：cwd `packages/toolkit` 定向 20/20、全包 35/35；`test:impact` 与 `test:changed --base origin/dev`（与同批 TASK-0178 合并执行：desktop 4652、presets/content-creation、runtime-desktop、themes、toolkit）通过；`bun run check` exit 0。
- 未验证项/风险：真实断电/磁盘故障持久性未实测（合同本就不宣称）；Windows 外平台行为由既有测试与 Node FileHandle 语义覆盖，未做实机矩阵。
- 状态：工程完成转 `verifying`；`integration_status: integrated`（随本提交入 main）；人工功能验收与发布未执行。

## 收口（2026-10-06，TASK-0216）

- 本任务的改动不改变用户可观察的输出、界面、交互、安装与更新流程或 AI 行为；验收对象是测试、守卫、契约或台账本身，且既定验收标准已实际执行并通过。按用户在「验收方式」上选择的分层口径闭合：由 Agent 按工程证据闭合，依据是用户授权，不是用户已确认。
