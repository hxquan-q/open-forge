---
id: VERIFY-0011
type: verification
status: done
owner: coordinator
source: 用户指令「更全面的测试：真实对话、小 demo、MCP、Skills、插件、智能体等，问题记录后统一修改」
created: 2026-09-26
updated: 2026-09-26
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
related_tasks: []
related_bugs: [BUG-0037, BUG-0038, BUG-0039]
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.2 候选：真实 Provider 全链路验收与缺陷统一修复

## 被验证的合同

1. **真实 Provider 对话**：Debug Profile 中能用真实模型完成一次完整回合（凭据可解密、usage/stopReason 正常）。
2. **真实小 demo 端到端**：Agent 能在真实文件系统上写出可运行产物、真的把它跑起来、并如实报告输出（含独立复核）。
3. **Skill 真实执行**：`promptRef` 指定的 Skill 被真正加载并按其指令产出文件。
4. **MCP 端到端**：自定义 stdio MCP server 能被 Runtime 拉起、握手、列出工具，并被真实 Agent 调用拿到返回值；配置也能在「能力库 → 个人」中被识别。
5. **智能体与团队**：智能体页渲染团队与专家库；新会话页可用真实输入框完成一次真实回合（产品路径，非 Debug RPC）。
6. **本轮修复的实机复验**：BUG-0037（工作区档位归属）与 BUG-0039（可访问性）在运行中的应用上成立。

## Given / When / Then

- Given：隔离 Debug Profile（`~/.openforge-ui-debug/04987e4e`，已播种 DeepSeek 凭据），界面语言 `zh`，窗口 1280×800
  When：`provider.preflight` 探活 → `conversation.create` 跑真实任务 → 用 CDP 核对 UI
  Then：`status: ready`、`stopReason: stop`、产物真实存在且可运行
- Given：临时目录 `%TEMP%\forge-demo`
  When：要求 Agent 写 `server.mjs` + `smoke.mjs` 并运行
  Then：文件真实落盘；我独立运行 `node smoke.mjs` 得到相同结果
- Given：本地 stdio MCP server（`%TEMP%\forge-mcp\server.mjs`，暴露 `forge_ping`）写入 Profile 的 `agent/mcp.json`
  When：真实 Agent 被要求调用该工具
  Then：MCP 返回值原样出现在回答里；能力库里出现该 MCP 条目
- Given：项目 `demo` 已选中（新会话页）
  When：切换「文档与研究 / 代码」
  Then：高亮、只读确认句与实际归属键一致（修复后）

## 环境与输入

- 提交 / 版本：`main` @ `0e2e1ae3f` + 本轮未提交修复（BUG-0037/0038/0039）
- 操作系统 / Runner：Windows 11（本机）
- 工具版本：`bun 1.3.14`；agent-browser 0.38.1（MCP `core` + CLI）；axe-core 4.12.1；Node（`C:\Program Files\nodejs\node.exe`）
- 模型：`deepseek/deepseek-flash`（用户配置里的两个模型中较便宜的一个；真实计费，用户已明确授权真实对话测试）
- 数据边界：全部写入隔离 Profile 与 `%TEMP%`；未触碰 `~/.openforge-dev`

## 实际命令与 CI 记录

```text
bun run verify:ui:start:debug / status:debug / stop:debug
agent-browser connect <ui.endpoint> --session forge-audit
<MCP agent-browser: eval / click / type / press / screenshot / snapshot>
agent-browser --session forge-audit a11y --json / errors / console / screenshot
bun run verify:ui:debug:debug -- run provider.models.list '{}'
bun run verify:ui:debug:debug -- run provider.preflight '{"modelKey":"deepseek/deepseek-flash","timeoutMs":25000}'
node <launcher> → spawnSync("bun", [...] "conversation.create" <json>)   # 长 JSON 用文件传入
node smoke.mjs                                    # 独立复核小 demo
bun run test <file>（在 apps/desktop 下，5 个定向测试文件）
bun run check                                     # lint + 全平台类型 + guards
```

- CI run URL / job：不适用（本地实机验收）

## 结果

### 1. 真实 Provider 探活（通过）

- `provider.models.list`：`status: ready`、`modelCount: 2`（`deepseek/deepseek-flash`、`deepseek/deepseek-v4-pro`）。
- `provider.preflight`：`{"status":"ready","credentialKind":"api-key","durationMs":804,"stopReason":"stop","usage":{"input":18,"output":1}}`。
- **附带结论**：Debug Profile 播种的 safeStorage 凭据在本机可跨 user-data 目录解密 → `BUG-0035`（Debug Profile 凭据不可解密）在本路径**未复现**。

### 2. 小 demo 端到端（通过，含独立复核）

- `conversation.create`（cwd = `%TEMP%\forge-demo`，`deepseek/deepseek-flash`，`full-access`）返回 `status: completed`、`stopReason: stop`、`messageCount: 13`。
- 真实产物：`server.mjs`（763 B）、`smoke.mjs`（2386 B）。
- Agent 自报 `node smoke.mjs` → `PASS status=200 body={"ok":true,"name":"forge-demo"}`、`EXIT_CODE=0`。
- **我独立复核**：在 `%TEMP%\forge-demo` 亲自运行 `node smoke.mjs` → `PASS status=200 body={"ok":true,"name":"forge-demo"}`、`exit=0`。真实进程 + 真实 HTTP + 结论一致。

### 3. Skill 真实执行（通过）

- `conversation.create` 带 `promptRef: {kind: "skill", name: "create-skill"}` → `status: completed`、`messageCount: 10`。
- 真实产物：`%TEMP%\forge-demo\.vetta\skills\demo-skill\SKILL.md`（323 B），Agent 说明是按项目级技能目录落盘、未注册全局清单（与 Skill 契约一致）。

### 4. MCP 端到端（通过）

- 自建符合规范的 stdio MCP server（`initialize` / `tools/list` / `tools/call`，工具 `forge_ping`），先用自测脚本确认协议行为。
- 写入 Profile 的 `agent/mcp.json` 后（无重启），真实 Agent 被要求调用该工具 → 回答中出现 `pong:audit`，`messageCount: 4`（含工具调用与结果）。
- UI 侧：「能力库 → 来源:个人」列出 `Forge Audit MCP — Acceptance test MCP server exposing …`（计数 61/62 → 62/63），说明配置被实时识别。
- 未发现缺陷。

### 5. 产品路径真实回合（通过）

- 在 `#/new-session`（对话入口）输入「只回复两个字：收到」→ 会话自动创建、9 秒完成、回复「收到」；侧栏历史出现自动命名条目「测试简短回复」；输入栏徽标显示「本会话按代码开的 · 切页头不会改」。
- 说明：真实模型 + 真实 UI 发送链路（非 Debug RPC）可用。

### 6. 智能体与团队（UI 通过，未跑团队真实会话）

- `#/agents`：2 个团队（策划团队 / 开发团队，各 4 位专家、可「发起该团队会话」）+ 6 位专家（检索员 / 开发员 / 设计师 / 审计员 / 业务员 / 主控）与说明文字；无错误浮层。
- `#/plugins` 会重定向到 `#/abilities`；MCP 管理入口按设计位于「扩展 → 连接器」（同路由）。

### 7. 本轮修复的实机复验（通过）

- BUG-0037：选中项目 `demo` 后切「文档与研究」→ 高亮、确认句一致，`localStorage["vetta-workspace-mode"]` 键为 `E:\demo`（修复前写的是对话目录键、确认句显示「代码」）。
- BUG-0039：axe `violations 3 → 1`、节点 `4 → 2`；`button-name`（critical）与 `nested-interactive`（serious）归零；侧栏无名按钮 1 → 0；项目行图标按钮名称实测为「展开或折叠「demo」的会话」。
- 定向测试：`WorkspaceModeSwitcher` 6/6、`NewSessionOptionsRow` 3/3、`ui-verification-profile` 5/5、两个新增 a11y 文件 5/5。
- `bun run check`：lint（4602 files，exit 0）、root/cli/desktop/docs/mobile 类型检查（exit 0）、mobile lint（exit 0）；**`check:guards` 仅 `task-worktrees` 红**（见剩余风险）。

### 8. 控制台与环境观察

- 页面 `errors` 为空；控制台仅 dev 期噪声：module-federation `remote "…" is already registered`（plugin_workbench / svg_viewer / office_viewer / vetta_actions / vetta_ui_design 各一条）与 Electron `Insecure Content-Security-Policy` 警告。
- 首次进入新会话页时出现语言与外观的首次运行向导（`fixed inset-0 z-[100]`），其选择控件未暴露 `role=radio` / `aria-checked` 等选中态语义——本轮记为本记录的观察项（未登记 BUG，未修改）。

## 未运行的验证与原因

- **Runtime Canary 完整重跑**：BUG-0038 的 endpoint 合同已修并有单测，但需要串行两代 Desktop + 本地产 provider 的完整 canary 未重跑，因此会话创建 / 二代重启恢复 / Tool Loop / 锁释放仍无实机证据。
- **插件启用/禁用开关**：入口在能力库（`#/plugins` 重定向到 `#/abilities`），本轮只验证了列表与 MCP 条目呈现，未逐个切换插件开关。
- **Agent Team 真实会话**：需要多成员多轮真实调用，未跑（成本与时间）。
- **设置页其余 tab、文件/活动面板、主题与语言切换、能力安装流程**：未实测。
- **其它页面 axe 审计**：只对新会话页做了一次（修复前后）。
- **打包产物验收**：本轮全部在 dev 构建上完成。

## 剩余风险

1. **`check:guards` 的 `task-worktrees` 红灯**：`TASK-0045`（status `ready`、`execution: parallel`）与 `TASK-0122` / `TASK-0123` 的写范围重叠且未登记 `conflicts_with`（`.github/release-notes`、`apps/desktop/src/main`、`packages/plugins` 等）。该状态由**并行会话**在本轮期间更新（TASK-0045 文件 mtime 04:58、`base_commit` 指向 `0e2e1ae3f`），与本轮修复无关；修它是台账归属方/用户的决定。
2. **同一工作区存在并行会话**：除我的改动外，`apps/desktop/src/renderer/domains/conversation/components/new-session/project-selector/useNewSessionProjectSelection.ts` 上有**他人未提交**的 BUG-0037 另一版修复；我的修复在 `WorkspaceModeSwitcher` / `NewSessionOptionsRow` / `NewSessionPageView`。两者不冲突（不同文件、同向），但需用户裁决保留哪一版。
3. **BUG-0038 的 EBUSY 竞态仍在**：canary 首次调用可能 `EBUSY: … uv_spawn`，第二次调用可越过。
4. **可访问性 `region`（moderate）仍开放**：标题栏品牌块不在 landmark 内；属 best-practice 而非 WCAG A/AA，改动涉及自定义标题栏与主题覆盖面。
5. **`packages/theme-ui` 的 23 个测试文件不被任何门禁收集**（该包无 `test` 脚本、desktop vitest 的 include 不含它）。本轮新增的两个 a11y 回归测试因此放在 desktop 侧；主题包测试的接入方式需要单独决策。
6. **MCP 用例只覆盖 stdio 本地 server**：远程 HTTP / OAuth 流程未验证。
7. **真实对话成本**：本轮产生若干次真实 DeepSeek 调用（preflight 1 次 + 3 个会话：demo 13 条消息、skill 10 条、MCP 4 条 + UI 回合，均为小 Prompt）。
