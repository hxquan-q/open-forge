---
id: RESEARCH-0032
type: research
status: done
priority: P0
owner: packages/coding-agent
source: 上游 earendil-works/pi 安全通告（4 条 GHSA）、修复提交补丁正文、本仓 main 逐文件核对（2026-10-18）
created: 2026-10-18
updated: 2026-10-18
related_requirement: []
related_plan: []
related_tasks: [TASK-0310, TASK-0311, TASK-0312, TASK-0313, TASK-0314]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# pi 上游安全通告审计与回移分诊（GHSA × 4 + 回移积压清单）

## 问题与范围

上游 `earendil-works/pi`（本仓 `packages/ai`、`packages/agent`、`packages/coding-agent` 与 `runtime-*` 部分文件的派生来源，基线约 v0.55.3 / `9d68043c`，2026-02-28）已发布 4 条安全通告，全部覆盖该基线。本审计逐条核对上游修复提交与本仓 main 当前代码，判定受影响状态并给出回移分诊。整体合并上游不可行（163 个 src 文件仅 9 个与上游相同），只能按修复语义手工移植（vendor + 上游雷达，策略 A）。

## 事实来源

- 4 条 GHSA 与上游修复补丁正文（GitHub commit .patch，2026-10-18 拉取）：
  - GHSA-7v5m-pr3q-6453（low）：HTML 导出 XSS，修复 `6cb23f9b`（link/image scheme 白名单 + C0 剥离）+ `b3ed5459`（属性引号转义）。
  - GHSA-r95r-rj6r-c39x（low）：auth.json 写入竞态，修复 `135fb545`（`writeFileSync` 直接带 `mode:0o600` 创建，保留 chmod 兜底）。
  - GHSA-jfgx-wxx8-mp94（high）：临时扩展缓存路径可预测（本地提权），修复 `ea3465a8`（迁到 `agentDir/tmp/extensions`，`mkdir 0700` + `chmod 0700` 兜底；包级 sha256 哈希不变）。
  - GHSA-mqxh-6gq7-558m（medium）：项目本地扩展未经批准加载，修复 `89a92207` 等（project trust 门禁）。
- 本仓 main（`7d26d1df6` 工作树）逐文件读取核对，锚点见下表；补丁语义与报告结论一致处不再重复举证。

## 当前结论：4 条 GHSA 在本仓的受影响状态

| GHSA | 级别 | 本仓锚点（2026-10-18 亲核） | 状态 | 处置 |
|---|---|---|---|---|
| jfgx-wxx8-mp94 | high | `packages/coding-agent/src/resources/packages/resource-package-locations.ts:76-79`（`temporaryDir()` 根 = `locationFacts.temporaryDirectory` + `pi-extensions/...`）；`packages/runtime-node/src/host/resource-package-host.ts:121`（默认 `tmpdir()`）。SSH 远端跑同一份代码，同样暴露 | **受影响**（Linux/macOS 共享主机与 SSH 远端；Windows %TEMP% 按用户隔离，风险低） | TASK-0310 |
| r95r-rj6r-c39x | low | `packages/runtime-node/src/host/transactional-text-storage.ts:86-89`（先 `writeFileSync` 后 `chmodSync`，创建窗口 0666&umask）；`packages/runtime-node/src/mcp/auth/file-oauth-state-store.ts:28-35`（`save` 完全不设 mode）。桌面端自有 `apps/desktop/src/main/cloud/auth/credential-store.ts:57-59` 已带 `mode:0o600` 创建，不受影响 | **受影响**（多用户 Linux/macOS；Windows ACL 语义不同，mode 大体无效） | TASK-0311 |
| 7v5m-pr3q-6453 | low | `packages/coding-agent/src/export-html/assets/template.js:591-596`（`escapeHtml` 为 DOM 实现，不转义引号）+ `:1454-1488`（`marked.use` renderer 只覆盖 `code`/`text`/`codespan`，无 link/image 净化）。导出链路真实存在：desktop CLI 资产打包 `apps/desktop/src/main/cli/agent-rpc-command.ts:36-41` | **受影响** | TASK-0312 |
| mqxh-6gq7-558m | medium | 项目级 packages/skills 从 `<cwd>/.vetta` 无门禁加载：`package-source-runtime.ts:115`、`resources/skills/discovery.ts:303`、`resources/runtime/skill-resource-state.ts:57`。本仓已有 `NodeProjectTrustStore`（`.vetta-local/trust.json`）但只用于 L3 工具审批（`apps/desktop/src/main/task-activity/tool-approval-broker.ts`），未覆盖扩展/skills 加载 | **很可能受影响**（桌面端打开工作区无等价确认流程，未发现反证） | TASK-0314（draft，需 UX 设计） |

附带核对：OAuth 打开浏览器已有 `apps/desktop/src/main/open-external.ts` 的 http/https/mailto/tel 白名单（对应上游 `ba6e5298` 已缓解）；上游 `135fb545` 的对象 `auth-storage.ts` 在本仓的对应物是 `transactional-text-storage.ts`（结构重写，语义相同）。

## 回移积压清单（GHSA 之外，按报告分诊优先级）

已排入本批：#5 Windows 进程（`bash-executor.ts:85-90` spawn 缺 `windowsHide:true`；`process-tree.ts:6-12` taskkill 相对路径 + 无 `error` 监听，ENOENT 时未处理 error 事件可致进程崩溃）→ TASK-0313。

后续批次（本轮不做，按 §策略 A 每次上游发版分诊）：

- #6 依赖与供应链加固（精确固定版本、lifecycle 脚本白名单、锁文件 CI 守卫、清理 proxy-agent/ajv/chalk 等上游已弃依赖、`@mariozechner/jiti`→官方 jiti）；
- #7 流式 JSON 解析（非法 `\u` 转义丢字段 ai#10868、partialJson 泄漏进持久化记录 0.67.2）；
- #8 agent 循环健壮性（afterToolCall 抛错、长度截断 tool call、中止后兄弟调用、reset 拒绝、退避上限、并行事件顺序；本仓 `engine/*` 已改写过，需逐项核实是否已有等价处理）；
- #9 会话写入原子性与 torn-tail 修复（`file-conversation-repository.ts` 用 appendFile；注意 BUG-0054/BUG-0060 已有原子写历史）；
- #10 压缩与缓存（按模型预算、压缩独立路由关缓存、忽略全零 usage、预热 prompt cache）；
- #11 计价与用量分档/缓存计费修正；
- #12 MCP OAuth 加固（RFC 9207 iss、按 server 存凭据、step-up scope 保留、刷新取消后仍持久化）；
- #13 Provider 认证隔离（GH_TOKEN、ANTHROPIC_AUTH_TOKEN、Codex WS 按账号）；
- #16 CLI 子进程 userData 在 `tmpdir()/vetta-agent-rpc-<pid>`（与 #1 同类）。

不建议回移：pi-tui/全屏 TUI、pi-durable(Pico)/chord/pi-env 整体引入、上游 provider 文件拆分方式、typebox 0.34→1.x、0.84.1 之后的扩展 API 新增项（pi-compat 路线图另管）。

## 被否决的方案

- 整体 merge/rebase 上游（约 3960 提交，163 文件仅 9 个相同）：全冲突，不可行。
- git subtree/submodule：同上，否决。
- 改为直接依赖 `@earendil-works/pi-ai`、`pi-agent-core`（策略 C）：需把 provider-kit/engine 改造重写为适配层，粗估 6–10 人周以上且受上游节奏牵制；每季度重评，前提是上游 ai 层抽象能覆盖国产 provider 与路由需求。
- 仅依赖 npm 独立包（策略 B，如 pi-codemode）：仅对低耦合包按需采用，锁定精确版本并审计 lifecycle 脚本。

## 代码/测试/指标锚点

- 上游雷达文档：`docs/upstream/pi.md`（基线、最近评审上游点、逐条处置结论的唯一事实源）。
- 各修复的回归测试锚点见 TASK-0310～TASK-0313。

## 结论失效条件

- 上游发布新安全通告或新修复（雷达文档需更新分诊）；
- 本仓对涉事文件做大改（锚点行号失效，重新核对语义）；
- GHSA-mqxh 核实结论升级/降级（桌面端如已存在等价确认流程则降级；未发现则按受影响实施 TASK-0314）。

## 下一步触发信号

- TASK-0310～TASK-0313 完成后，剩余批次按积压清单排期；
- 上游 pi 每次发版：按 CHANGELOG Fixed/Security + GHSA 做一次分诊（采纳/不适用/已等价），更新 `docs/upstream/pi.md`。
