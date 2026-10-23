---
id: VERIFY-0022
type: verification
status: done
priority: P1
owner: coding-agent / runtime-node / desktop
source: 用户称已完成后要求继续检查；记忆实现批次复核（2026-10-23）
created: 2026-10-23
updated: 2026-10-23
related_requirement: [REQ-0027]
related_plan: [PLAN-0021]
related_tasks: [TASK-0371, TASK-0372, TASK-0375, TASK-0376, TASK-0379, TASK-0380, TASK-0382, TASK-0388]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 记忆实现交付后的隔离与正常入口复核

## 被验证的合同

比较`2f9d42762e2638601c5907bb1edfd88b36e0e68c`至候选`e11ac2e22`，核查[PLAN-0021](../plans/PLAN-0021-agent-persistent-memory.md)的项目隔离、普通Desktop启用、automatic捕获/消费及混合召回合同。

实际新提交集中于记忆；插件[PLAN-0022](../plans/PLAN-0022-pi-ecosystem-and-plugin-evolution.md)仍为draft方案，未发现对应实现批次。已向用户异步确认“已完成”范围，本记录只审查实际存在的记忆实现，不作为插件验收。

**复核未通过。** 存储与多个领域模块已有实现，但不能据此确认普通入口的M2自动混合版就绪。记录status=done仅表示本次审查完成，被审查功能并未通过。

## Given / When / Then

| Given | When | 预期 | 实际 |
|---|---|---|---|
| 临时库A scope写入事实，关闭后仅授权B | B读取project并更正A的memoryId | 不可见；更正拒绝 | 真实worker返回A内容，更正返回saved |
| 管理页保存记忆策略 | 普通新建/恢复会话 | 宿主读取策略并绑定Feature | 源码仅透传config.memoryPolicy；未读取保存值 |
| automatic policy显式传入 | 正常Session提交事件 | 捕获→入队→消费→抽取→提交 | 现有工厂仅装配显式工具和context provider |
| 新混合检索模块已存在 | 普通检索和模型请求 | 查询相关召回、RRF及预算 | 正常工具走Lexical，context读project近期列表 |
| 既有隔离/连续流程测试 | 重跑定向测试 | 能检出跨项目泄露 | 24例通过；跨项目检查存在恒真表达式 |

## 环境与输入

- 候选`main@e11ac2e22`，Windows，Node v26.3.1、Bun 1.4.2、Vitest 4.1.11。
- 仅合成文字和os.tmpdir新建数据库，调用生产memoryWorkerSource与已安装better-sqlite3；结束后关闭worker并删除本次临时目录。
- 无用户真实历史/记忆/凭据、Desktop实例或Provider访问。未修改生产和测试代码。

## 结果与源码锚点

### R1 [P1] 完整身份未落库，跨项目读写已复现

[schema](../../packages/runtime-node/src/memory/worker/worker-source.ts:83)只保存scope_name/visibility，未存principalId、projectId、workspaceViewId；[read](../../packages/runtime-node/src/memory/worker/worker-source.ts:308)仅按scope_name过滤，[LexicalMemoryIndex](../../packages/runtime-node/src/memory/retrieval/lexical-index.ts:110)也仅按scope.name过滤。请求scope被允许，不等于数据行归属于它。

实际Desktop[所有项目共用profile-default/memory.sqlite](../../apps/desktop/src/main/agent-runtime/composition.ts:401)，不能依赖独立DB隔离。两次临时库探测均确认跨项目读取和更正；第二次特意关闭A连接，重新open且allowedScopes仅包含B，输出：

```json
{
  "syntheticOnly": true,
  "onlyProjectBAuthorized": true,
  "projectBReadProjectA": ["SYNTHETIC_PROJECT_A_ONLY"],
  "crossProjectCorrectionAccepted": "saved"
}
```

要求：完整scope身份落库，并在候选limit前约束SQL/FTS/向量及后续读写。旧行缺失身份时必须显式迁移或隔离，不能猜项目或自动升级为全局。

### R2 [P1] memoryId操作没有核验目标归属

[correct](../../packages/runtime-node/src/memory/worker/worker-source.ts:246)只按ID查修订，再把scope写成请求scope；[listRevisions](../../packages/runtime-node/src/memory/worker/worker-source.ts:343)、来源和forget同样缺少目标完整scope核验。

[MemoryControlService.correct](../../apps/desktop/src/main/memory/memory-control-service.ts:151)从allowedScopes第一个user开始遍历，项目ID也能被user历史查询找到，随后以user写入更正，项目记忆因此可能成为全局记忆。修复R1的schema后仍必须单独修复按ID授权。事务内绑定真实scope、保持归属，迁移scope另立显式操作。

### R3 [P1] 同库lease继承首个会话授权

[acquireMemoryStoreLease](../../packages/runtime-node/src/memory/worker/memory-worker.ts:209)仅按DB路径复用store，不核对新lease的allowedScopes。A活跃时B acquire同库，得到A的授权集合，写B scope会被拒绝。本项为源码确认，尚未单独跑lease复现。

共享数据库资源与调用方授权应分离，不可简单合并所有scope后授予所有调用方；补不同owner、并发首次open和关闭重开的回归。

### R4 [P1] 页面保存的策略没有进入普通会话

[setPolicy](../../apps/desktop/src/main/memory/memory-control-service.ts:197)保存设置；[resolveDesktopSessionConfig](../../apps/desktop/src/main/conversations/resolve-session-config.ts:267)仅转发显式config.memoryPolicy；[正常创建](../../apps/desktop/src/main/conversations/desktop-conversation-service.ts:223)及恢复未读取记忆设置，[工厂](../../apps/desktop/src/main/agent-runtime/composition.ts:396)遇undefined退出。

因此设置页启用后，正常新建/恢复仍无Feature。需宿主读取策略、身份/预算并绑定，覆盖设置→新建→重启恢复的连续入口测试。

### R5 [P1] 自动捕获与混合检索尚未进入生产装配

[工厂](../../apps/desktop/src/main/agent-runtime/composition.ts:424)仅创建store/index/erasure、显式工具和context provider；未注册capture observer、消费队列/恢复补偿或将抽取建议提交事实层。TASK-0380交付记录亦将调度集成留作后续。

[工具search](../../apps/desktop/src/main/agent-runtime/composition.ts:441)直接走Lexical；[context](../../apps/desktop/src/main/agent-runtime/composition.ts:457)直接读当前projectScope列表，没有HybridMemoryRetriever、向量通道或新预算分配。user全局记忆也没有合并进入项目证据块。

真实Provider未获授权可保留模型质量未验证；正常Session接线可用确定性Provider边界替身验证，不应因费用门禁跳过。

### R6 [P1] 恒真隔离断言与非目标匹配计分

[memory-user-flow.test.ts:147](../../packages/coding-agent/test/memory/memory-user-flow.test.ts:147)的predicate含`|| true`，永远通过。附近注释把跨project隔离推迟，且测试直接操作store/index，没有经过Desktop策略和Session入口。

[评测runner](../../scripts/evals/memory/run-deterministic.ts:181)多处只按entries.length > 0计命中，没有核对queries[].expectedMemoryIndex，返回错误记忆也能得分；更正场景还需核对当前revision/content。应恢复有意义的否定断言和目标匹配再扩大评测。

## 实际命令与 CI 记录

```text
# workdir=packages/runtime-node，仓库Node runner
bun ../../scripts/quality/run-vitest.mjs --run --config vitest.config.ts test/memory/revision-store.test.ts test/memory/lexical-retrieval.test.ts test/memory/worker-lifecycle.test.ts
# 3 files / 21 tests passed

# workdir=packages/coding-agent，仓库Node runner
bun ../../scripts/quality/run-vitest.mjs --run --config vitest.config.ts test/memory/memory-user-flow.test.ts
# 1 file / 3 tests passed

# 仓库根stdin模块，实际生产worker与临时DB，见下述请求
node --experimental-strip-types --input-type=module
# 上述JSON，退出0表示探测完成，不表示隔离通过
```

复现核心请求如下。call为按id收发的实际Worker RPC；open使用同一临时DB及runtime-node包createRequire.resolve得到的已安装驱动，生产源来自memoryWorkerSource()。

```js
const a = { name: "project", principalId: "review-user", projectId: "project-a" };
const b = { name: "project", principalId: "review-user", projectId: "project-b" };
await open([a]);
const saved = await call({ type: "write", scope: a,
  command: { action: "remember", content: "SYNTHETIC_PROJECT_A_ONLY", kind: "fact", scopeName: "project" } });
await call({ type: "close" });
await open([b]);
const leaked = await call({ type: "read", scope: b, selector: { asOf: "2030-01-01T00:00:00Z" } });
const changed = await call({ type: "write", scope: b,
  command: { action: "correct", memoryId: saved.memoryId, expectedRevision: 1, content: "SYNTHETIC_CHANGED_FROM_B" } });
```

本次无远端CI。两名后台只读审查者分别核对存储授权和宿主接线，未跑测试；上述24例及临时库探测由主会话执行。

## 未运行的验证与原因

本轮为审查：未运行真实Desktop/UI/Provider、真实embedding、打包/跨平台、完整check或全量测试。未将旧记忆工具结果清除、全部派生向量/捕获载荷擦除记为已验证；这些仍需专项检查。无生产或用户数据迁移。

## 修复闭环（2026-10-23，TASK-0390）

- R1/R2/R3（BUG-0147，已关闭）：完整身份 schema v2 落库；按 ID 归属核验与 correct 保持归属；lease 授权视图分离；词法/向量授权过滤前置于候选 limit。证据：runtime-node test/memory 63/63（含 postreview-isolation 五例：复核复现路径 A 只授权 B 不可读改删、correct 保持归属、40 噪声行下 limit 前授权、旧行空身份隔离、向量跨项目隔离）。
- R4（BUG-0148，已关闭）：宿主策略入口进入普通新建/恢复（单一 resolve 路径）；off/explicit/automatic/切换/显式优先/损坏文件 5 例。
- R5（BUG-0149，已关闭）：捕获→队列→抽取→提交→启动补偿与混合检索/合并注入经共享生产装配接线；session-entry-flow 3 例经正常 Session 装配验证下一模型请求（user+project 合并注入、遗忘不复活、无 Provider 明确失败且主 Turn 语义不变）。
- R6（BUG-0150，已关闭）：恒真断言删除并改为可失败否定；评测按目标 memoryId+当前内容计分。
- 门禁：三包记忆套件 124 例、根 tsgo、完整 bun run check 全绿（本轮实测）。
- 仍未验证（不冒充）：真实 Desktop UI 实机流程、真实 Provider/embedding 模型质量、打包与跨平台。

## 剩余风险与建议顺序

1. 先修R1/R2/R3：完整身份、按ID授权和lease隔离，明确旧数据迁移，补失败回归。
2. 修R6恒真断言及计分，纠正M2验收结论。
3. 修R4正常策略和user/project注入，再补R5自动消费者及混合检索连续流程。
4. 软件合同通过后再做获授权的真实模型/平台验收，暂不扩大automatic默认启用或进入双时态/经验/图实验。

本轮只新增验证记录和Plan回链，不更改Task状态，不提交/推送，不自动实施修复。
