---
id: BUG-0184
type: bug
status: verifying
priority: P1
owner: desktop
requirement: REQ-0033
plan: PLAN-0031
source: user-report-2026-11-12
related_requirement: [REQ-0033]
related_plan: [PLAN-0031]
related_tasks: [TASK-0482]
related_issues: []
created: 2026-11-12
updated: 2026-11-12
---
<!-- Copyright The Open Forge contributors. -->

# 电脑操作观察截图与动作输入画面不一致

## 用户流程

- Given：Windows x64，电脑操作已开启并授权，Vetta 主窗口可见。
- When：AI 先观察桌面（observe 截图），再依据截图坐标点击或滚动。
- Then：截图所见面应与动作落点的真实画面一致，点击落在模型看到的目标上。

## 实际行为

observe 不改变 Vetta 窗口显示，全桌面截图包含 Vetta 主窗口；而 click/press/type/scroll 前控制器先 `display.yield()` 把所有可见 Vetta 窗口隐藏、动作后再恢复。模型按「有 Vetta 遮挡」的截图取坐标，点击瞬间 Vetta 被隐藏，原遮挡区域露出模型从未见过的内容，坐标可能落到错误目标；隐藏前台窗口还会切走焦点，`press`/`type` 等无坐标键盘动作的落点变得不确定。用户侧表现为每个动作伴随 Vetta 闪烁，且观察结果对动作而言失真。

## 期望行为

观察面与输入面一致：截图与动作看到的桌面相同。Vetta 在观察时从屏幕捕获中排除（窗口仍显示、截图不含），物理动作维持现有隐藏让位；不支持捕获排除的系统回退为截图瞬间隐藏，两个面仍一致。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：Windows 11 x64（build 26200）；用户 2026-11-12 黑盒复现并报告。
- 失败测试/CI 用例与命令（若适用）：修复前新增的观察面/输入面一致性测试失败——`display.test.ts` 中 `exclude` 相关 4 例（方法不存在）、`controller.test.ts` 中 observe 应调用 `exclude` 而非不处理 1 例。
- CI run URL 与脱敏后的关键输出（若适用）：不适用。
- 基线对照或重跑结果：旧实现 5 failed / 15 passed；修复后 desktop 包 computer-use 相关 9 文件 44 用例全部通过。

## 最小复现

1. 开启电脑操作并授权对话，保持 Vetta 主窗口可见。
2. 让 AI 观察桌面并点击截图中可见的某个目标。
3. 动作瞬间 Vetta 全部窗口被隐藏再恢复，截图坐标与实际点击画面不一致。

## 影响

全局桌面操作的核心闭环（观察→动作）坐标失真，可能点击到错误位置或把键盘输入打进意外窗口；交接文档 §7.4 明确要求观察、坐标与真实输入的画面保持一致。

## 根因证据

`controller.ts` execute 中 `physical = action !== "observe"`，仅物理动作调用 `display.yield()`，observe 截图含 Vetta；后端 `windows.py desktop_screenshot()` 为 `ImageGrab.grab(all_screens=True)` 全屏捕获，不排除任何窗口。截图（含 Vetta）与动作画面（不含 Vetta）系统性错位。

## 回归测试

- `display.test.ts`：`exclude()` 在可捕获排除时对所有窗口开启内容保护且不改变可见性、恢复后关闭；不可用时回退为 yield 隐藏；窗口在排除期间销毁不致恢复崩溃；`captureExclusionSupported` 以 build 19041 为界。
- `controller.test.ts`：observe 调用 `display.exclude` 且不调用 `yield`；物理动作调用 `yield`；两者面一致。

## 修复与验证

- 修复：`ComputerDisplay` 新增 `exclude()`；observe 时对全部 Vetta 窗口 `setContentProtection(true)`（Windows build ≥ 19041 映射 `WDA_EXCLUDEFROMCAPTURE`，捕获中剔除且屏幕可见），截图后恢复；低于 19041 的系统回退为截图瞬间 yield 隐藏。物理动作路径不变。
- 测试：desktop 包 computer-use 相关 9 文件 44/44 通过；`bun run --cwd apps/desktop typecheck:incremental` 通过。
- 检查：`check:quick`（改动文件）lint 通过；`check:guards` 仅因存量 WAIVER-0011/0012 过期失败（与本次无关，ratchet new=0）。
- 未运行及原因：未操作用户真实桌面与运行中的 Desktop；`WDA_EXCLUDEFROMCAPTURE` 实机效果待用户下次黑盒验收（截图应不再含 Vetta 窗口）。
