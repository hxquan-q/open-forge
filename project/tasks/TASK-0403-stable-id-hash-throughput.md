---
id: TASK-0403
type: task
status: verifying
priority: P1
owner: packages/agent-team
requirement: REQ-0002
plan: PLAN-0024
source: TASK-0395 probe / stableTeamEventId 大输入成本
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0395, TASK-0402]
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0403-stable-id-hash-throughput
worktree: ../open-forge-wt/task-0403-stable-id-hash-throughput
base_commit: 1584b54dfd6db56ee49d070d652b886705355e4d
read_paths: [packages/agent-team/, apps/desktop/src/main/agent-teams/]
write_paths: [packages/agent-team/src/context-projector.ts, packages/agent-team/test/context-projector.test.ts, packages/agent-team/scripts/stable-id.bench.mjs]
exclusive_paths: [packages/agent-team/src/context-projector.ts]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-24
updated: 2026-10-24
---
<!-- Copyright The Open Forge contributors. -->

# stableTeamEventId 大输入哈希吞吐

## 目标

`stableTeamEventId` 是团队所有持久身份的单一事实源（checkpoint id、generation id、指纹、pinned-context id、消息 id）。它对 canonical 串做两遍 BigInt 逐字节 FNV-64。定位（TASK-0395 探针）：400 条记录的 checkpoint 构建中 19ms 里 17.9ms 是哈希本身，`team-member-context.ts` 的 pinned id 还要再哈希全部记录一次。目标：把哈希吞吐提上去，**不改变任何已持久化的 id/fingerprint 值**——同一输入必须产出逐字节相同的输出，否则旧会话的身份与缓存对不上。

## 范围

条件支持并行（独立 Worktree、`packages/agent-team/src/context-projector.ts` 单写者）。

做：优化 `fnv64` 的实现（候选：Number 高低位乘法替代 BigInt、按 Uint32 块处理、或单遍同时计算两哈希），保持 FNV-1a 64 语义与输出编码完全一致；用“全仓存量 id 值不变”的等价测试锁定（跨实现对拍同一批输入）。

不做：不改哈希算法/输出格式；不改任何调用方；不引入依赖；不缓存“文本→id”（那是调用方语义问题，本片只做原语吞吐）。

## Given / When / Then

- Given 任意输入（含 ASCII、中文、emoji、空串、超长串），When 旧实现对拍新实现，Then 输出逐字符相同。
- Given 400 条记录的 checkpoint 构建，When 复测，Then 耗时显著下降且 spread 在噪声内。

## 必须保持

所有已持久化 id/fingerprint 值不变（这是数据兼容 Invariant）；`stableTeamEventId` 的导出签名不变。

## 测试与验证

新增对拍测试（旧 BigInt 参考实现保留为测试内 oracle，与生产实现对拍，覆盖边界字符与长度）；定向 `test:pkg agent-team`、`test:impact`、完整 `bun run check`；基准 `packages/agent-team/scripts/stable-id.bench.mjs` 报告 MB/s 与实际场景耗时，交错 A/B。

## 已知基线（探针，2026-10-24）

- `stableTeamEventId` 401 段×200B：7.96ms；BigInt 逐字节 80KB：3.6ms。
- 400 记录 checkpoint 构建 19.03ms（哈希 17.94ms）；pinned id 再 19.48ms。
- 未做 A/B；纯定位。

## 验收分层

工程验证：通过；技术审查：未执行独立审查（等价性由对拍+边界字面量锁定，实现小且纯函数）；集成 pending；内部行为保持型优化人工验收不适用；发布未授权。

## 交付记录

### 实际修改

`packages/agent-team/src/context-projector.ts`：

- `stableTeamEventId` 改为单次编码/单循环同时推进两个 FNV-1a 64 哈希（原本 BigInt 逐字节跑两遍）。
- 哈希内部用两个 32 位 limb 的 Number 乘法（所有中间积 <2^49，float64 精确），仅在输出时经一次 BigInt 合并——避免 `hi*2^32+lo` 超 2^53 丢精度。
- 原 BigInt 实现保留为 `fnv64Reference`，导出供测试对拍。
- 无调用方变更；输出格式与所有已持久化 id 值不变。

### 实测（本机，交错 A/B）

- `stable-id.bench.mjs` 3 轮：current 2.62–2.93ms vs reference 6.45–8.02ms（**约 2.6×**，401×200B 与 80KB 单串一致）。
- 400 记录 fingerprint：19.4ms → 6.9ms；checkpoint 构建 19.0ms → 7.5ms。
- 开发中发现并修正两处 limb 数学错误（prime 高位 0x10000→0x100；float64 合并丢精度），均被对拍当场抓住。

### 等价性证据

- 测试新增 3 组：固定边界输入（ASCII/中文/emoji/空/管道符）、120 轮 fuzz（多变长+混合字符集）、10k/100k 长串；全部与 `fnv64Reference` 对拍相等。
- `agent-team` 全包 12 文件 94 例、`test:impact` related 5 文件 36 例通过。
- 完整 `bun run check` 全绿。

### Worktree

CLI 从 main@1584b54df 创建；独立安装；目标 `worktree:check` 通过。

### 剩余风险

收益是纯 CPU（哈希吞吐），不改变任何持久化值；未测真实会话端到端收益（与消息频次相关）；`fnv64Reference` 保留为 oracle 增加约 20 行死代码面（有注释说明用途，knip 未报）。
