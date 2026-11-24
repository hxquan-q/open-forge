---
id: BUG-0189
type: bug
status: verifying
priority: P1
owner: packages/ai
requirement: []
plan: []
source: user-request / workspace AUD-PROVIDER-ABORT-LISTENER-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0487, TASK-0092]
related_issues: []
created: 2026-11-17
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# Provider逐事件等待遗留取消监听与拒绝路径计时器

## 用户流程

- Given 用户发起流式编码任务，一轮内复用同一取消signal，多次模型调用输出正常事件。
- When 公共Provider重试层逐事件等待并消费成功输出，或内层iterator异常拒绝。
- Then 每次等待应释放其监听与看门狗；当前正常事件只清timer、不移除abort回调，iterator拒绝还会跳过timer清理。

## 实际与期望行为

`packages/ai/src/provider-kit/provider-retry.ts`的`nextAttemptStep`每次匿名注册abort回调，正常胜出没有移除，`once`只有在实际abort时才移除。期望等待所有退出分支均成对清理，不改变现有取消、超时、重试、终态与迟到拒绝处理。

## 环境与失败证据

- 源码基线：Windows，Desktop manifest 0.1.4，当前候选链HEAD `0b682442f7e0c7d0ae7e2d2cfd652b95ca71b3b0`。
- 已实际复现：公共streamSimple+fixture Provider正常输出32 delta后，旧实现caller abort监听数35、原基线1，目标测试exit 1；局部修复后同用例exit 0。输出/stop/无retry断言在红灯时已通过，失败明确来自资源残留，非环境错误。
- 最小复现：用真实公共streamSimple及fixture Provider，复用同一caller signal消费长正常流，比较调用前后abort监听数；再使真实内层stream.fail拒绝，比较监听与fake timer数。

## 影响与根因边界

P1资源可靠性缺陷；正常长输出、同Turn多次模型调用会积累回调及相关Promise对象，规模/性能/取消耗时尚未量化。正常释放signal后具备GC条件，不认定跨会话永久泄漏、旧OOM或某次465秒任务的根因。不新增线程或模型请求。

## 回归与修复范围

由TASK-0487先红后绿覆盖正常长流、同signal多次公共调用、iterator拒绝、idle超时、取消及预取消/无signal兼容。保存具名abort回调并finally配对清理是优先局部方案；不修改重试预算、Retry-After、默认超时或公开接口。

## 候选修复与验证

- `nextAttemptStep`具名abort回调在try/finally中配对移除并清timer，异常/正常/idle/取消均覆盖，保留原race、迟到拒绝承接与drain。
- 先红监听35≠基线1，修后同例绿；5份AI流/重试/协议回归83/83通过，包含新增6例资源清理。两份修改文件Biome只读检查通过。
- 新上下文 `review-abort`独立只读审查无本项代码/测试/安全阻断；未自行执行测试或Git。
- 完整bun run check exit 1，仍由既有过期waiver、三份无关声明头、spawn请求夹具/委任/旧终端测试类型错误阻断；本项未见报错，不改无关代码或降低门禁。保持verifying/integration pending的本地候选，不宣称工程完成/已集成/发布。
- 未运行impact/全包/全量/live测试、构建、UI或真实Provider；资源计数合同不量化内存/耗时收益，不作为旧OOM归因。详细命令与边界见TASK-0487。
