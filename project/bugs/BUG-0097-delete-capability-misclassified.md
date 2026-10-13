---
id: BUG-0097
type: bug
status: verifying
priority: P3
owner: packages/runtime-core
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（project purge 删除会话报 does not support delete）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# `assertCapability` 把「会话不归本运行时管/被拒绝」统一误报为「不支持 delete」，诊断语义失真

## 用户流程

- Given：项目硬删除 purge 逐个删除其下会话文件。
- When：某会话文件未被任何 catalog 路由认领（外来格式、他实例专属、已被删的残留路径），或所属路由声明 `access.delete: false`。
- Then：期望错误如实表述「不被本运行时认领」或「宿主策略拒绝」并可区分瞬态；实际一律抛 `INVALID_REQUEST "Session does not support delete"` + `retryable:false`——会话明明支持删除，只是这一次访问被拒。

## 实际行为

`runtime-host-catalog-facade.ts:86-91` `assertCapability`：`accessResolver.resolve(path)` 返回 `undefined`（无路由认领）或 `access.delete === false`（路由声明拒绝）两种不同语义压成同一错误文本与同一 `retryable:false`。日志实证（2026-10-09 17:52，项目 `practice-bill` purge）：

```
[session] failed to delete session while purging project
  code: 'INVALID_REQUEST'
  message: 'Session does not support delete: ...\ZTJhNTQ0....conversation.jsonl'
  retryable: false
```

该文件属 workspace 会话目录（`--D--Coding-WorkSpace-practice-bill--`）——真实的拒绝原因可能是外来格式未被路由、或另一实例仍在持有（该机 0.1.1/0.1.3 双安装共享 `~/.openforge`）——错误文本对此零区分；`retryable:false` 还把瞬态占用误标为永久失败。purge 逐条容错的设计本身正确（单条失败不阻断），缺陷在错误语义误导诊断与后续重试决策。

## 期望行为

区分两类拒绝：路径不被任何 catalog 认领 → 「会话不属于本运行时/未识别」类语义；路由认领但声明拒绝 → 保留能力拒绝语义但如实命名；`retryable` 是否仍恒 false 需按路由拒绝的真实语义复核——瞬态占用类拒绝不应标永久。

## 环境与失败证据

- `temp/log/main/2026-10-09.log:4573`：`failed to delete session while purging project ... INVALID_REQUEST Session does not support delete retryable:false`，调用栈 `FileConversationRuntimeSessionCatalog.deleteSessionArtifacts → RuntimeHostCatalogFacade.deleteSession`。
- 同机双安装并行使「他实例持有」成为高概率诱因；`ownsSession` 路由未认领是另一可能。

## 最小复现

对一个 `ownsSession` 全部返回 false 的会话路径调 `RuntimeHost.deleteSession`——抛出 `Session does not support delete`，文本与「路由认领但 delete:false」情形完全相同。

## 影响

purge/诊断日志把「不归我管」说成「不支持」，排查者无法判断是格式外来、策略拒绝还是瞬态占用；`retryable:false` 让可能成功的重试被上层放弃。

## 根因证据

- [`runtime-host-catalog-facade.ts`](../../packages/runtime-core/src/runtime-host/runtime-host-catalog-facade.ts) 86-91 行：`access?.[capability]` 的 falsy 合并 `undefined`（未认领）与 `false`（显式拒绝）。
- [`session-services.ts`](../../packages/runtime-core/src/runtime-host/session-services.ts) 63-76 行：`CatalogRoutedRuntimeSessionAccessResolver` 对未认领路径返回 `undefined`，信息在 assert 处丢失。
- 置信度：中（误分类本身代码级确定；日志场景的真实拒绝原因——未认领 vs 路由拒绝——需按 desktop 组合路由确认）。

## 回归测试

未认领路径与 delete:false 路径应产生可区分的错误（code 或 message），旧实现下两者相同（红基线）。

## 修复与验证

- 修复：见 [TASK-0232](../tasks/TASK-0232-delete-capability-error-split.md)。`assertCapability` 分裂两类拒绝——`resolve()` 返回 `undefined`（无路由认领）报 `Session is not recognized by this runtime`，显式 `delete:false`/`rename:false` 保留 `Session does not support <capability>`；两者 `code`/`retryable:false`/`source` 不变。desktop 三条路由均 `delete:true`，故日志报错实锤为未认领路径。
- 测试：`runtime-host-catalog-facade.test.ts` 新增 4 例——未认领 delete/rename 报 not recognized、显式拒绝保留 does not support、授权路径仍走 catalog 删除。红基线（旧实现两类同文本）→ 修复后 4/4 绿。
- 全量：impact（facade）20 套件 117 例过。
- 检查：`check:lint` 绿（4798 文件）。
- 验证边界：`retryable` 保持 false——未认领与拒绝在本组合下都不会因重试而变可达；日志场景的瞬态占用（他实例持锁）属锁层语义，不在本错误文本承载。
