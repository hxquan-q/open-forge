---
id: PLAN-0029
type: plan
status: in_progress
priority: P1
requirement: REQ-0002
owner: apps/desktop/runtime-desktop/scripts-agents
created: 2026-11-06
updated: 2026-11-07
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 宿主拆分、研发控制器闭环与原生 Sidecar 分工

## 背景与目标

依据 [RESEARCH-0049](../research/RESEARCH-0049-desktop-host-and-controller-refactor-references.md)，以及用户提供的重构方案与核查意见（2026-11-06）。目标：

1. Agent Host 移出 Electron 主进程，跨进程接口改为类型化合同，壳可替换。
2. 研发控制器（`scripts/agents`）先证明一个真实任务可完成开发、评审和集成闭环。
3. 定死语言分工：Agent 内核保持 TS；Go 负责网络与远程守护；Rust 只做 Node 做不到或经基线证明需要的系统能力。两者都以 owner 接口后的 sidecar 接入。

控制器线与 [PLAN-0019](PLAN-0019-autonomous-development.md)（REQ-0019）衔接，本计划只列首批缺口，不重复其台账。首批 Task 已按用户指示实施并集成 `origin/dev`（2026-11-07 补记），后续阶段按本计划推进。

## 当前事实

- Agent 栈在 Electron 主进程内装配（`apps/desktop/src/main/agent-runtime/composition.ts`）；主进程约 18 万行，IPC 约 715 个 `ipcMain.handle` 加约 531 个包装注册；renderer 仅经 `window.vetta` 访问主进程。
- 依赖例外：`apps/desktop → @vetta/cli-host`，`runtime-desktop → coding-agent`（分层倒置）。
- 已有 Go：`apps/im-gateway`、`apps/ssh-helper`；`apps/remote-relay` 为 TS。
- 控制器：集成目标写死本地 `main`（`scripts/agents/integrate.mjs:17`、`prepare.mjs:45`、`release.mjs:88`）；`project/autonomy-policy.json` 为 `level: 0`、`capabilities: []`；adapter 与 publisher 均 `enabled: false`；评审独立性只比较厂商（`orchestrate.mjs:20-21`）；需求覆盖为 `presence-only`（`requirement-run.mjs:277,501`）；`store.mjs` 写锁只在单机成立。
- RESEARCH-0044：缺分进程资源基线，暂不能承诺 MB/CPU 收益。
- 远端 `dev` 领先 `main` 76 个提交；用户称 CI 已恢复，本计划未逐次核实。

## 候选方案与取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| 整体迁 Tauri 2 | 否决（保留 Phase 6 决策门） | 1250 个 IPC 重接；嵌入式浏览器自动化在系统 WebView 难复现；Node sidecar 抵消体积优势 |
| 后端整体换 Rust + Go | 否决 | 约 13 万行内核重写；瓶颈在等待模型/IO 而非 CPU；MCP、Provider SDK、TypeBox、pi 兼容都在 TS；上游同步中断；三套工具链 |
| Go + Viva 重写 UI | 否决 | Viva 仅 v0.3、无 WebView，需重写约 23 万行 renderer |
| 保留 Electron，拆 Host 进程，TS 内核 + Go/Rust 边缘 sidecar | 采用 | 分阶段可回退；复用 Electron 自带 Node；原生语言只出现在合同边界 |

语言分工：

| 层 | 语言 | 负责 | 不负责 |
|---|---|---|---|
| 壳 | TS（Electron） | 窗口、托盘、协议、更新、`BrowserOwner`/`CaptureOwner` | Agent 执行、权限判定 |
| Host 内核 | TS | Agent loop、工具、Provider、MCP、插件、pi 兼容、权限、审批、凭证、写门禁 | 系统底层能力 |
| 网络与远程 | Go | im-gateway、ssh-helper、远程 Host 部署/守护，条件满足后的 relay | Agent 逻辑 |
| 系统原生 | Rust | Windows 沙箱与进程隔离；经基线证明的文件索引、搜索、监听、会话检索 | Agent 逻辑、UI |

## 阶段

### Phase 0：收敛与基线

| 项 | 内容 | 验收 |
|---|---|---|
| 0.1 WIP 收敛 | 逐个裁决 draft/in_progress Plan（做、砍、缓），清理 verifying 积压 | in_progress Plan 数减半，verifying 不再增长 |
| 0.2 资源基线 | 可重复脚本：分进程启动耗时、空闲/多会话内存、主进程事件循环延迟、大仓扫描与搜索 p95 | Verification 记录落盘，后续阶段复测 |
| 0.3 小修 | `agent-rpc-command.ts:68` 改顶层 `import type`；3 个 desktop 测试改走公开入口；仓库地图补 `remote-relay` 和两条例外依赖 | `bun run check` 通过 |
| 0.4 分支职责 | 写清 `main`/`dev`/`origin/main` 职责 | 规则落盘，供 1.1 读取 |

状态（2026-11-07）：0.2 脚本已集成、真实基线测量待授权（TASK-0448 in_progress）；0.3 已完成（TASK-0449，verifying）；0.4 已完成（TASK-0450，verifying）。

### Phase 1：研发控制器可信闭环（与 Phase 2 并行）

1. 集成目标配置化，替换三处硬编码 `main`。
2. 远端最终候选提交 SHA、CI 运行、评审对象三者一致才允许集成。
3. 评审独立：独立上下文、未参与实现的身份、只读 worktree，绑定提交与树哈希。
4. 启用一个真实 adapter，低风险任务跑通“执行 → 评审 → 修复 → CI → 集成 dev”，证明不是 mock。
5. `requirement-run` 去掉 presence-only；工程完成、候选验证、人工验收、已发布分别记录。

暂缓：团队租约、并行调度、自动发现问题、真实发布，待第 4 项通过后开启。

状态（2026-11-07）：第 1–5 项均已实现并集成 `origin/dev`；第 4 项真实 adapter 端到端验收由 TASK-0452 完成（done）。暂缓项保持关闭。

### Phase 2：Host 合同化（进程内）

1. `host-protocol`：扩展 `action-rpc` 或新建包；TypeBox 合同按领域划分；事件采用增量加快照；写清能力缺失错误、Extension UI 投放位置和 owner 插槽接口（`SandboxOwner`、`FileIndexOwner`、`RemoteHostOwner` 等）；preload 类型由合同生成。
2. 进程内 Host：`composition.ts` 包成 Host + `HostClient`，transport 为直接调用，行为不变。
3. 安全一方化立 ADR：权限、审批、凭证只在 Host 内；插件、外部 agent、sidecar 只拿单次操作的最小参数。
4. 进度指标：剩余旧 IPC channel 数，每个切片须下降。

### Phase 3：Host 出进程与 IPC 迁移

1. transport 换 `utilityProcess` + MessagePort，renderer 不改，不额外打包 Node。
2. 按领域迁移（定合同 → Host 实现 → 切 renderer → 删旧 handler）：设置与模型列表 → 会话流 → plugins/abilities → agent-teams → browser-automation、截图、PDF（经 owner 注入，能力留在主进程）。
3. Host 崩溃时窗口保留，Host 可单独重启。

验收：主进程无 Agent 执行代码；主进程事件循环延迟低于基线；总内存不超过基线加一份 Node 堆。

### Phase 4：Headless Host 与 Go 远程

1. 同一 Host 跑在 `cli-host` 与 im-gateway 后面，消除 `desktop → cli-host` 和 `runtime-desktop → coding-agent`。
2. Go 远程守护：在 `ssh-helper` 上扩展为单二进制，负责 SSH/WSL 目标机上部署、拉起、监控 TS Host 与版本协商；对外开放默认 token 鉴权。
3. `remote-relay` 迁 Go：仅在需要独立部署、长连接并发上升时进行，迁前后跑同一份合同测试。
4. ACP 适配层：先核实 `ecosystem-adapter` 现有覆盖再立项。

### Phase 5：Rust 原生能力（逐项按数据开启）

| 候选 | 开启条件 | 验收 |
|---|---|---|
| Windows 沙箱（关联 TASK-0352） | Node 无法实现所需隔离 | 沙箱合同测试与逃逸用例通过，三平台降级行为有说明 |
| 文件索引、搜索、监听 | 0.2 基线中大仓扫描/搜索 p95 超阈值 | 同一合同测试通过，p95 明显下降，内存不劣化 |
| 会话检索 | profiling 证明检索是热点 | 同上，以现有存储为事实源，不双写 |

每项须带 TS 回退实现、签名 sidecar 二进制，三平台进入 CI；须等 Phase 1 证明发布链可信后开启。

### Phase 6：决策门与生态

- Tauri PoC：Tauri 壳 + 同一套 renderer + Host sidecar 与 Electron 实测对比；收益、浏览器自动化替代、Linux 可用三项都满足才迁。
- 插件：先信任分级与安装事务，再市场（PLAN-0023）。
- 控制器：开放团队租约、有界并行调度与灰度发布。

## 首批 Task

1. [TASK-0448](../tasks/TASK-0448-desktop-resource-baseline-script.md)：资源基线测量脚本与记录（0.2），in_progress（脚本已集成，真实基线测量待授权）。
2. [TASK-0449](../tasks/TASK-0449-desktop-boundary-small-fixes.md)：包边界小修与仓库地图补全（0.3），done。
3. [TASK-0450](../tasks/TASK-0450-controller-integration-target-config.md)：分支职责定稿与集成目标配置化（0.4 + 1.1），done。
4. [TASK-0451](../tasks/TASK-0451-controller-candidate-ci-review-binding.md)：候选提交与 CI 证据绑定（1.2），done；原 1.3/1.5 范围已拆出。
   - [TASK-0454](../tasks/TASK-0454-controller-review-isolation.md)：评审只读候选与独立上下文（1.3），done。
   - [TASK-0455](../tasks/TASK-0455-requirement-run-clause-evidence.md)：requirement-run 条款级证据（1.5），done。
5. [TASK-0452](../tasks/TASK-0452-controller-real-adapter-e2e.md)：真实 adapter 端到端验收（1.4），done（qwen-http 真实 adapter 端到端验收完成）。
6. [TASK-0453](../tasks/TASK-0453-host-protocol-in-process-host-pilot.md)：`host-protocol` 骨架、进程内 Host、owner 插槽，以“设置”领域试点（2.1 + 2.2），verifying（试点已集成 `origin/dev`，设置页 UI 走查待授权）。
7. [TASK-0458](../tasks/TASK-0458-models-preset-catalog-host-domain.md)：模型预设目录（免 key 子域）迁到 Host 合同（2.1 延续），done；凭证类通道与事件按 ADR-0152 单独评审后迁入。
8. [TASK-0459](../tasks/TASK-0459-models-config-host-domain.md)：模型配置域（get/set/copy-api-key）迁移并落地 ADR-0152 §7 凭证通道评审（读路径 `apiKey` 合同钉死掩码/外部引用），done。
9. [TASK-0461](../tasks/TASK-0461-models-probe-host-domain.md)：模型探测与余额通道（probe/fetch-provider-models/test-provider/get-balance/config-path）迁移，done。
10. [TASK-0462](../tasks/TASK-0462-mcp-noncredential-host-domain.md)：MCP 无凭证子域（config-path/has-auth/auth-status/list-server-tools）迁移，done；`mcp:get/set`（凭证面）与 OAuth 六通道按 ADR-0152 §7 留待评审。
11. [TASK-0463](../tasks/TASK-0463-host-messageport-transport.md)：Host MessagePort transport（Phase 3 第一步，换线不搬进程，done；预研见 [RESEARCH-0050](../research/RESEARCH-0050-host-process-transport.md)），done。

## 不做什么

- 用 Rust/Go 重写 Agent loop、Provider、MCP、插件系统。
- 没有基线数据就引入原生 sidecar。
- 权限、凭证、审批进入 sidecar 或 renderer；renderer 持有 shell、仓库写权限或签名密钥。
- 复制 AGPL、LGPL、cc-haha、NekoCodeDesktop 代码（只借思路）。
- 整仓追最新版 pi 或覆盖已定制 runtime。
- Phase 0 结束前开新 Requirement 或产品线。

## 验证与回滚

- 每个切片：定向测试 + `bun run test:impact`，代码任务完成跑 `bun run check`；跨包或公共合同变化跑 `test:changed`。
- Phase 2/3：合同测试覆盖增量/快照、取消、错误与 usage 语义；旧 IPC 与新合同共存期间可按领域切回。
- Phase 4/5：TS 与原生实现跑同一合同测试；原生 sidecar 可通过配置退回 TS。
- 每阶段结束复测 0.2 基线，并做一次上游同步冲突审计。

## 升级信号

- 基线显示拆进程后总内存或启动退化超过约定阈值。
- 会话流迁移无法保持取消、错误或 stop 语义。
- 上游同步冲突在单阶段内明显上升。
- Phase 1 第 4 项无法证明真实运行，或 CI 与候选提交不能绑定。
- 系统 WebView 出现可替代浏览器自动化的方案（重新评估 Phase 6）。

## 需要的 ADR

- Host 进程边界与 `host-protocol` 合同：已落地 [ADR-0152](../../docs/adr/0152-host-protocol-boundary-and-first-party-security.md)。
- 安全一方化：权限、审批、凭证归属：已落地 [ADR-0152](../../docs/adr/0152-host-protocol-boundary-and-first-party-security.md)。
- 语言分工与原生 sidecar 准入条件（Phase 4 前）。
- 分支职责与集成目标（Phase 0.4，可落协作规则代替 ADR）。
12. [TASK-0464](../tasks/TASK-0464-host-utility-process.md)：Host utilityProcess 承载（Phase 3 第二步，settings 域先行 + HOST_UNAVAILABLE 稳定码；预研见 [RESEARCH-0050](../research/RESEARCH-0050-host-process-transport.md)），done。
