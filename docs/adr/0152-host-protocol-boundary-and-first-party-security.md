<!-- Copyright The Open Forge contributors. -->
# ADR-0152：Host 合同边界与安全一方化

## 状态

已接受（2026-11-06，PLAN-0029 Phase 2，TASK-0453）。

## 背景

Desktop 的 Agent 运行时直接加载在 Electron 主进程（`main/agent-runtime/composition.ts`），renderer 经约 1250 个
零散 `ipcMain.handle` channel 访问主进程能力。channel 名、参数校验和返回形状分散在 main 与 preload 两侧，
无统一合同，也无法替换 transport。PLAN-0029 计划把 Host 移出主进程（Phase 3）并支持 headless / 远端运行
（Phase 4），前提是先有一个与 transport 无关的请求合同。

候选：扩展 `@vetta/action-rpc`；新建合同包；直接改用 tRPC 等外部框架。

## 决策

1. **新建 `packages/host-protocol`（`@vetta/host-protocol`）**。`action-rpc` 是本机 HTTP 的 Action/Debug 协议
   （依赖 hono，手写解析），服务外部调用者执行 Action，职责不同；混入会把 hono 带进 preload。外部 RPC 框架
   引入新依赖且不使用仓库已统一的 TypeBox Schema，不采用。
2. **合同形状**：每个方法由 `defineHostMethod({ name, params, result, requires })` 定义，TypeBox Schema 是运行时
   校验事实源，类型由 Schema 推导。`HostDispatcher` 校验信封与参数 → 检查 owner 插槽 → 执行 → 校验结果，
   错误以值形式返回 `{ ok: false, error: { code, message } }`，不依赖 transport 能否保留 Error 子类。
3. **稳定错误码**：`INVALID_REQUEST`、`UNKNOWN_METHOD`、`INVALID_PARAMS`、`INVALID_RESULT`、
   `CAPABILITY_UNAVAILABLE`、`INTERNAL`。发布后不改语义、不复用，只能追加。
4. **transport 无关**：`HostTransport = (request) => Promise<HostResponse>`。进程内直接调用、Electron IPC 单一
   channel `vetta:host:request`、MessagePort、stdio、WebSocket 均实现同一签名。客户端出口 `@vetta/host-protocol/client`
   运行时不加载 typebox，供 preload 打包。
5. **owner 插槽**：宿主专属能力（如 BrowserOwner、SandboxOwner、FileIndexOwner）以接口注入 `HostOwnerRegistry`；
   方法声明 `requires`，缺失时返回 `CAPABILITY_UNAVAILABLE`，不隐式回退到本机实现。Rust/Go sidecar 只能作为
   owner 实现接入，不直接暴露为 Host 方法。
6. **事件模型**：流式状态采用权威快照 + 递增序号增量；序号不连续时客户端标记失步，等待下一个快照，
   不猜测补齐（`reduceHostStream`）。
7. **安全一方化**：权限判定、审批、沙箱策略与 Provider 凭证只存在于 Host 内。插件、外部 Agent 子进程与任何
   sidecar 只拿到完成单次操作所需的最小参数，不持有凭证或审批状态。凭证类方法（如 server token）迁入
   Host 合同前需单独评审。
8. **与 ADR-0084 的关系**：`RuntimeHost` 仍是 Agent/Conversation 的唯一生命周期根。本合同只定义进程边界上的
   请求面，不持有 Runtime 状态；Host 出进程后，承载 `RuntimeHost` 的进程通过本合同对外。

## 后果

- 迁移按领域逐个进行：定合同 → Host 实现 → 切 preload → 删除旧 handler；进度以
  `scripts/quality/count-ipc-channels.mjs` 的旧 channel 数衡量。首个试点为设置领域 6 个 channel。
- renderer 的 `window.vetta` 签名保持不变；参数非法时错误消息改为合同校验文本，`code` 可供程序分支。
- 新旧 IPC 会共存一段时间；同一能力不得同时存在两条入口。

## 回滚与演进信号

- 回滚：领域粒度可回滚，恢复该领域旧 handler 并把 preload 切回 `ipc.invoke`。
- 若出现需要双向长连接或背压的领域（会话流），在本合同上扩展订阅原语，不另建平行协议。
- 若合同校验开销在热路径上可测地影响延迟，再评估按方法关闭结果校验。
