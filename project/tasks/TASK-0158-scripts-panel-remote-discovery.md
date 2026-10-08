---
id: TASK-0158
type: task
status: verifying
priority: P2
owner: plugins + capability-sdk + desktop filesystem + ssh-helper
source: user-request; upstream 8c6872ac8, bb3a23ef8, 7a7af9cea, 1e7071c0e, 7fdc02a06, 7910ce57f
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0153, TASK-0148, TASK-0167]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree: TASK-0196 批次工作树内串行（../open-forge-wt/task-0196-draft-batch）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ssh-transport, apps/ssh-helper, packages/capability-sdk, packages/plugins, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/preload, apps/desktop/src/renderer/domains/plugins]
write_paths: [packages/ssh-transport, apps/ssh-helper, packages/capability-sdk, packages/plugins, apps/desktop/src/main/filesystem, apps/desktop/src/main/capabilities, apps/desktop/src/preload, apps/desktop/src/renderer/domains/plugins, project/tasks/TASK-0158-scripts-panel-remote-discovery.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [packages/ssh-transport]
depends_on: [TASK-0153, TASK-0148, TASK-0167]
conflicts_with: []
integration_status: integrated（随本批推送 origin/dev）
created: 2026-10-02
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 脚本面板与远端文件名筛选

## 目标、范围与适配策略

Upstreamable 的通用行为补丁；Open Forge-only/Compatibility 的既有部分留在本仓原位置。来源以 PLAN-0014 固定上游 SHA 为准：8c6872ac8, bb3a23ef8, 7a7af9cea, 1e7071c0e, 7fdc02a06, 7910ce57f。

names 在远端截断前过滤，兼容旧 helper；全链路 schema/IPC/SDK 接线后接脚本面板与终端权限。保留远端 cwd、脚本展示/授权、现有插件品牌与打包方式；重开不自动重跑。

先对照相关源码/测试和本仓自分叉以来的 diff；已有等价实现走 retain+验证，不整文件覆盖。正式实施前读取包 AGENTS/README/ADR；当前 draft 代表仍需领域调用链核实，不代表被取消或已经交付。不引入手机远程协作，不扩大 Task 外的架构清理。

## Given / When / Then

- Given：既有项目/会话/配置，以及本仓已经增加的功能与兼容数据。
- When：用户从当前正常入口触发本 Task 的目标行为（具体场景见验证条目）。
- Then：目标改善可观察，同时原有错误、取消、权限、usage/stop、持久化与恢复合同不退化；失败可见且可恢复。

## 验证合同

大仓库 limit 后 manifest、旧 helper/fallback、非法名字；本地/SSH 正常插件入口；同脚本不重复启动、权限拒绝、重新打开只恢复布局。

- 建立旧行为失败基线或既有等价能力证据，随后逐个行为完成 red/green。只 Mock 外部边界，不访问真实用户状态或付费服务。
- 定向命令：通过目标包的 `bun <relative>/scripts/quality/run-vitest.mjs run <上述行为的测试文件>`；开工核实并回填实际文件与结果。
- 影响面：`bun run test:impact -- <本 Task 实际变更文件>`；公共合同/跨包时按政策 `test:changed`。完成后 `bun run check`；Go helper 另跑 Go 工具链。
- 未授权 `verify:ui:*`、真实 SSH/Provider、发布、上传；不把未执行项宣称通过。

## 并发与验收分层

- 当前串行；前置：TASK-0153, TASK-0148。条件支持并发的独立路径与 Worktree 规则见 PLAN-0014，未授权时不派 Agent。
- 保留 VERIFY-0013 的 WIP；与 TASK-0147 冲突处先对照，不覆盖、不夹带提交。共享 release notes 在集成时追加。
- 工程验证：未执行；技术评审：待源码/合同自审；集成：pending；人工功能验收：待用户；发布：未授权。
- 完成时填写实际 diff、保留/拒绝项、测试证据、提交及用户验收操作；任务清单不能代替交付。

## SSH 专项拆分

远端 names/ignoredDirectories 底层与公共接线单独归 TASK-0167，本 Task 等待其交付后消费，不重复实现该能力。这里原有宽 write_paths 是 draft 候选，正式开工缩为脚本面板实际消费者。

## 交付记录（2026-10-03，TASK-0196 批次）

- 实际修改（上游 7a7af9cea → 1e7071c0e → 7fdc02a06 → 7910ce57f 按依赖序适配）：
  - 7a7af9cea：终端初始载荷（parse/claim/toTerminalLaunchPayload）、TerminalSurface 载荷消费与 label、BottomPanelLeaf 传 payload/terminalAvailable、open-tab 携带 payload；本仓底部面板是单例 atom scope（非上游 atomFamily），tab-commands 按本仓模型重写；集成测试 happy-path 因上游测试绑定 atomFamily 模型，改写为布局级等价断言（载荷落格 + reveal 激活），拒绝路径两条保留原样。
  - 1e7071c0e：plugin-sdk openTerminal/revealInstance 合同 + terminal.run 权限（高风险）；宿主 PluginBottomPanelSlot 桥接（缺权限抛错）；RegisteredBottomPanel.terminalAccess 由 LoadedPlugin.grantedPermissions（新增快照字段）判定；权限中英文案与描述、手册 permissions.md 专章；Plugin API 2.10.0 / plugin-sdk 0.3.12（本仓 2.9.0 已被文件名筛选占用，版本线独立顺延）。
  - 7fdc02a06：presets/scripts 系统插件全量（发现/过滤/解析/模型 + 面板 + 测试 + vite/vitest 配置），plugin.json 品牌改 Open Forge、pluginApiVersion ^2.10.0；tenants.json 两处登记；vitest 下界按门禁要求 ^4.1.11。
  - 7910ce57f：瀑布流布局终态（ProjectCard 防拆列 + 骨架），面板断言按终态 UI 调整（描述进 title）。
- 实际运行：scripts 插件 15/15（test + check）；desktop 受影响域 614/614；plugin-sdk 69/69；完整 check 通过（含 context-boundary、权限清单 i18n、manual-coverage 手册钉子）。
- 未运行及原因：真实终端实机交互（PTY/远程 SSH 终端）不做实机验证；由 TerminalSurface 既有终端族测试与载荷合同测试覆盖。
- 剩余风险：terminalAvailable 由「终端定义存在」近似（上游语义相同）；scripts 插件在真实 monorepo 的扫描性能未实测（names 筛选已避免无关文件占满上限）。

### 人工验收实测（2026-10-08，VERIFY-0017 组二；保持 verifying 待裁定）

方法：隔离 Debug profile `04987e4e` 真实 UI 驱动 + 临时夹具项目（在本 profile 已注册的 `fixtures/git-literal-paths` 内加入 `package.json`(scripts `hello`/`second`) 与 `Makefile`(`build`/`deploy`)，验收后删除）+ 逐条复跑声明的套件。截图 `0158-scripts-panel.png`、`0158-scripts-panel-2.png`；原始读数同目录。

| 子句 | 本次结论与读数 |
|---|---|
| 大仓库 limit 后 manifest / 旧 helper / 非法名字 | **成立（走 TASK-0167 的证据）**。这三条按本 Task 自己的拆分条款「远端 names/ignoredDirectories 底层与公共接线单独归 TASK-0167，本 Task 等待其交付后消费」属底座面：`ssh-transport` 18 文件 / **205 例全绿**（含真 shell 的「上限只算命中项」用例）、`capability-sdk` 21 文件 / **91 例全绿**（`filesystemBaseNameType` 拒分隔符与 `.`/`..`）。消费者侧另有本插件 `discover.test.ts`「旧宿主忽略 names、列出全部文件时照样只认清单文件」。 |
| 本地插件入口 | **成立（真实 UI）**。会话底部面板「打开底部面板」→ 出现 `终端` 与 **`脚本`** 两个页签（`tenants.json` development 租户加载）；页签内含 `脚本` 面板：搜索框、若干分组卡片 `scripts-panel-fixture` / 路径 `./` / 包管理器 `npm`、`hello` `second` 两个 package script、`build` `deploy` 两个 Make 目标。**点 `hello` 后真实终端拉起**，工作目录即项目根，输出 `> hello` / `> echo hello-from-fixture` / `hello-from-fixture` ⇒ 发现→授权→开终端→执行→回显全链通。 |
| 同脚本不重复启动 | **成立（真实 UI + 测试）**。全程底部页签恒为 `脚本` + 单个 `hello`，连点两次脚本**没有出现第二个终端页签**；`ScriptsPanel.test.tsx:89`「再点同一个脚本切回它的终端；终端被关掉后重新开；行尾按钮总是新开」断言 `openTerminal` 只调用一次、随后走 `revealInstance`。 |
| 权限拒绝 | **仅测试级**。`ScriptsPanel.test.tsx:121`「宿主拒绝开终端（如缺权限）时把原因显示出来」断言 alert 文案含 `Plugin permission denied: terminal.run`。真实「缺权限」形态未在 UI 构造——需摘掉该插件的 `terminal.run` 授权并重启实例，会打断并行会话，本轮未做。 |
| 重新打开只恢复布局 | **测试级成立 + UI 部分观察**。底部面板域与布局/持久化 store 合计 11 文件 / **113 例全绿**（含载荷落格、reveal 激活与布局恢复）。UI 侧观察到面板跨多轮探针一直保持 `脚本` + `hello` 页签、终端会话未被重跑；但**未找到关闭该底部页签的可见入口**（截图里 `×` 位置点击无效），所以「关→再开」的完整往返没有在真实 UI 里驱动成功。 |
| SSH 入口 | **未做**（任务边界「不连接真实主机」）。远端语义由 TASK-0167 的本地回环（真实 bash 走 service→remote→exec）覆盖，非真实主机。 |

- **实测新发现（已立案）**：脚本面板首屏有 3 处未本地化文本——计数显示字面量 `共 {{count}} 个`、卡片徽标 `card.root`、分组标题 `CARD.SCRIPTS`。根因两种：`locales/{zh,en}.json` 缺 7 个 key（`card.*` 4 个 + `search.clear` + `action.dismiss` + `state.error.title`），且 `summary` 的插值参数名与调用点不一致（组件传 `projects`/`scripts`，文案写 `{{count}}`）。横向比对 16 个预设插件**只有本插件 MISSING 非空**；本插件 15/15 单测全绿是因为测试把 `useTranslation` mock 成回显 key，从不读 locale 文件。详见 [BUG-0081](../../bugs/BUG-0081-scripts-panel-missing-locale-keys.md)。
- 未覆盖（不宣称通过）：真实 SSH 主机入口（任务边界）；真实「缺 `terminal.run` 权限」交互；底部页签「关→再开」的真实 UI 往返；scripts 插件在真实大型 monorepo 的扫描性能。
- 关闭建议：功能面（发现、分组、过滤、开终端执行、不重复启动）**在真实 UI 成立**，权限与布局两条由既有 113+15 例兜住 ⇒ 倾向闭合 `done`，并把 BUG-0081 作为独立的文案层欠账另行处理。按 VERIFY-0017 约定等用户裁定。
