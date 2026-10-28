---
id: TASK-0410
type: task
status: in_progress
priority: P1
owner: runtime-tools/runtime-node/coding-agent
requirement: REQ-0002
plan: PLAN-0026
source: user-request; RESEARCH-0047
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0411]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0410-shared-resource-admission
worktree: unassigned（待创建）
base_commit: 052192d4568039ff9d304ee9b704f5db83553154
read_paths: [packages/runtime-tools/, packages/runtime-node/, packages/coding-agent/, docs/adr/, project/]
write_paths: [packages/runtime-tools/src/coding/async-execution-gate.ts, packages/runtime-tools/src/coding/async-execution-gate-contracts.ts, packages/runtime-tools/src/coding/host/desktop-command.ts, packages/runtime-tools/src/coding/host/index.ts, packages/runtime-tools/src/coding/index.ts, packages/runtime-tools/test/coding/async-execution-gate.test.ts, packages/runtime-tools/README.md, packages/runtime-node/src/coding/tools/extract-text-from-image/extract-text-from-image-tool.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/extract-text-from-pdf-tool.ts, packages/runtime-node/test/coding-suite/ocr-admission.test.ts, packages/coding-agent/src/tool-policy/ocr-execution-gate.ts, packages/coding-agent/src/composition/session-initialization/peripheral-assembly.ts, packages/coding-agent/test/tool-policy/ocr-execution-gate.test.ts, docs/adr/0151-resource-admission-and-release.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 共享资源 gate 的可取消、有界、公平准入与 OCR 接线

## 目标

多个会话争用 OCR 时，排队请求能及时取消、明确超时/队满并按会话公平补位；取消结果先返回时底层操作仍占资源名额，直到其 Promise 真正收敛。公开工具输出和现有执行预算保留。

## 范围

### 并发评估

- 结论：条件支持，与 TASK-0411 无实现写域重叠；各用独立工作树，集成顺序 0410 → 0411。
- 执行方式：parallel；0410 原生 Worker 写入，Coordinator 负责索引/发布说明/最终集成；不是独占代码库，保留其他人修改。
- Branch：`task/TASK-0410-shared-resource-admission`；Worktree 由仓库 CLI 创建回填；基线本地 main；集成负责人 Coordinator。
- 前置依赖：无；共享导出/合同仅本 Task 修改，增加必要辅助文件前先回写读写范围。

### 做

- 兼容扩展 `run(operation, options?)`，支持 AbortSignal、等待时限、稳定 ownerId/requestId 和安全事件回调；factory options 支持 maxQueued、FIFO/owner round-robin、可控时间源。旧调用默认 FIFO，不改变知识库消费者。
- 调用方取消后及时拒绝，但已启动操作继续计入 active/draining，直到原始操作 Promise 收敛；排队取消/超时不运行操作；同步抛错、构造/拒绝路径正确回收，不产生未处理拒绝。
- 事件只含稳定身份、阶段、计数与耗时；观察者异常不影响工作，所有 timer/listener 在所属生命周期结束时释放。错误有稳定 code，不以解析文案控制流程。
- 产品 OCR 显式选择并发原值、等待上限 60 秒、最多 8 等待、session 轮转。原生 image/PDF 传递 signal/sessionId/toolCallId；通过既有 observation publisher 接线，不记录路径/正文/参数。
- 公共合同生产者/消费者和导出成套核对，写 ADR-0151 与 README。

### 不做

不改子代理/工具窗口默认数，不引入 codemode，不改进程 Port 或真实用户实例，不将全部工具放入统一全局锁，不自动重试失败工具。

## Given / When / Then

- OCR 正在执行、后续图像/PDF 等待 → 用户取消等待请求 → 及时失败且从未启动辅助进程；随后正常请求仍成功并保留输出。
- 等待请求超过 60 秒或队列 8 项已满 → 新调用/推进时钟 → 得到可区分错误、无操作副作用，容量恢复后新请求可用。
- 会话 A 堆积多项、B/C 也在等待 → 有槽释放 → 跨 owner 轮转，owner 内保序，不超并发。
- 已启动操作忽略取消 → 取消调用方 → 结果可先失败，但下一项必须等原始操作 Promise 收敛才启动。
- 观察者抛错或操作同步抛错/异步拒绝 → 后续操作 → 不泄漏容量和监听器，不改变原始业务结果。

## 必须保持

OCR 默认 1、image 5 分钟/PDF 30 分钟执行时限、输出/取消文本、Schema、权限、目录解析、原 FIFO 默认以及 Node/SSH 的宿主所有权；不声称任意外部 Promise 等价于进程退出。

## 测试与验证

- 定向：runtime-tools gate、runtime-node OCR 正常工具入口、coding-agent OCR policy/observation。
- 用户流程：共享 gate 上跨 session OCR 排队 → 取消/超时 → 释放原操作 → 后续工具产出结构化结果；外部进程仅 Fake Port。
- 使用 fake clock/显式 deferred，先红再绿；`test:impact`、按公共合同选择 `test:changed`、`check:quick`、完整 `bun run check`。

## 验收分层

- 工程验证：待执行。
- 技术评审：待独立只读评审。
- 集成：pending；Coordinator 集成后绑定实际提交与复验。
- 人工功能验收：待验收；真实 OCR/UI 未获授权，提供自动化证据与操作预期。
- 发布：稳定发布未授权；开发候选推送按已有批次合同判断。

## 功能验收包

- 入口：现有 `extract_text_from_img` / `extract_text_from_pdf`。
- 操作：多个会话提交 OCR，取消一个等待者，观察其他请求正常继续；重复堆积时得到有界错误。
- 不通过表现：取消后仍启动原 OCR、实际操作未结束就超发、长会话永久独占待启动请求或输出变形。

## 交付记录

- 实际修改/运行/审查/工作树/剩余风险：待实施回填；不将规划描述当成已通过证据。
