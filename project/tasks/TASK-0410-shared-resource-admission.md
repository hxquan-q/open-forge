---
id: TASK-0410
type: task
status: verifying
priority: P1
owner: runtime-tools/runtime-node/coding-agent
requirement: REQ-0002
plan: PLAN-0026
source: user-request; RESEARCH-0047
related_requirement: [REQ-0002]
related_plan: [PLAN-0026]
related_tasks: [TASK-0411]
related_issues: [ISSUE-0035]
related_bugs: []
execution: parallel
branch: task/TASK-0410-shared-resource-admission
worktree: unassigned（已集成，待推送后清理）
base_commit: 6bb27d048c5dccade7decafde58f4eeb8ec6686c
read_paths: [packages/runtime-tools/, packages/runtime-node/, packages/coding-agent/, docs/adr/, project/]
write_paths: [packages/runtime-tools/src/coding/async-execution-gate.ts, packages/runtime-tools/src/coding/async-execution-gate-contracts.ts, packages/runtime-tools/src/coding/host/desktop-command.ts, packages/runtime-tools/src/coding/host/index.ts, packages/runtime-tools/src/coding/index.ts, packages/runtime-tools/test/coding/async-execution-gate.test.ts, packages/runtime-tools/README.md, packages/runtime-node/src/coding/tools/extract-text-from-image/extract-text-from-image-tool.ts, packages/runtime-node/src/coding/tools/extract-text-from-pdf/extract-text-from-pdf-tool.ts, packages/runtime-node/test/coding-suite/ocr-admission.test.ts, packages/coding-agent/src/tool-policy/ocr-execution-gate.ts, packages/coding-agent/src/composition/session-initialization/peripheral-assembly.ts, packages/coding-agent/test/tool-policy/ocr-execution-gate.test.ts, docs/adr/0151-resource-admission-and-release.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-28
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 共享资源 gate 的可取消、有界、公平准入与 OCR 接线

## 目标

多个会话争用 OCR 时，排队请求能及时取消、明确超时/队满并按会话公平补位；取消结果先返回时底层操作仍占资源名额，直到其 Promise 真正收敛。公开工具输出和现有执行预算保留。

## 范围

### 并发评估

- 结论：条件支持，与 TASK-0411 无实现写域重叠；各用独立工作树，集成顺序 0411 → 0410（先纳入已验证的旧 profile 测试维护）。
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

- 工程验证：隔离候选、新行为流程、六个其他受影响包与完整 check 通过；Desktop 14 项存量失败经独立原基线逐例复现，按 WAIVER-0015 仅本地集成，不宣称全跨包绿灯。
- 技术评审：新上下文独立只读审查完成，无未解决 P1/P2 或实质测试缺口；补齐重入、监听器清理和晚到拒绝回归。
- 集成：已集成本地 main；源候选 619cd9c3b，无冲突，随承载本记录的 merge 提交绑定；未推送，工作树保留待门禁解决及推送后清理。
- 人工功能验收：待验收；真实 OCR/UI 未获授权，提供自动化证据与操作预期。
- 发布：稳定发布未授权；开发候选推送按已有批次合同判断。

## 功能验收包

- 入口：现有 `extract_text_from_img` / `extract_text_from_pdf`。
- 操作：多个会话提交 OCR，取消一个等待者，观察其他请求正常继续；重复堆积时得到有界错误。
- 不通过表现：取消后仍启动原 OCR、实际操作未结束就超发、长会话永久独占待启动请求或输出变形。

## 交付记录

- 原生实现 Worker：`/root/resource_admission_impl`，仅在本 Task 工作树写入；独立只读审查 `/root/review_resource_admission`，只读回包与新增补证由 Coordinator 回收。工作树标准 CLI 创建/冻结安装/目标检查通过；实施期间主检出不含 Worker 运行时代码；最终由 Coordinator 串行集成。

- 候选与接手：源候选 619cd9c3bcf2e4acb8e3af1f55e46c68db1a9250；Worker完成实现与补证，收尾中断后由Coordinator回读暂存范围、重跑测试和完整检查并提交。未根据完成总结冒充代码已提交。
- 实际修改：兼容gate合同、稳定错误code、可取消有界排队、owner轮转、原始操作收敛前的资源占用、无内容事件，以及OCR原生工具/会话publisher接线；README和ADR-0151成套更新。
- 红绿：gate取消/资源保留2例先红后绿；image等待取消先红后绿；补充queued/started/released事件重入和同步取消、监听器成对清理、原操作晚到拒绝后补位。
- 最终定向：runtime-tools gate 17例；runtime-node新旧OCR工具2文件10例；Coding Agent OCR策略4例，均由Coordinator实际复跑 exit 0。
- 隔离检查：最终完整 bun run check exit 0，前一候选 check:quick也通过；首轮ADR声明头和测试callback返回类型问题已修复，不放宽守卫。
- 影响验证：原生工具相关30文件247例通过；Coding Agent首次相关108例中的profile旧断言失败已在main原基线重现，由0411保留原合同补齐。最终组合从公开合同同时覆盖两个Task，不隐藏先前失败。
- 评审：/root/review_resource_admission只读复核全部实际候选，新增测试的Node依赖边界问题已移除并复核，未使用真实模型/UI或声称异模型家族评审。
- 发布：按WAIVER-0014暂存 .github/release-notes/fragments/v0.1.4/task-0410-shared-resource-admission.md；0.1.3正文与manifest保留。
- 最终组合：bun run test:changed --base 6bb27d048 exit 1，六包全通过（2684例），Desktop 1102文件通过/7失败/4既有跳过，6233例通过/14失败/18既有跳过。完整 bun run check exit 0。真实OCR/UI/Provider未运行，人工功能验收保持待验收。

- 组合验证路径调整（2026-10-29）：六个包已通过，Desktop全包出现本轮未修改的远端命令/文件与后台流程失败。用本地共享clone建立6bb27d048的独立只读源码基线，冻结安装后在同一宿主重跑失败测试；不复制用户状态，不修改失败断言，不将归因前结果声明为存量。

- 基线方法纠正：node_modules内检出的远端测试复现同类shell失败，但TSX测试出现React未定义，受依赖目录的JSX转换影响，不计作UI基线证据。另建独立Temp本地检出重复UI对照，保留无效对照事实而不冒充通过。

- 最终归因与集成：独立 Temp 基线冻结安装后复跑七文件，14失败/17通过/3既有跳过，完整失败名称与候选逐项相等；不是本轮引入的失败。见 [ISSUE-0035](../issues/ISSUE-0035-windows-desktop-test-baseline.md)。按 [WAIVER-0015](../decisions/waivers/WAIVER-0015-resource-admission-local-baseline.md) 仅允许本地集成，推送门禁保留；不改任何存量失败测试的断言、skip、超时或生产行为。
