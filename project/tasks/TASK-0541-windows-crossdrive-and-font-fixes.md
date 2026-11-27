---
id: TASK-0541
type: task
status: verifying
priority: P2
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 7d18a5f63
read_paths: []
write_paths:
  - apps/desktop/src/renderer/shared/theme/themes/default.ts
  - apps/desktop/src/renderer/styles.css
  - packages/plugins/presets/vetta-ui-design/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# Windows 两项修复：设计引擎跨盘画布空白 + 界面字体显式指定 Segoe UI/微软雅黑

## 合同

- 来源与目标：上游 0.6.31→0.6.32（`314065cac..f977794b3`）增量分诊出的两个可移植修复 `59f124232`（跨盘画布空白）与 `168a38bb2`（Windows 字体发虚）；其余增量为发版流水与像素插画外观项。
- 输入 → 输出：上游两提交 → 本仓等价行为：①Windows 上设计文件与引擎不同盘（如 D 盘）时 UI 设计画布正常渲染截图；②Windows 界面英文用 Segoe UI、中文用微软雅黑，Mac 不变。
- 做 / 不做：只做这两项；不移植像素插画外观项（`0357d928d`/`930580a72`/`a0afcfedc`，纯装饰且无缺陷，另行拍板）。
- Given / When / Then：
  - 引擎在 C:、设计在 D: → frame 表经 `virtual:vetd-frames` 以 `@design` 别名绝对路径导入，入口不再 `import.meta.glob` 出跨盘相对路径，画布不空白。
  - frame 新增/删除 → 失效的是虚拟模块本身，新 frame 不再一直 "Frame not found"。
  - Windows 桌面端任意界面 → 字体栈显式含 Segoe UI / Microsoft YaHei UI，不退回通用 sans-serif。
- 验证：`engine-cross-drive.test.ts`（上游移植）；fonts.test/FontSettings 定向；`bun run check`。
- 人工验收：不适用（缺陷修复，行为对照明确）；工程完成标准为移植到位且检查全绿。

## 交付

- 实际修改与验证：
  - 跨盘修复：新增 `engine/plugins/frames.mjs`（`virtual:vetd-frames` 虚拟模块，`@design` 别名导入）；`vite.config.mjs` 注册 `vetdFrames`；`main.tsx` 两glob 换 `frameLoaders`、layout 查找按 `LAYOUT_FILE` 后缀；`watch-design.mjs` frame 失效目标从 main.tsx 改为 `RESOLVED_FRAMES_MODULE_ID`；`engine-files.ts` 纳入新插件。与上游适配差异：本仓插件已拆分为 plugins/*.mjs 独立文件，常量与工厂放 `frames.mjs`、watch-design 从其导入常量；`vetdFrames` 工厂接受 `designRoot` 参数（上游读模块级变量）。移植测试 `test/engine-cross-drive.test.ts` 2/2 通过。
  - 字体修复：`styles.css` `--font-sans` 与 `themes/default.ts` `FONT_SANS` 显式追加 Segoe UI / Microsoft YaHei UI / Microsoft YaHei（macOS 字体之后）。fonts.test.ts + FontSettings.test.tsx 8/8 通过。
- 评审与集成：主代理自实施，独立 verifier 复查随 TASK-0538 一批进行。
- 未运行与风险：未在 Windows 真机验证画布与字体渲染（上游自述同样未真机验证字体）；vite 引擎接缝以静态文本断言锁定（上游同口径）。
- 发布：release fragment 一个（两项用户可感修复）。
