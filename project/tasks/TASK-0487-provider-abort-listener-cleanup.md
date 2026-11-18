---
id: TASK-0487
type: task
status: done
priority: P1
owner: packages/ai
requirement: []
source: user-request / workspace AUD-PROVIDER-ABORT-LISTENER-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0092]
related_issues: []
related_bugs: [BUG-0189]
execution: serial
branch: task/TASK-0487-provider-abort-listener-cleanup
worktree: unassigned（主检出串行，本地候选，不处理main）
base_commit: 0b682442f7e0c7d0ae7e2d2cfd652b95ca71b3b0
read_paths:
  - packages/ai/
  - packages/agent/src/engine/
write_paths:
  - packages/ai/src/provider-kit/provider-retry.ts
  - packages/ai/test/provider-retry.test.ts
  - project/tasks/TASK-0487-provider-abort-listener-cleanup.md
  - project/tasks/README.md
  - project/bugs/BUG-0189-provider-event-abort-listener-retention.md
  - project/bugs/README.md
  - .github/release-notes/fragments/v0.1.5/task-0487-provider-abort-listener-cleanup.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-17
updated: 2026-11-18
---
<!-- Copyright The Open Forge contributors. -->

# 公共Provider逐事件等待的取消监听配对释放

## 合同

- 来源：BUG-0189 / 工作区台账A3；队列第3项D2/S3。归属Upstreamable。TASK-0092已done/integrated，仅关联，不重开其历史预算合同。
- 目标：每次等待下一Provider事件后，无论正常、拒绝、idle超时或取消，释放本次abort监听和timer；同一Turn多次模型调用复用signal不叠加遗留监听。
- 输入→输出：现有公共stream/streamSimple调用方signal与事件流→相同输出、usage/stop/错误/重试事件及取消语义，等待资源恢复基线。
- 不做：不改双轨预算/次数、Retry-After、stall上限、默认180秒、错误分类、输出上限修复、Runtime/Session重试或公开导出；不量化性能/旧OOM因果、不读取真实会话/Provider。
- 方案比较：直接保存具名abort回调并try/finally配对清理即可；整次调用共享取消Promise会扩大生命周期改动，本次不引入。保留放弃iterator的迟到拒绝承接与drain，不能以提高MaxListeners上限掩盖。
- Given caller signal与必要的attempt链接监听，When 正常长流完成或同signal连续模型调用完成，Then 每次调用后监听数回到调用前基线，文本/终态不变。不得将活动attempt本身必要链接当泄漏。
- Given 内层真实stream.fail导致iterator拒绝，When 公共调用结束，Then监听与fake timer回基线、原非retryable错误终态保留、不新增attempt。
- Given idle超时/用户取消，When 可控时钟或显式abort触发，Then原重试与取消合同不变且无资源残留；被放弃iterator迟到settle不冒未处理拒绝。复用已有无signal/预取消回归，不任意sleep。

## 验证与执行

- 先读AI最近规则/README/相关协议与测试。复用provider-retry现有scriptedOpener、collect、fixture与真实AssistantMessageEventStream；`node:events.getEventListeners`检查caller signal，fake timers检查计时器。只在外部Provider边界替身，不导出私有nextAttemptStep或mock其内部。
- 先新增最小正常流监听红灯并确认失败来自遗留监听，再局部修复，扩展异常/超时/取消/同signal多次调用；实际命令和结果写交付。公共入口接线的代表性多次调用应覆盖，不仅单测私有函数。
- 定向：`bun scripts/quality/run-vitest.mjs --run packages/ai/test/provider-retry.test.ts`及适用既有linked-abort-signal/Provider流合同测试；不自动跑AI live/全包/impact/全量行为测试。
- 收尾：完整 `bun run check`（lint+类型+守卫，不含行为测试）；已知既有门禁问题不降低、不续期waiver，不夹带其他Bug，保持verifying/pending候选并如实记录。
- 并发结论必须串行：同一provider生命周期切片由一个实现者写入，Coordinator负责管理记录/发布碎片/本地提交，另派独立只读审查；不得并行实施队列后续Bug。
- 用户仅授权主仓与工作区，测试TEMP/TMP与隔离VETTA_HOME均在工作区 `.bugfix-validation/tmp`，日志同验证目录。不访问真实用户状态、不启动服务/UI/Provider、不操作main或远程Git。
- 人工验收：可提供长任务/取消步骤，但本轮软件合同不证明真实模型性能、取消耗时或OOM改善；工程与模型行为/人工接受/发布分层记录。

## 交付

- 已通过宿主原生子代理派发 `fix-abort`，仅获上述两份AI源码/测试写域，Coordinator维护管理记录与提交；同一切片不并行写入。
- 首次实现子代理异常退出且没有交付。Coordinator重新核对实际Git：两份目标源码/测试均无diff，仅父写Bug/Task/索引；父后台任务列表无本轮未收回验证。已续接同一代理，要求先检查其自身job再恢复，不把宿主/上游异常当作产品回归。
- 首切片实际红绿：新增真实公共 `streamSimple` + ScriptedLanguageModel正常长流32 delta回归，保留一条既有listener为基线。旧实现调用完成后监听35而非1，目标测试exit 1（其余30例按过滤跳过）；局部具名回调+try/finally配对清理后相同目标exit 0。Coordinator已读真实红灯日志，不把活动attempt必要链接误计为泄漏。实现者两轮job已回收。
- 最终实现仅两份文件：`nextAttemptStep`具名回调+try/finally成对释放；provider-retry测试新增6例正常长流、iterator拒绝有/无signal、idle恢复、取消迟到拒绝、同signal连续3次公共streamSimple。未改公开接口、预算/退避/默认期限/race或drain合同。
- 最终定向验证：AI包内 `bun ../../scripts/quality/run-vitest.mjs --run test/provider-retry.test.ts test/linked-abort-signal.test.ts test/event-stream.test.ts test/provider-stream-regression.test.ts test/stream-model.test.ts` exit 0，5文件83/83（36+2+7+35+3）；两份修改文件Biome只读检查exit 0。既有预取消、流中/退避取消、stall及输出上限修复随完整provider-retry文件实跑保留。`stream.test.ts`为live，未运行。
- Coordinator已读实际红绿日志与真实diff，未见无关改动；实现者3个后台job已回收并停写。未参与实现的新上下文 `review-abort`已完成独立只读审查，亲读候选和红绿日志，未发现本项代码/测试/安全阻断；未执行Git/测试，不冒充异家族审查。保存本地候选，保持verifying/integration pending，未通过完整门禁不宣称工程完成或集成通过；按用户允许跳过需owner治理事项后继续后续队列。
- 完整 `bun run check` 实跑并回收exit 1：全仓Biome、Task合同/索引、生成一致性、CLI/docs/mobile类型和mobile lint通过；失败仍为既有WAIVER-0011/0012过期、三份无关测试声明头、spawn request夹具缺字段、Desktop委任代码及旧terminal-settle测试类型错误，未见本项路径报错。保持未完成全仓验收，不修无关路径或擅自续期waiver。
- 发布碎片：`.github/release-notes/fragments/v0.1.5/task-0487-provider-abort-listener-cleanup.md`。不升版、不改已发布说明或汇编发布。
- 未运行impact/全包/全量/live测试、构建、UI、服务或真实Provider；TEMP/TMP定向授权工作区。证据仅证明资源配对与既有软件合同，不量化内存/取消延迟/性能收益，不关闭旧OOM或特定慢任务个案。

## 2026-11-18 验收：工程核对通过 + 人工接受

- 用户说明监听残留黑盒难以观察，要求工程核对无问题即通过；本轮按工程合同验收，不再要求真实实例观察 `MaxListeners` 数值。
- 代码核对（2026-11-18 直读 `packages/ai/src/provider-kit/provider-retry.ts`）：`nextAttemptStep` 用具名 `onAbort` 注册 `signal` 的 `abort` 监听，并在 `try/finally` 中成对执行 `clearTimeout(timer)` 与 `removeEventListener("abort", onAbort)`；正常返回、idle 超时、caller 取消、iterator 抛错四条出口均经 `finally` 释放，无提前 `return` 绕过。放弃 attempt 的 `iterator.next()` 以 `void ...then(ok, err)` 吞掉迟到结算，`drainAbandonedStream` 保留原 drain 语义；未发现新的监听累积路径，也未用提高 `MaxListeners` 掩盖。
- 复核运行：`cd packages/ai && bun ../../scripts/quality/run-vitest.mjs --run test/provider-retry.test.ts` → 1 文件 **36/36 通过**（2026-11-18 11:50 实跑，5.42s）。
- 结论：实现与合同一致，验收通过，转 done。真实模型取消延迟、内存与旧 OOM 个案仍不在本任务证明范围。
- `integration_status` 仍为 `pending`：本地候选在 `xquan`，尚未合入 `origin/dev`；未 push、未发布。
