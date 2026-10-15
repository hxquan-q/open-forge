---
id: BUG-0060
type: bug
status: verifying
priority: P1
owner: toolkit
source: TASK-0172 isolated I/O fault injection
related_requirement: [REQ-0002]
related_plan: [PLAN-0014]
related_tasks: [TASK-0175, TASK-0150, TASK-0172]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 原子写入提交短内容且重命名前失败合同不完整

## 用户流程与影响

Given：调用方保存配置或产物，目标文件已有完整旧内容；When：底层写入发生短写、同步失败或关闭失败；Then：成功应意味着完整新内容，失败应保留旧目标并报告首个错误，只清理本次拥有的临时文件。

潜在影响是成功返回但内容截断、误导错误归因和异常后的临时文件残留。**本次通过隔离故障注入确认实现行为，不代表已发生真实用户数据损坏。**

## 环境与失败证据

2026-10-02，Windows，Node v26.3.1 / Bun 1.4.2，源码基线 `c8dc167f0590c608d0f5e076e4f0d0991d7c2dfa`，应用 0.1.3。用 `node --input-type=module -`、已安装 TypeScript 的 `transpileModule` 和 `node:vm` 执行原始模块；只替换指定 I/O 边界，在自有 `open-forge-task0172-atomic-*` 临时目录中执行，其余文件 I/O 为真实操作。未修改生产源码。

| 注入 | 实际错误 | 最终目标（原先 original） | 剩余 tmp |
|---|---|---|---|
| writeSync 实际写 1 字节且返回 1 | 无错误 | `n`（期望完整 `new-value`） | 0 |
| 同步 fsync 抛错 | fsync 错误 | original | 1 |
| 同步 fsync 与 close 都抛错 | **close 错误** | original | 1 |
| 异步 file.sync 抛错 | fsync 错误 | original | 1 |
| 异步 sync 与 close 都抛错 | **close 错误** | original | 1 |

探针结束后只删除经过绝对路径核验的自有目录下文件，再移除空目录；没有递归清扫或接触用户状态。

## 最小复现

1. 读取并 CommonJS 转译 `packages/toolkit/src/atomic-write.ts`；在新 VM 中让 `module.exports` 与 `exports` 指向同一对象，未替换的内建依赖走真实 `createRequire`。
2. 临时目录写入 `config.txt = original`。将注入的 `node:fs.writeSync` 改为实际写 `Buffer.from(data).subarray(0, 1)` 并返回其字节数；其他函数保持真实。
3. 调用真实导出的 `atomicWriteFile(target, "new-value")`：实际成功返回且读取目标为 `n`。
4. 另建临时目录，把 fsyncSync 改为抛 `primary`，closeSync 先真实关闭再抛 `secondary`。实际捕获 `secondary`，旧目标保留但 tmp 未清理。关闭不抛时捕获 primary，仍留 tmp。
5. 异步场景只包装真实 FileHandle：writeFile 委托原句柄、sync 抛 primary、close 先真实关闭再可选抛 secondary，观察同样的错误覆盖和残留。

## 根因证据

`atomicWriteFile` 忽略 `writeSync` 返回值，随后 fsync/rename；同步与异步写入使用 finally 关闭，关闭错误可以覆盖 try 内错误。临时清理只存在于 renameWithRetry 系列错误路径，写入/同步/关闭失败尚未进入它。源码级因果置信度高；真实设备上这些错误的发生频率未测量。

## 回归测试与修复边界

由 [TASK-0175](../tasks/TASK-0175-atomic-write-complete-failure-contract.md) 在 `packages/toolkit/test/atomic-write.test.ts` 增加旧实现会失败的字节内容、零进度、主错误身份、残留与后续队列恢复断言，不仅断言 mock 调用。保留 TASK-0150 的队列/唯一临时名/rename 预算；不引入跨进程锁或崩溃后全盘清扫。

## 修复与验证

2026-10-02 修复（TASK-0175）：同步路径改为 `writeAllSync` 按实际写入字节数循环补齐（零进度抛 `EIO`，不无限循环、不提交部分内容）；同步/异步统一「记录首个失败 → finally 关闭（关闭失败仅在无更早失败时成为首个错误）→ 尽力删除本次 tmp → 上抛首个错误」的失败合同，成功必须写满 + fsync + close 全部通过才进入 rename。旧实现红证据：新增 9 例断言失败（同步/异步短写、连续零进度、fsync 单独失败、fsync+close 双失败的首个错误身份、仅 close 失败不提交、空内容合法成功、失败后同路径恢复且不误删他人 tmp）；修复后 `packages/toolkit` 全包 35/35 通过，既有队列/唯一临时名/rename 预算回归保持。真实磁盘断电持久性仍未验证（合同本就不宣称）；Windows 外平台的 rename 语义由既有测试覆盖。
