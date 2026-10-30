---
id: PLAN-0025
type: plan
status: in_progress
priority: P1
requirement: REQ-0008
owner: coordinator
created: 2026-10-28
updated: 2026-10-28
depends_on: []
related_requirement: [REQ-0008]
related_plan: [PLAN-0014, PLAN-0018]
related_tasks: [TASK-0406, TASK-0407, TASK-0408, TASK-0409]
---
<!-- Copyright The Open Forge contributors. -->

# 上游 MCP 恢复与设计画布能力适配

## 背景与目标

用户要求按“MCP 重试 → 画布卡顿、闪白修复 → 真实图片素材 → 设计方向与质量检查”立项。本批复用 [REQ-0008](../requirements/REQ-0008-selective-upstream-nonmobile.md)，作为 [PLAN-0014](PLAN-0014-selective-upstream-nonmobile.md) 的增量批次；设计部分与 [PLAN-0018](PLAN-0018-design-plugin-roadmap-v2.md) 关联，不启动该路线图的其他阶段。

本轮交付计划、Task、依赖和验收合同；不实施功能。`ready` 表示范围、责任、验收与依赖明确，不表示实现、集成或人工验收完成。

## 当前事实

- 本仓调查基线：`9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d`；后续实施先检查新 HEAD 与未提交修改，不覆盖其他工作。
- 上游参照固定为 `openvetta/open-vetta` 的 `main@3ecec6b8db906d8d6629a6286b5419b5f9c7e6ce`（v0.5.68）；本批选择 v0.5.65–v0.5.68 的相关能力，不把移动的远端分支当验收快照。
- 知识图谱 `.ua/knowledge-graph.json` 的分析提交为 `254796d870036f0d3e7c0bbb9a0a1a2cbd28448f`，早于本仓基线；已用其定位 MCP 宿主组合、FrameView 与帧栅格模块，再以当前源码和测试核实合同。
- MCP 的 `packages/runtime-mcp/src/server/supervisor.ts` 在候选启动失败后仍更新签名，可能使相同配置的后续刷新被视为无变化；本仓有延迟加载、空闲回收和 generation/lease 机制，需保留。
- 设计插件首屏仍有懒加载路径；`src/canvas/FrameView.tsx` 在栅格替代时使用 `display: none` 隐藏 iframe；`engine/vite.config.mjs` 是核查 manifest 回写触发样式扫描/刷新问题的入口。
- 上述为源码差异证据，尚未执行本仓故障复现或性能基线。TASK-0406/0407 首片须建立旧行为失败证据；确认本仓缺陷后按规范补 Bug 记录并回链，再实施修复，不能把上游修复说明当本仓复现结果。
- 插件已有源码检查、渲染验证、导出、历史资产和来源标记能力；新增素材与设计方向须接入这些合同。`plugin.json` 现有网络域权限不能默默扩大。

### 固定来源与适配判定

| 能力 | 上游证据 | 本批决定 |
|---|---|---|
| MCP 失败后退避重试 | [8d0f6f3c1](https://github.com/openvetta/open-vetta/commit/8d0f6f3c19495227d24816e6a5e51cc7620bd538) | adapt：保留本仓 generation/lease 与延迟加载，失败不伪装成已应用 |
| 首屏、manifest 闪白、iframe 滚轮链 | [001876496](https://github.com/openvetta/open-vetta/commit/001876496b58dee801b482b90a7c1a07e2572a1f)、[724655809](https://github.com/openvetta/open-vetta/commit/724655809a558525ac4182cdab440fc11d341a32)、[fdc02645c](https://github.com/openvetta/open-vetta/commit/fdc02645c) | adapt：分别建立证据，作为画布交互稳定性任务交付 |
| 真实图片搜索、下载与署名 | [fba109edb](https://github.com/openvetta/open-vetta/commit/fba109edb) | adapt：补输入校验、网络权限、授权来源与导出追溯 |
| 设计方向与检查 | [0c6f92be1](https://github.com/openvetta/open-vetta/commit/0c6f92be1)、[aaea7579f](https://github.com/openvetta/open-vetta/commit/aaea7579f)、[3ced70315](https://github.com/openvetta/open-vetta/commit/3ced70315)、[407954608](https://github.com/openvetta/open-vetta/commit/407954608) | adapt：方向选择、主题/字体与诊断闭环；审美判断仍需视觉评审 |

## 候选方案与取舍

1. 整仓合并或连续 cherry-pick：能快速获得上游实现，但会夹带其他版本变化，并可能覆盖 Open Forge 的 MCP 生命周期、设计编辑与安全差异；不采用。
2. 只改提示词：改动少，但无法修复刷新、iframe 输入链，也不能保证素材落盘与检查合同；不采用。
3. 固定来源、分片适配：逐项保留本仓差异，以正常用户流程和回归证据验收；采用。每项可独立回退，新增协议或权限另做合同审查。

## 阶段

| 顺序 | Task / Owner | 前置依赖 | 交付与退出条件 |
|---|---|---|---|
| 1 | [TASK-0406：MCP 候选失败退避重试](../tasks/TASK-0406-mcp-candidate-retry.md) / coordinator | 无 | 相同配置失败后可在退避期后的正常请求恢复；旧可用 generation 与租约不受损 |
| 2 | [TASK-0407：画布卡顿与闪白修复](../tasks/TASK-0407-design-canvas-stability.md) / coordinator | TASK-0406 | 首屏基线与对照、manifest 零整页重载、iframe 起手滚轮链及编辑回归证据 |
| 3 | [TASK-0408：真实图片素材](../tasks/TASK-0408-design-real-image-assets.md) / coordinator | TASK-0407 | 搜索→预览→导入→重开/导出的连续流程，图片文件与许可来源可追溯 |
| 4 | [TASK-0409：设计方向与质量检查](../tasks/TASK-0409-design-direction-quality.md) / coordinator | TASK-0408 | 方向选择→生成→检查→修订闭环，诊断与视觉评审各有证据 |

最终集成按 0406 → 0407 → 0408 → 0409 串行。2026-10-28 用户另行要求创建工作树完成 0408/0409：它们按 0408 → 0409 串行实现隔离候选，不与 0407 共享目录写入；0409 在 main 基线工作树引入已验证的 0408 候选。0407 尚未工程交付时不将后两项强行集成 main，不宣称前置完成。原有 MCP/画布任务及他人主工作区修改保留。

## 不做什么

- 不自动启动实施、真实 Provider、用户正在运行的 Desktop/Agent、长驻 dev 或 `verify:ui:*`；不发布、不推送、不上传制品。
- 不全量同步上游，不移植手机/远程协作，不改品牌、包名、既有 `vetd_*` 工具前缀或独立版本策略。
- 不启动设计插件路线图中的全面协议重构、Figma/评论/原型等其他工作；不使用付费图片 API，不将搜索到的图片视为天然可商用。
- 不以弱化类型、权限、检查断言或删除功能换取通过；不把自动检查通过等同于设计质量已获用户认可。

## 验证与回滚

- MCP 使用本地 fixture 与可控时钟，覆盖正常入口下失败、退避、恢复、配置变化、旧 generation 在途租约、取消与关闭；不连接真实 MCP 服务。
- 画布先固定一帧/多帧夹具，记录冷启动与热切换各至少 10 次的首个可用画面耗时、中位数及最大值，再做同环境对照。首屏中位数不得劣于基线；关键验收还包括连续 manifest 回写无整页导航，以及从 iframe 内开始的滚轮平移/缩放不中断。不沿用上游耗时数字作为本仓实测。
- 素材测试使用离线来源响应与图片样本；验证错误输入、网络失败、大小/格式、许可缺失、来源保留、权限拒绝和导出/历史。真实站点访问与图片许可的最终确认不能由 fixture 冒充。
- 方向与检查使用固定需求、源码和渲染夹具，覆盖新建、已有品牌、缺失字体/占位主题、图片署名与小尺寸画框；真实模型效果和视觉体验作为独立人工验收，不调用真实 Provider 造测试结论。
- 实施各片先定向测试与 `bun run test:impact -- <变更源码>`，按政策运行 `test:changed`，完成代码任务运行 `bun run check`。插件 manifest、工具或引擎构建链变化还需插件目录的 `bun run build`。具体命令与验收步骤见各 Task；本轮不运行这些实施检查。
- UI 实机验证需要当轮明确授权；未获授权时交付隔离自动化证据与可执行验收步骤，如实列出未验证边界。
- 每项以明确路径形成原子提交；回滚只反向撤回该 Task 的提交，不删除用户设计、已下载素材或历史。新增数据采用可选字段/可读降级；若旧版本无法安全读取，先记录迁移/恢复合同再实现。

## 升级信号

- MCP 恢复需要自动重放工具调用、后台轮询、变更公开 port/租约合同，或无法保留本仓生命周期语义。
- 画布无法取得一致复现，优化引入输入/焦点丢失，或本仓基线未改善；保留证据并重新定位，不宣布修复。
- 素材需要全网权限、私网访问、付费密钥，或无可靠授权/署名链；先缩小来源，不能静默放宽边界。
- 方向实现需要重写设计格式、覆盖已有品牌或移除 AST/来源标记保护；另开架构决策与兼容评估。

## 需要的 ADR

本轮仅立项，不新建架构 ADR。局部重试/渲染修复可在 Task 解释取舍；若实施改变网络能力、持久化格式、工具 Schema 或跨包公共合同，则先按工程规则确定 ADR 与迁移范围。

## 立项交付记录

- 实际修改：新增本计划及四个 ready Task，更新需求关联和三个导航索引；无运行时代码改动。
- 文档验证：`bun run scripts/quality/check-project-indexes.mjs` 通过；`bun run scripts/quality/check-task-worktrees.mjs` 通过（401 个 Task、0 警告）；回读六份合同的标题、状态、依赖与必需章节，14 个本地文档链接及 Task 读取路径均有效；`git diff --check` 通过。提交前再检查暂存 diff，确保新增文件也纳入检查。
- 工程实现、运行时测试、技术评审、人工功能验收：均未执行，不计入四个 Task 的工程完成。
- 发布说明：本轮仅登记未来工作。当前 Desktop 0.1.3 已存在 `v0.1.3` tag，依发布说明规则不可改已发布正文；不为立项擅自切换版本或汇编新正文。后续实施在届时未发布版本中按 Task 写入实际交付的碎片。
- 提交与集成：立项文档按本地原子提交交付；四个功能 Task 的 `integration_status` 仍为 pending。发布未授权。

## 2026-10-28 的 0406/0407 实施回执

- 本会话按用户要求建立两个隔离工作树并依次写入，代码候选为 TASK-0406 `d51a45afc`、TASK-0407 `dd7feffcd`；均保留原子提交与独立审查。
- MCP 定向 33、影响 65、全包 84 例及完整检查通过；跨包回归整体红，最近的 CLI 初始化超时在同基线未修改 MCP 的新构建工作树也重现。广域失败尚未全部归因，不集成/推送，不据主仓某次通过或旧时间戳归因。
- 画布全包 117 文件 763 例、类型检查、构建、制品入口/helper 校验与完整检查通过；正常原子保存链包含临时文件慢 rename 的回归，源码编辑与新增帧正对照有效。真实首屏 10 次样本和跨进程 iframe 输入仍待授权验收。
- 两项状态为 verifying、集成 pending；主工作区其他会话的 Task/Plan 修改保留。候选发布碎片暂存在 v0.1.4，WAIVER-0011 仅允许待下次 prepare 归属/汇编，不改已发布 0.1.3。详细命令、返工与验收包见各 Task，不能把本段视为整个计划完成。

## 后续 Git 集成（2026-10-28）

用户要求提交推送并合入 main，且明确允许一并提交当前共享文档；文档批次为 `7e5a73c0b`，已提交的两个 Task 分支已推 origin。按 WAIVER-0012 保留已知跨包红灯，逐项执行 main 补偿验证；当前 0406 已集成、0407 待合并。0408/0409 仅提交现有台账，实现仍在各自候选工作树，未纳入本轮集成。状态继续 verifying，实机/人工接受与发布分开记录。
