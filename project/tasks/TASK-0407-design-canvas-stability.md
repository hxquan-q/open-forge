---
id: TASK-0407
type: task
status: verifying
priority: P1
owner: coordinator
requirement: REQ-0008
plan: PLAN-0025
source: user-request; openvetta/open-vetta@001876496b,724655809a,fdc02645c
related_requirement: [REQ-0008]
related_plan: [PLAN-0025, PLAN-0014, PLAN-0018]
related_tasks: [TASK-0406, TASK-0408]
related_issues: []
related_bugs: [BUG-0155]
execution: parallel
branch: task/TASK-0407-design-canvas-stability
worktree: ../open-forge-wt/task-0407-design-canvas-stability
base_commit: 6ebd359b567da1ac46e37327c5178bc9c53fca50
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

- 结论：按用户新指令使用独立工作树；`execution: parallel` 允许隔离工作树，代码依次实施，不并行写入。
- 前置依赖：先完成 TASK-0406 的工程候选，再实施本项；二者无源码依赖。主工作区存在其他会话修改时保留候选，最终按 0406 → 0407 顺序集成。
- 冲突文件/独占路径：canvas、engine、引擎文件登记与插件测试，和 TASK-0408/0409 的设计能力存在共享状态；实施前复核，不并行写入。
- Branch：`task/TASK-0407-design-canvas-stability`；Worktree：`../open-forge-wt/task-0407-design-canvas-stability`；集成负责人：Coordinator。
- 集成顺序：0406 → 0407 → 0408 → 0409。

### 做

- 首片固定一帧/多帧夹具，取得旧行为证据、冷启动/热切换基线和 manifest 回写事件记录，确认本仓缺陷后建立 Bug 并关联；每个症状分别判定，不能用一个修复掩盖其他问题。
- 核查外壳/当前 frame 预加载与懒加载揭示路径，减少首个可用画面的阻塞，保留按需加载。
- 排除仅 `design.json` 等 manifest 回写引起的样式扫描/整页刷新，同时保留实际 TSX/CSS 编辑的热更新。
- 栅格替代期间保留 iframe 布局和输入链，透明/停放状态与栅格就绪交接一致；旧栅格、失败恢复不遮住可用画面。新增引擎源文件按 `ENGINE_FILES` 事实源机制登记。
- 输出为三个症状的回归证据与同环境对照；调整必须限定在画布加载与交互生命周期内。
- 为真实 Tailwind/Vite 回归抽出主题源注入插件并登记模板，不新增依赖；DOM 测试禁止 iframe 实际导航到本机固定端口，避免接触用户实例。
- 2026-10-28：TASK-0406 的定向 33 例、影响 65 例及完整检查通过，跨包回归与最终审查收尾；本项独立工作树已建立，先进入旧行为取证。主工作区的其他会话改动不作为基线。

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

- 工程验证：局部回归及插件全包 117 文件、763 例通过；插件类型、构建和完整根检查通过。真实首屏/输入指标未验收，不以 DOM 证据替代。
- 技术评审：独立只读 `/root/canvas_final_review` 发现原子写临时文件漏排，补正常保存链回归并修复后复审，无新阻断。
- 集成：pending；代码候选 `dd7feffcdda257047fadbd6c006d5b84c835a7a0`，尚未合入 main/推送；最终仍按 0406 → 0407。
- 人工功能验收：待验收；需实际画布操作证据。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：未来候选版本的设计画布，含一帧和多帧隔离样例。
- 操作：打开、切换、从 frame 内连续缩放/平移、拖动画框，再编辑文字/样式，保存并重开；追加慢加载与栅格失败场景。
- 预期：画面稳定、输入连续、编辑热更新有效；交付旧/新采样、重载计数和复现步骤。
- 不通过：闪白、滚轮半途失效、首屏退化、旧图遮盖或编辑不刷新。反馈关联原 Bug 与本 Task，保留可重复夹具。

## 交付记录

- 实际修改：首屏只预载公共外壳和当前帧，其他帧继续懒载；预载拒绝沿原错误边界处理。同一个 iframe 在手势中透明停放、栅格未就绪时仍可见；失败栅格不再覆盖实时内容，手动重试成功前保持活体，过期截图不采用。
- 保存：根 `design.json` 与真实 `design.json.tmp-*` 同时从 Tailwind/文件集合/事件扫描排除；嵌套同名 JSON、TSX/CSS 编辑和新增帧继续生效。生产和夹具共享抽出的主题源/watcher，三个新增 helper 均登记 ENGINE_FILES，未改模板版本、sandbox 或来源标记。
- Red：BUG-0155 记录直接写 50 次更新 59/64 条、iframe display:none、重截失败仍退回旧图的重复失败。审查后的实际 `queuedAtomicWrite` 夹具使一份 temp 存留 120ms（超过生产 60ms），修前仍有 2 条更新，修后为 0；TSX/CSS/新增帧正对照有效。这是 Vite 管线消息证据，不冒充真实浏览器导航计数。
- Green：插件目录 `bun ../../../../scripts/quality/run-vitest.mjs --run --maxWorkers=1`，117 文件、763 例通过（含外壳、位图、HMR、懒载、引擎恢复、历史及 bridge 流程）；此前定向 10 文件 50 例通过。root `bun run test:impact -- packages/plugins/presets/vetta-ui-design/src/canvas packages/plugins/presets/vetta-ui-design/engine packages/plugins/presets/vetta-ui-design/src/engine/engine-files.ts` 选择全包，第一次发现两个失败，修正后以同一全包单 Worker 复验通过，无删断言或跳过。
- 检查/制品：插件 `bun run check`、`bun run build`、根 `bun run check` exit 0。构建产物 vetta-ui-design-0.7.2.vettapkg 的 44 个文件、manifest 入口与三个 helper 嵌入已核对，未上传。Module Federation 首次构建提示 idle-timeout 并保留完整共享导出回退；末次构建完成，不宣称宿主加载已实测。
- 返工：全局禁用测试 iframe 导航使 bridge 的 about:blank 消息链超时，已撤销全局配置，改为两个外壳 DOM fixture 的文件级选项；bridge/history 单独 12 例及全包复验通过。首轮检查缺声明头已补齐，未收缩/放宽既有基线。
- 工作树：`C:/Users/xquan/Desktop/open-forge-wt/task-0407-design-canvas-stability`，branch `task/TASK-0407-design-canvas-stability`，基线 `6ebd359b5`；与 0406 串行写入，主区他人修改保留。
- 未运行：真实 Desktop、跨进程 iframe 连续滚轮/焦点、冷/热各 10 次首个可用画面样本及人工验收，原因是本轮未授权实机 UI 流程。组件对照仅证明普通 lazy 首提交一次 fallback、预载首提交零 fallback，不报告毫秒优化数值；无真实 Provider/用户状态访问。
- 协作：只读调查 `/root/canvas_recon` 定位上游三片与本仓保留点；未参与实现的 `/root/canvas_final_review` 审候选、发现并复审临时文件 P2。具体剩余边界按上述验收包补实机证据，不自动运行 verify:ui。
- 发布说明：候选碎片 `.github/release-notes/fragments/v0.1.4/task-0407-design-canvas-stability.md`；按 WAIVER-0011 保留已发布 0.1.3，待下次 prepare 确认归属并汇编，未发布。

## 2026-10-28 集成指令续接

用户已要求提交推送并合入 main，随后同意纳入当前共享文档。按 WAIVER-0012 在 0406 之后集成并复验全包和完整 check；实机首屏、跨进程输入与人工接受仍保持未验收，不由本次 Git 指令代替。0408/0409 仅提交现有台账，不合入其实现。
