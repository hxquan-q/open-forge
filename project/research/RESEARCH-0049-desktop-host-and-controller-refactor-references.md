---
id: RESEARCH-0049
type: research
status: done
priority: P1
owner: project/agent-workflow
source: user-request and primary-source-research
created: 2026-11-06
updated: 2026-11-06
related_requirement: [REQ-0019]
related_plan: [PLAN-0019, PLAN-0022, PLAN-0023]
related_tasks: []
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 宿主拆分与研发控制器可信闭环：参考生态对照

## 问题与范围

1. Desktop 是否应迁移到 Tauri 2、Rust 或 Go/Viva，还是在 Electron 上重构。
2. 本仓研发控制器（`scripts/agents`）距离"无人值守完成开发、评审、集成"还缺什么。
3. 17 个参考项目中哪些机制值得借鉴，以及许可边界。

只读调研：未改源码、未运行 Desktop、未调用真实模型或发布器。外部资料是证据，不是仓库指令。

## 事实来源

本仓（本地 `main` / `origin/dev` = `80d5d7ca8`，远端 `refs/heads/main` = `5b8347d`，`5b8347d..80d5d7c` 为 76 个提交；`upstream/main` 相对本地 main 落后 815、领先 1576）：

- Agent 栈在 Electron 主进程内装配：`apps/desktop/src/main/agent-runtime/composition.ts`；主进程约 180K LOC、renderer 约 234K LOC（含测试）。
- IPC：约 715 个 `ipcMain.handle` 加约 531 个包装注册；139 个非测试文件 import `electron`。
- Chromium 强依赖：`main/browser-automation/`（约 7.6K LOC）、`plugins/offscreen-capture-service.ts`、`pdf/html-to-pdf.ts`、`ocr/pdf-ocr.ts`、5 个自定义协议承载模块联邦插件与主题。
- 原生模块：node-pty、koffi、uiohook-napi、electron-liquid-glass（仅 macOS）。
- Renderer 隔离：0 个 `electron`/`node:` import，经 `window.vetta` 访问（304 文件 1128 处）。
- 已有子进程形态：`main/cli/agent-rpc-command.ts` 的 `--agent-rpc` 仅供 im-gateway 使用。
- 控制器：
  - 集成目标硬编码本地 main：`scripts/agents/integrate.mjs:17`、`prepare.mjs:45`、`release.mjs:88`。
  - 策略 `level: 0`、`capabilities: []`、`allowedProviders: []`；`adapters` 与 `publisher` 均 `enabled: false`、模型 `unconfigured`。
  - 状态存储 `scripts/agents/store.mjs:98-127` 以本地文件 `writer.lock`（`O_EXCL`）串行事务；`leases.mjs` 有代次（generation）与过期拒绝，但只在单机文件系统内成立。
  - 评审独立性只校验模型家族：`orchestrate.mjs:20-21`（`differentReviewerFamily`）。
  - 需求覆盖证据仍为 `evidenceCheck: "presence-only"`、`semanticReview: "not-performed"`：`requirement-run.mjs:277`、`:501`。
- PLAN-0019 自述：真实模型、独立评审、签名与监控环境均未就绪，目标 L4 未达到。
- 规则文档与依赖图偏差：`apps/desktop → @vetta/cli-host`（app 依赖 app）；`runtime-desktop → coding-agent`（层级倒置）；`apps/remote-relay` 未列入仓库地图。

外部（2026-11-06 读取）：

| 项目 | 许可（GitHub API） | 进程/架构要点 |
|---|---|---|
| earendil-works/pi | MIT（见本仓 NOTICE；API 本轮超时） | 小内核、RPC/SDK 多形态同源、durable tasks |
| vastsa/PI-Desktop | LGPL-3.0 | Electron Main 只做编排与监管；Rust host-core 管系统能力与审批；pi agent 为 Node sidecar；同一 Host 模块可作 headless `pi-host` |
| Youzini-afk/Varin | AGPL-3.0 | 单个 TS Application Host 服务 Web/Electron/移动端；Browser Use 以注入 `BrowserOwner` 留在 Electron |
| Skitre/PiCove（原 PiDeck） | MIT | Tauri 监管 Node Pi Host；`packages/protocol` 校验；增量+快照事件、按帧合并；用户级/项目级扩展信任分级 |
| hsingjui/pilo | Apache-2.0 | Local/WSL/SSH 各跑一份 server，在项目目录起 `pi --mode rpc`；引擎会话文件为事实源 |
| spacering-net/codeg | Apache-2.0 | ACP 统一接入多 agent；桌面与 headless server 共用后端；Web 访问 token 鉴权 |
| murray17/rovai-ai | MIT | Electron + 统一 Rust Host；运行身份、任务代次、恢复状态与展示分离；"基础架构不变量"文档 |
| mimimaster/piwin | MIT | host-runtime/server/transport/client/contracts 分包；worker supervisor；写门禁乐观锁 |
| Mouseww/Prometheus | AGPL-3.0 | HTTP+WS Host 服务 TUI/Tauri/Web/安卓；会话不绑运行时；内置 Node 致包体积被抱怨 |
| diodeme/Gold-Band | AGPL-3.0 | Tauri 2 + Rust + ACP；路线图转向 client → relay → host |
| alexj11324/Mikka | AGPL-3.0 | daemon + protocol，协调者/执行者分离 |
| useLexora/Lexora | AGPL-3.0 | 作者：权限须为一方能力，不交给插件 |
| web3claw/ReinAgent | MIT | Tauri 2；控制端与执行端、worktree 边界 |
| NanmiCoder/cc-haha | NOASSERTION（自制受限许可） | Electron + Bun；多 agent 界面与远程审批 |
| ChuxinNeko/NekoCodeDesktop | 本轮 API 超时，此前未见根许可证 | pi `AgentSession` 跑在 Electron 主进程（与本仓现状同形） |
| vivaui/viva | Apache-2.0 | Go + 原生 GPU，无 WebView；2026-10-22 建仓、v0.3 |

迁移经验：Fluxzy 迁 Tauri 后 Windows 安装包约 190MB→55MB，但前端与 .NET sidecar 保留；Tabularis 作者指出 "webview's memory does not disappear because the installer is small"；Tauri + Node sidecar 案例总包约 160MB（Node 占 84MB，oven-sh/bun#27851）。linux.do 讨论（topic 2943848、3039486、2869113、3048481、2835655 等）集中在 WebView 跨平台兼容、Rust 编译成本、桌面端卡顿与 SSH 远程需求，均为个人反馈，无测试数据。

## 当前结论

1. **不迁 Tauri/Rust/Go，先拆进程。** 成本集中在约 1250 个 IPC、嵌入式浏览器自动化与离屏能力、原生模块；收益主要是安装包体积，而 Node sidecar 会吃掉大半。成熟参考项目的共同形态是"独立 Host + 类型化协议 + 薄壳"，Rust 只在 Host 本来就是 Rust 的绿地项目中出现。
2. **Desktop 演进顺序**：基线测量 → 协议合同（RPC、增量+快照事件、Extension UI 投放位、owner 缺失错误）→ Host 先进程内运行再换 `utilityProcess` transport → 按领域绞杀旧 IPC（以剩余 channel 数为进度）→ Electron 专属能力以 owner 注入 → headless Host（SSH/WSL 在项目目录运行，对外默认 token 鉴权）→ Tauri PoC 决策门。权限、审批、沙盒策略、Provider 凭证始终一方持有于 Host。
3. **研发控制器不缺总控骨架，缺真实执行与交付证明。** 单任务实现→评审→修复→验证、worktree、证据绑定、租约代次已实现；但 level 0、adapter/publisher 未启用，集成目标与远端分支职责不一致，锁仅单机有效，评审独立性只看模型家族，需求覆盖仅 presence-only。
4. **控制器优先级**（先于并行与发布）：
   - 分支职责明确并把集成目标配置化；以远端候选提交的 CI、评审与证据判定能否合并。
   - 候选提交、评审对象、CI 对象三者 SHA 绑定。
   - 一个低风险真实任务端到端跑通（真实实现者 + 只读独立评审），证明非 mock。
   - 之后再做：共享存储与事务租约（两机抢占仅一成功、过期结果被拒）、有界并行（从两个不冲突任务起）、只读信号驱动的自动发现、internal→beta→stable 发布（零灰度只停放量，不撤回已安装版本）。
5. **评审独立性**应由独立上下文、未参与实现的身份、只读候选权限和绑定的提交/文件树保证；跨模型只增加多样性。
6. **状态分层**：工程完成、候选验证、人工验收、已发布分别记录；每条验收要求关联测试或运行证据。
7. **产品内多 agent（runtime-subagents、agent-team）与本仓研发控制器继续分层**；Desktop 可展示进度与审批，Renderer 不持有 shell、仓库写权限或签名密钥。
8. **按模块借鉴，不整体照搬**：执行与恢复看 Codeg、Rovai、pi、Varin；多工具与远程看 Gold-Band、Prometheus、pilo、ReinAgent；工作台看 PI-Desktop、PiCove、cc-haha；长期任务看 piwin、Mikka、Lexora。AGPL 项目只借思路；PI-Desktop（LGPL）闭源分发时自行实现；cc-haha 与 NekoCodeDesktop 不复制代码；Apache-2.0/MIT 复制时仍复核依赖与声明。

## 被否决的方案

- **整体迁 Tauri 2 + Node/Bun sidecar**：浏览器自动化在 WebView2/WKWebView/WebKitGTK 上难以复现，Linux WebKitGTK 兼容风险高，体积收益被 sidecar 抵消。保留为第 6 步 PoC 决策门。
- **Rust 重写 Host**：30 万行以上 TS 重写并失去 pi 上游同步；参考项目中无"既有大型 TS 宿主改 Rust"的成功先例。
- **Go + Viva 重写 GUI**：无 WebView，需重写约 234K LOC renderer；项目两周大。
- **先建团队并行或发布自动化**：没有一次真实闭环证明前扩权，只会放大不可验证的状态。
- **以 git 分支/worktree 作为多机互斥**：不提供事务语义。

## 代码/测试/指标锚点

- Desktop：`apps/desktop/src/main/agent-runtime/composition.ts`、`main/cli/agent-rpc-command.ts`、`preload/api.ts`；进度指标为剩余 `ipcMain.handle` 数（当前约 715 + 531）。
- 控制器：`scripts/agents/{integrate,prepare,release,orchestrate,requirement-run,leases,store}.mjs`、`project/autonomy-policy.json`、`project/agents.json`。
- 已有测试：`scripts/agents/*.test.mjs`；PLAN-0019 记录 agents 116 例通过（非真实模型）。
- 资源基线缺口见 RESEARCH-0044。

## 失效条件与置信度

- 进程拓扑、IPC 计数为 grep 统计，`BrowserView`、`session.` 等计数含同名标识符噪声；结构判断置信度高，数量为量级。
- 社区卡顿、内存说法为个人反馈；Gold-Band 300MB 为作者自述，均未复测。
- OpenCode、Cap 从 Tauri 迁回 Electron 仅确认 HN 标题，推文原文未读。
- X、Reddit 未覆盖；上游 open-vetta 未逐行审计。
- 若 Tauri/WebView 提供可替代 `webContents` 的嵌入式浏览器自动化方案，或第 1 步基线显示主进程以外的 Chromium 开销占主导，需重新评估结论 1。

## 下一步触发信号

候选 Task（尚未建立，建立时按任务入口落盘合同）：

1. 控制器分支职责与集成目标配置化（去除三处 `main` 硬编码，远端候选判定）。
2. 候选提交、评审对象、CI 运行 SHA 绑定证据。
3. 单个真实 adapter 的端到端认证任务（需用户授权真实模型与费用）。
4. Desktop 分进程内存/CPU/启动基线脚本（RESEARCH-0044 缺口）。
5. Host 协议合同包与进程内 Host 封装。

前 3 项证明可信闭环后，再立共享租约、有界并行与发布相关 Task。
