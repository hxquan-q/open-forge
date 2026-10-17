---
id: RESEARCH-0030
type: research
status: draft
priority: P2
owner:
source: 本仓源码核对 + https://github.com/Haleclipse/CometixCode
created: 2026-10-18
updated: 2026-10-18
related_requirement: []
related_plan: []
related_issue: []
---
<!-- Copyright The Open Forge contributors. -->

# 受管编码工具（fd/rg）解析记录 inspect() 与双 doctor 出口可行性核对

## 问题与范围

针对用户草案做逐条代码核对，不实施：

- A1：`CodingToolExecutableResolver` 增加 additive 的 `inspect(tool)` 解析记录（source/path/version/lastError/offline），版本来自 `--version` 捕获与 `<toolsDir>/<tool>.version` 标记文件。
- A2：两个 doctor 出口——CLI `openforge doctor`（仿 debug-command.ts 子命令注册）与 Desktop 诊断包并入解析记录（vetta:diagnostics:export，桥接 runtime-desktop 的 toolsDirectory 集中构造点）。
- 参照物：CometixCode 的 `/doctor` 报告 rg 实际使用的二进制（vendor 目录 vs PATH，`USE_BUILTIN_RIPGREP=0` 可覆盖）——即"tool → source/path"报告面的先例；本方案在其上增加 version/lastError/offline。

## 事实来源

全部结论来自本仓 main 分支源码实测（行号为 2026-10-18 HEAD），CometixCode 部分来自其仓库 README。

## 当前结论

草案总体成立，四处需要修正/收紧后再进 TASK：

1. **接口面（成立）**。`CodingToolExecutableResolver` 仅 4 行（`packages/runtime-tools/src/coding/host/executable-resolver.ts`），消费方只调 `.resolve()`（`node-tool-environment.ts:154-156`、grep/glob/find/tree 各工具）。加可选 `inspect?` 纯 additive，三个实现（managed、local、SSH）与测试替身零改动。
2. **修正一：`download-failed`/`lastError` 是进程内状态，跨进程拿不到**。今天 `resolve()` 吞掉下载错误返回 undefined（`managed-executables/resolver.ts:57-60`），不留任何记录。而 Desktop 的诊断包在 **Electron main 进程**导出，真正的 resolve 发生在 agent runtime/sidecar 进程——main 进程静态检查不可能知道另一个进程的下载失败史。结论：`inspect()` 应为**纯静态检查**（不下载、不联网、不 spawn 除非 marker 缺失回退），source 枚举对 Desktop/CLI 只有 `cache | path | missing`（+ offline 标志）；`download-failed` 仅当 inspect 与 resolve 同实例同进程时才可报告（如 CLI agent 会话内自诊断），建议接口保留该值但两个 doctor 出口文档化"不会出现"。
3. **修正二：version 标记的落点不在 archive-installer 本体**。`installCodingToolArchive` 是 plan 驱动，`CodingToolDownloadPlan`（catalog.ts:53-59）**不含 version 字段**；version 只在 `downloadManagedCodingTool`（resolver.ts:111）作用域内。二选一：
   - 推荐：扩 `CodingToolDownloadPlan` 增加 `version`，并在 `CodingToolArchiveOperations` 增加一个 `writeVersionMarker` 操作、在 install 成功路径写入——与既有 DI 测试风格对称（operations mock 断言新调用），且 install 是唯一确知"装成功"的点；
   - 备选：`downloadManagedCodingTool` 成功后直接 `writeFileSync`——改动最小，但该函数本身不是 DI 单元，测试只能走集成。
   另注意存量缓存无 marker：inspect 遇到"cache 二进制在、marker 缺失"应回退一次 `spawnSync --version` 或报 `version: undefined`，二选一需在 TASK 里定死。
4. **修正三：CLI 侧两个澄清**。"cli.ts" 实为 `apps/cli-host/src/run-cli.ts`（`src/cli.ts` 是 bin 薄入口）；`openforge doctor` 只能学 debug-command.ts 的 **parse/run 子命令注册模式**（run-cli.ts:39-49 分发表 + HELP_TEXT），**不能学它的 RPC 通道**——debug 需要 dev Desktop 运行中，doctor 必须独立可用。tools 目录用 `join(getAgentDir(), "bin")`（`@vetta/coding-agent/config`，cli-host 已依赖；`getAgentDir()` 已处理 `VETTA_AGENT_DIR` 覆盖，node-config.ts:152-155）。CLI 输出英文成立（现有 help 全英文）。测试钩子：新增 doctor-command.test.ts 对齐 debug-cli-entry.test.ts 的进程级风格；bin/exports 不变 ⇒ `verify:artifact:installed` 不触发，runtime selection 不变 ⇒ `verify:runtime-contract` 不触发（按 cli-host AGENTS 的 Policy 触发条件），但需跑 compile-standalone 守卫确认新模块进独立可执行文件。
5. **Desktop 侧（成立，桥接需小重构）**。IPC 链已确认：`vetta:diagnostics:export`（ipc/diagnostics.ts:17）→ `buildDiagnosticsBundle()`（diagnostics-bundle.ts:26），加一个 `addManagedTools(zip)` → `managed-tools.json` 即可，无新 IPC、无 UI、i18n 为零。但草案引用的 `coding-agent-tool-environment.ts:158` 在**私有** `createDesktopNodeToolHost` 内、每会话工厂——诊断导出在 main 进程拿不到它。建议从 runtime-desktop 导出小 helper（如 `resolveDesktopCodingToolsDirectory(agentDir?)`）供工厂与 diagnostics-bundle 共用（单一事实源）；直接在 main 里复制 `join(getAgentDir(), "bin")` 也可行（desktop main 已大量使用 `agentDir ?? getAgentDir()` 模式，composition.ts:229 等）但形成两个事实源，不推荐。diagnostics-bundle 现无测试，需新建（electron `app` mock，或把可测纯逻辑下沉 runtime-node 后只测 zip 组装）。已知限制：自定义 agentDir 的会话与导出时的默认目录可能不同，静态检查反映默认目录，记录即可。
6. **SSH 侧（不覆盖）**。`createSshExecutableResolver`（runtime-ssh/src/ssh-tool-process.ts:85）是远端解析，本地 doctor 不涉及；可选 `inspect` 不破坏其合同。
7. **PATH 版本捕获（成立）**。managed resolver 的 `commandExists`（resolver.ts:93-100）已 `spawnSync(command, ["--version"], { stdio: "pipe" })`，`result.stdout` 即版本串，顺手捕获零成本；local resolver 的同名默认是 `stdio: "ignore"`（host/executable-resolver.ts:20-27），要捕获需改 pipe——均为内部实现，无公共合同影响。

## 被否决的方案

- **doctor 走 debug RPC 通道**：强制 Desktop dev 运行中，与"环境坏了才需要 doctor"的场景自相矛盾。
- **下载失败持久化到磁盘**（如 `<tool>.last-error` 文件）：为低频信息增加常写文件与清理负担，静态检查已覆盖主要诊断需求。
- **doctor 内做网络探测**（fetchLatestCodingToolVersion 试连）：诊断导出不应产生网络副作用与延迟，且离线场景恰是 doctor 要诊断的对象。
- **Desktop 加设置页展示解析记录**：新增 UI 面与 i18n 负担，诊断包 JSON 已满足排障诉求。

## 代码/测试/指标锚点

- 接口：`packages/runtime-tools/src/coding/host/executable-resolver.ts:1-5`；导出面 `runtime-tools/src/coding/host/index.ts:19`
- managed resolver：`packages/runtime-node/src/coding/host/managed-executables/resolver.ts:27-61`（DI 合同 `ManagedCodingToolExecutableDependencies:14-19`，inspect 应循此自由函数模式）；组包点 `runtime-node/src/coding/host/tool-environment.ts:59`
- 下载计划（无 version 字段）：`packages/runtime-node/src/coding/host/managed-executables/catalog.ts:53-78`；archive 安装（DI operations）：同目录 `archive-installer.ts:7-52`
- 消费方只调 resolve：`packages/runtime-node/src/coding/node-tool-environment.ts:154-156`、`tools/{grep,glob,find,tree}`
- SSH 实现：`packages/runtime-ssh/src/ssh-tool-process.ts:85-94`
- CLI 分发与模式：`apps/cli-host/src/run-cli.ts:33-52`、`apps/cli-host/src/debug-command.ts`（仅学注册模式）、测试样 `apps/cli-host/test/debug-cli-entry.test.ts`
- Desktop 诊断链：`apps/desktop/src/main/ipc/diagnostics.ts:16-29` → `apps/desktop/src/main/diagnostics-bundle.ts:26-36`；桥接行 `packages/runtime-desktop/src/coding-agent-tool-environment.ts:158`（私有工厂内）；`getAgentDir()`：`packages/coding-agent/src/host/node-config.ts:152-155`
- 参照：CometixCode README——`/doctor` 报告 rg 用哪个二进制（vendor/PATH 顺序 + `USE_BUILTIN_RIPGREP=0`）；本仓 RESEARCH-0007 已收录该项目

## 失效条件与置信度

- 高置信：接口 additive、CLI 注册点、Desktop IPC 链、plan 无 version 字段、进程边界（main vs sidecar）——均直接读码确认。
- 中置信：diagnostics-bundle 新测试的 electron `app` mock 可行性（main 侧既有测试多用相对路径读源码或 mock，未逐一对号）。
- 失效条件：若上游重构 resolver 合同或 toolsDirectory 构造点迁移，第 2/5 条的行号与"单一事实源"建议需重新核对；若未来 doctor 被要求跨进程汇总下载失败史，第 2 条结论（纯静态）失效，需引入上报通道。

## 下一步触发信号

- 用户确认修正点（source 枚举收敛、marker 落点选型、存量 marker 缺失回退策略）后，按两件拆 TASK：A1 runtime-node（inspect + version marker + managed-executables.test.ts 用例）；A2 出口（cli-host doctor 子命令 + desktop diagnostics-bundle collector + 各自测试）。两件无相互阻塞，可并行 worktree。
