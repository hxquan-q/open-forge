---
id: TASK-0407
type: task
status: ready
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@001876496b,724655809a,fdc02645c
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014, PLAN-0018]
related_tasks: [TASK-0406, TASK-0408]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree:
base_commit: 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d
read_paths: [packages/plugins/presets/vetta-ui-design]
write_paths: [packages/plugins/presets/vetta-ui-design/engine, packages/plugins/presets/vetta-ui-design/src/canvas, packages/plugins/presets/vetta-ui-design/src/engine/engine-files.ts, packages/plugins/presets/vetta-ui-design/test]
exclusive_paths: []
depends_on: [TASK-0406]
conflicts_with: [TASK-0408, TASK-0409]
integration_status: pending
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 设计画布首屏、卡顿与闪白修复

## 目标

设计画布打开和切换更稳定；从画框内部开始平移/缩放时不中断，保存画布布局不再导致画框整页重载。固定来源见 [PLAN-0025](../plans/PLAN-0025-upstream-mcp-design-adaptation.md)。

## 范围

### 并发评估

- 结论：本批必须串行；执行方式 `serial`，无并行 Task。
- 前置依赖：TASK-0406 的工程交付与集成；属于用户指定顺序，不是 MCP 技术依赖。
- 冲突文件/独占路径：canvas、engine、引擎文件登记与插件测试，和 TASK-0408/0409 的设计能力存在共享状态；实施前复核，不并行写入。
- Branch：`main`；Worktree：当前主工作区，不另拆；集成负责人：Coordinator。
- 集成顺序：0406 → 0407 → 0408 → 0409。

### 做

- 首片固定一帧/多帧夹具，取得旧行为证据、冷启动/热切换基线和 manifest 回写事件记录，确认本仓缺陷后建立 Bug 并关联；每个症状分别判定，不能用一个修复掩盖其他问题。
- 核查外壳/当前 frame 预加载与懒加载揭示路径，减少首个可用画面的阻塞，保留按需加载。
- 排除仅 `design.json` 等 manifest 回写引起的样式扫描/整页刷新，同时保留实际 TSX/CSS 编辑的热更新。
- 栅格替代期间保留 iframe 布局和输入链，透明/停放状态与栅格就绪交接一致；旧栅格、失败恢复不遮住可用画面。新增引擎源文件按 `ENGINE_FILES` 事实源机制登记。
- 输出为三个症状的回归证据与同环境对照；调整必须限定在画布加载与交互生命周期内。

### 不做

不顺带改 Browser/Team/其他面板性能，不改设计格式或来源标记协议，不启动长驻 dev、真实用户实例或未授权的 `verify:ui:*`，不把上游首屏数字作为本仓结果。

## Given / When / Then

- 固定一帧/多帧设计 → 冷启动与热切换各至少 10 次 → 记录首个可用画面的中位数/最大值及原始样本；修复后中位数不高于同环境基线，无新增加载失败。
- 画布含可交互 iframe → 从画框内连续滚轮缩放/平移，再编辑选中元素 → 输入链不中断，画面无空白交接，焦点/选中正常。
- 连续 50 次画布布局/视口 manifest 回写 → 观察导航、load 与 HMR 事件 → 因这些回写导致的 frame 整页导航/重载为 0；修改 TSX/CSS 后仍正确更新。
- 栅格过期或截取失败 → 继续平移、切回实时画面 → 不显示旧内容冒充当前结果，不永久透明，不引入焦点劫持或事件泄漏。

## 必须保持

iframe sandbox、源码来源标记、AST 编辑与骨架保护、帧选择、历史恢复、引擎退出/恢复和热更新合同不变。不能用禁用热更新或长期遮罩解决闪白。

## 测试与验证

- 定向测试：`bun scripts/quality/run-vitest.mjs --run packages/plugins/presets/vetta-ui-design/test/frame-handoff.test.tsx packages/plugins/presets/vetta-ui-design/test/frame-view.test.tsx packages/plugins/presets/vetta-ui-design/test/frame-raster.test.ts packages/plugins/presets/vetta-ui-design/test/frame-activity.test.tsx packages/plugins/presets/vetta-ui-design/test/engine-config.test.ts`。
- 影响面：`bun run test:impact -- packages/plugins/presets/vetta-ui-design/src/canvas packages/plugins/presets/vetta-ui-design/engine`，按变化补引擎恢复/懒加载测试及 `test:changed`。
- 在插件目录运行 `bun run build`，完成代码任务运行根目录 `bun run check`。
- DOM fixture 只能证明状态交接，不能代替真实 iframe 输入链/首屏耗时。实机验证需当轮明确授权，并使用隔离设计与可控环境；未执行时记录限制与待验收步骤。

## 验收分层

- 工程验证：待执行；复现、性能采样与自动化均未运行。
- 技术评审：未执行；重点为隐藏 iframe 生命周期、热更新与旧栅格交接。
- 集成：pending；无功能实现提交。
- 人工功能验收：待验收；需实际画布操作证据。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本的设计画布，含一帧和多帧隔离样例。
- 操作：打开、切换、从 frame 内连续缩放/平移、拖动画框，再编辑文字/样式，保存并重开；追加慢加载与栅格失败场景。
- 预期：画面稳定、输入连续、编辑热更新有效；交付旧/新采样、重载计数和复现步骤。
- 不通过：闪白、滚轮半途失效、首屏退化、旧图遮盖或编辑不刷新。反馈关联原 Bug 与本 Task，保留可重复夹具。

## 交付记录

- 实际修改：仅立项文档；本轮文档验证见 PLAN-0025。
- 未运行：功能测试、性能基线、构建、完整检查及 UI 流程，原因是未实施且未取得 UI 实机验证授权。
- Worktree：本批串行，沿用主工作区，未创建独立 Worktree。
- 剩余风险：本仓构建及 iframe 事件链可能与上游不同，需用三个独立症状的证据判定适配。
- 发布说明：本轮依据见 PLAN-0025；后续只记录实际验证过的修复。
