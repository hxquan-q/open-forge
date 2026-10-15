---
id: RESEARCH-0019
type: research
status: done
priority: P1
owner: coordinator
source: TASK-0171; local source and isolated probes at c8dc167f0
created: 2026-10-02
updated: 2026-10-02
related_requirement: [REQ-0002, REQ-0004]
related_plan: [PLAN-0014]
related_tasks: [TASK-0172, TASK-0173, TASK-0174, TASK-0175, TASK-0176, TASK-0177, TASK-0178, TASK-0168, TASK-0169]
related_bugs: [BUG-0059, BUG-0060, BUG-0061, BUG-0062]
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 集成后的可靠性与验证成本优化调查

## 范围与结论

基于 `c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa`，优先检查刚集成的持久化、SSH、CLI 与验证链路；不是全仓性能审计、视觉评审或真实模型评测。本轮只调查并规划，不修改产品/测试/CI 实现。

建议先解决“成功结果是否可信”和验证盲区，再追求更多功能或更高测试并发。新建六个后续 Task，细化两个已有 Task；规划本身由 [TASK-0172](../tasks/TASK-0172-post-integration-optimization-planning.md) 跟踪。

## 优先队列

| 顺位 | Task | 优先级 | 事实 / 可观察收益 |
|---|---|---|---|
| 0 | [TASK-0178](../tasks/TASK-0178-ssh-known-hosts-revocation.md) | P1（安全） | 合成 @revoked 条目被 matcher 与宿主校验函数当作可信，必须恢复撤销优先的拒绝边界。 |
| 1 | [TASK-0175](../tasks/TASK-0175-atomic-write-complete-failure-contract.md) | P1 | 故障注入已复现短写成功提交截断内容、主错误覆盖及 tmp 残留；保证成功写入完整、失败可恢复。 |
| 2 | [TASK-0169](../tasks/TASK-0169-ssh-connection-lifecycle.md)（续接） | P1 | deferred probe 已复现 invalidate 后旧响应把状态改回 connected；阻止旧配置/旧请求污染当前状态。 |
| 3 | [TASK-0173](../tasks/TASK-0173-cli-rpc-timeout-diagnostics.md) | P1 | 单 worker 仍曾两例 RPC 超时，最终通过不证明根因消失；建立能定位阶段的安全诊断与可重复证据。 |
| 4 | [TASK-0168](../tasks/TASK-0168-ssh-windows-loopback-parity.md) → [TASK-0174](../tasks/TASK-0174-ssh-standard-test-entry.md) | P1 | 先解决共享夹具平台边界，再让 17 个 SSH 测试文件进入标准选择/执行路径；不是把失败用例全部跳掉。 |
| 5 | [TASK-0176](../tasks/TASK-0176-test-pipeline-cost-profiling.md) | P2 | 先解释约 25.7 分钟全包成本，再择优提速；不能以减少覆盖或提高超时换速度。 |
| 6 | [TASK-0177](../tasks/TASK-0177-ssh-platform-contract-documentation.md) | P2 | README 仍按全平台 OpenSSH 描述能力；更正 Windows ssh2 和 ProxyCommand 等真实限制。 |

## 一手证据与置信度

### 1. 原子写入：已实跑隔离 I/O 故障

源码：[atomic-write.ts](../../packages/toolkit/src/atomic-write.ts) 的 atomicWriteFile/performAtomicWrite；现有测试 [atomic-write.test.ts](../../packages/toolkit/test/atomic-write.test.ts) 主要补齐 rename 失败与队列恢复。五种注入及复现方法完整见 [BUG-0060](../bugs/BUG-0060-atomic-write-pre-rename-failures.md)。这是当前代码对异常边界的实际行为，不是生产事故统计。

### 2. SSH 生命周期：状态竞态已实跑，池与预算仍需分开验证

[manager](../../packages/ssh-transport/src/ssh-connection-manager.ts) 的 probe 没有代次检查；[ssh-host-service](../../apps/desktop/src/main/ssh/ssh-host-service.ts) 已接 invalidate。迟到状态实验见 [BUG-0061](../bugs/BUG-0061-stale-ssh-probe-status.md)。

进一步源码事实：[ssh2-runner](../../packages/ssh-transport/src/ssh2-runner.ts) 用 target 作为 session Map 键；manager 用 hostId。invalidate 只清 manager Map，runner 仅有整体 dispose；Ssh2Session.dispose 未持有在途握手取消代次。共享 readyPromise 取首个调用方预算，且数值被传给各认证尝试/跳板；调用方取消只结束其等待。这些需要独立失败基线和生命周期设计，**不从源码风险直接推导实际串号、泄密或无限连接**。本轮不重新定义共享握手预算；TASK-0169 先保持局部取消和认证合同，收口失效代次。

### 3. SSH 默认验证确实没有执行其自身测试

[package.json](../../packages/ssh-transport/package.json) 只有 clean/build，无 test；src 下当前有 17 个 *.test.ts。只读执行：

```js
createChangedTestPlan(["packages/ssh-transport/src/ssh2-runner.ts"])
// touched: ["ssh-transport"]
// toTest: ["runtime-desktop", "desktop"]
```

`bun run test:impact --dry-run -- packages/ssh-transport/src/ssh2-runner.ts` 输出 `ssh-transport has no direct test entry point`。这是测试选择结果，不是本轮运行过 SSH 全包。

[quality.yml](../../.github/workflows/quality.yml) 已有 ubuntu/macos/windows 三平台，并调用 test:changed；不能再新建重复矩阵来掩盖注册缺口。[testing.ts](../../packages/ssh-transport/src/testing.ts) 的回环脚本依赖 `/bin/sh`、setsid/perl 等假设，适配属于既有 TASK-0168，不另拆一份相同夹具任务。

### 4. CLI 偶发与测试成本：使用历史结果，不伪装本轮新跑

来源 [TASK-0171](../tasks/TASK-0171-task-batch-integration.md) 与该轮临时日志：首轮单 worker 的 installed-artifact-runtime 2 failed / 224 passed；随后单文件 13/13、完整 CLI 226 和最终整批通过。当前 [测试进程支撑](../../apps/cli-host/test/support/agent-rpc-test-process.ts) 的 request/waitFor 没有把等待命令与阶段附到超时错误。

最终 `test:pkg` 1539.5 秒：Desktop 692.5、CLI 486.7、Coding Agent 114.6；前两包占约 76.6%。这只是单机历史基线，不证明瓶颈已经定位、并发应该提高或某个百分比优化必能达到。本轮未重跑这些重型测试。

### 5. SSH 文档：当前说明与选择后端不一致

[README](../../packages/ssh-transport/README.md) 仍无条件描述 OpenSSH、ProxyCommand/FIDO/GSSAPI 及“无本地文件 I/O”；[createPlatformRunner](../../apps/desktop/src/main/ssh/ssh-runtime.ts) 明确 win32 用 ssh2，后者在 ProxyCommand 非空时拒绝连接，并读取本地 IdentityFile；[helper-deployment](../../packages/ssh-transport/src/helper-deployment.ts) 读取本地 helper 二进制。[known-hosts](../../packages/ssh-transport/src/known-hosts.ts) 本身仅做纯解析，文件 I/O 实际在 [宿主 verifier](../../apps/desktop/src/main/ssh/ssh-hostkey-verifier.ts)。ADR-0124 用于解释历史取舍，不改写其当年背景；文档 Task 只更新当前能力事实。

### 6. 主机密钥撤销：合成宿主链已实跑

核对 marker 所有者时发现 matchKnownHosts 忽略 entry.marker；用纯合成公钥占位及完全替换的文件 I/O 执行 matcher 和真实宿主 verifier，@revoked 返回 match，宿主返回 true 且 ask 未调用；@cert-authority 也被当作普通条目。没有读取真实 known_hosts、私钥或发网络请求。详见 [BUG-0062](../bugs/BUG-0062-revoked-host-key-accepted.md)，归属 [TASK-0178](../tasks/TASK-0178-ssh-known-hosts-revocation.md)。这是决策路径缺陷证据，不是实机攻击或真实入侵报告。另只读核对了 [OpenBSD sshd(8)](https://man.openbsd.org/sshd.8#SSH_KNOWN_HOSTS_FILE)，其撤销拒绝与 CA 角色定义支持上述预期。

## 去重、依赖与并发结论

- 不重建 TASK-0169/0168；前者补 BUG-0061，后者明确为 TASK-0174 的前置。配置事务、会话投影、MCP/团队初始化等继续使用 PLAN-0014 的已有 Task，不因本轮审查批量扩需求。
- TASK-0173 是根因诊断，TASK-0170 是已交付的调度补丁；保留历史 done，不把后者重复实现。
- 未来代码写集上，Toolkit、SSH 生命周期、CLI 支撑条件支持隔离并行；**本轮仅串行规划，没有多 Agent 授权**。同机时序/性能实验必须串行。SSH 文档、入口和夹具共享 README/配置，按 0168 → 0174 顺序并在集成时复核 0177。
- 0176 依赖 0173 的稳定性结论；若诊断不能复现/归因，不贸然调整默认资源策略。性能目标在固定基线测量后确定，不另造无证据 SLA。

## 被否决的方案

不靠调高超时、自动重试、整包 skip 或缩小 CI 范围解决失败；不立即增加并发；不为测试入口重复新增 CI 平台矩阵；不进行无范围的大文件重构；不以生成新功能代替修复确定性缺陷。

## 失效条件与下一步

以上锚点变化、引入新的连接身份/存储实现、Node/Bun/CI 资源变化后须重查。三类隔离故障/决策实验只证明具体执行路径，不估算真实发生率；池失效与握手预算风险未实机复现。用户要求进入实施时，优先进入 TASK-0178 的撤销拒绝回归，再从 TASK-0175 的失败回归和 TASK-0169 的迟到探测开始；真实 UI/主机/Provider 验收仍需单独授权。
