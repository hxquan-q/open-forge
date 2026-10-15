---
id: BUG-0098
type: bug
status: verifying
priority: P3
owner: apps/desktop
requirement:
plan:
source: 用户提供的他人实机日志巡检第三轮（invalid-host warn + 全机 ERR_CONNECTION_* 泛滥的可能诱因）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-10-12
updated: 2026-10-12
---
<!-- Copyright The Open Forge contributors. -->

# 无效代理配置无有效性门即可保存，运行时静默降级为逐条请求失败

## 用户流程

- Given：用户在设置-代理里输入非法 host（如含空格、协议前缀或端口串）。
- When：防抖提交到点——`updateText` → `commitDebounced` 500ms 后 `config.set({proxy})` 无条件落盘，有效性只驱动页面内的 `invalidConfig` 提示，不拦截保存。
- Then：离开设置页后无任何信号；运行时 `applyProxy` 判 `invalid` 只落一条 warn，随后把代理 provider 的请求统一打到必然失败的 fetch——用户看到的是满屏 `ERR_CONNECTION_*`，不知道是自己配置无效。

## 实际行为

- 保存侧：`useProxySettingsModel.ts` `updateText`/`commitDebounced`（153-167 行）对文本字段不做有效性门，`isProxyDraftInvalid` 只驱动 `invalidConfig` 文案显示（219、243 行）——提示仅在打开设置页时可见。
- 运行时侧：`proxy-runtime.ts` 104-115 行 `mode:"invalid"` → 建一个注定失败的 proxy fetch 注入 provider 路由 + `log.warn` 一行，全局 dispatcher 不动（注释明示为了不连累更新检查/图片加载）——设计取舍合理，但「模型请求全部失败」与「配置无效」之间没有任何用户可达的因果提示。
- 日志实证（2026-10-08）：`[proxy] application proxy configuration is invalid (invalid-host); proxied requests will fail`；同一日志窗口内 `ERR_CONNECTION_RESET`/`ERR_NAME_NOT_RESOLVED` 大量出现（github/models.dev 等），无法排除部分由该配置导致。

## 期望行为

至少其一：无效输入不落盘（提交前有效性门，或落盘但 enabled 状态明确回写）；或运行态无效配置有持久可见信号（设置入口标记/一次性通知），而非只在页面内提示。

## 环境与失败证据

- `temp/log/main/2026-10-08.log:208`：invalid-host warn。
- 同机大量连接错误与其时间重叠（诱因存疑，如实标注为可能因果）。

## 最小复现

设置页输入 host=`127.0.0.1:7890 extra`（或任意含非法字符），等待防抖落盘，离开设置页；provider 请求随后全部失败，主日志只有一条 warn。

## 影响

配置错误转化为不可归因的「到处连不上」；排查成本高且极易误判为网络/供应商问题。

## 根因证据

- [`useProxySettingsModel.ts`](../../apps/desktop/src/renderer/domains/settings/components/useProxySettingsModel.ts)：`commitDebounced` 无有效性门；`isProxyDraftInvalid` 仅驱动提示。
- [`proxy-runtime.ts`](../../apps/desktop/src/main/proxy/proxy-runtime.ts) 104-115：invalid 路径只 warn，注释把提示责任指给设置页——但设置页提示不覆盖「已保存的无效配置在运行中」。
- 置信度：高（保存门缺失与提示面边界均代码级确定；对全机网络错误的归因权重为推断）。

## 回归测试

invalid draft 的文本提交不应静默落盘（或落盘后 enabled 状态不被运行时按有效代理消费）；旧实现下 500ms 防抖后 config.set 被调用（红基线）。

## 修复与验证

- 修复：见 [TASK-0233](../tasks/TASK-0233-proxy-invalid-commit-gate.md)。`updateText` 防抖提交前过有效性门——草稿照常更新（输入跟手、`invalidConfig` 提示复用），但 `isProxyDraftInvalid(next)` 为真时不安排 `config.set`。同时把镜像判据整体替换为直接调共享 `resolveProxyConfig`——旧手写镜像漏掉「host 含冒号且非 IPv6」（用户把 host:port 填进一格）而主进程判 invalid-host，正是日志实锤的形态。
- 测试：`useProxySettingsModel.test.tsx` 新增 4 例——enabled 下 `host:port` 一格值不落盘且 draft/invalid 提示保留、合法 host 正常落盘、越界端口不落盘、disabled 下非法值照常落盘（判据只在 enabled 生效）。
- 全量：impact（desktop 相关套件）264 例过；4 套件 `window-manager.ts:25` `process.resourcesPath` 既有 import 失败（与本改动无关）。
- 检查：desktop `tsc --noEmit` 绿；`check:lint` 绿。
- 验证边界：已保存的存量非法配置不被本修复回滚（运行期 invalid 降级 warn 仍在，界面提示面缺口如实记账）；`setEnabled`/`setProtocol` 等非文本路径值域受限不门控。
