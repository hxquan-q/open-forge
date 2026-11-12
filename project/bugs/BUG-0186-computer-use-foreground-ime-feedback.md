---
id: BUG-0186
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

# 电脑操作回执与观察缺少前台窗口、IME 状态，模型无法识别键盘空转

## 用户流程

- Given：Windows 全局电脑操作已开启并授权当前对话，中文 IME 开启，AI 想通过桌面图标打开应用。
- When：AI observe 后尝试按字母选中图标、取消预编辑或切换输入语言，再继续观察和输入。
- Then：每次成功动作与 observe 文本均给出采样时前台窗口标题、进程 exe、前台线程默认 IME 的 open/closed/unknown 状态，供模型判断是否应改用坐标点击、click→type 或运行对话框路径。

## 实际行为

用户黑盒复测出现 3 分 37 秒「按名称定位图标→按 P→取消 IME 预编辑→切换输入语言」循环，全程零坐标点击。动作只回复通用成功提示；截图与 observe 文本不提供实际前台和 IME 状态，模型无法从回执发现输入方向或输入法问题。

## 期望行为

只增加信息反馈，不改变全局桌面授权或输入路由。动作结束时及观察时重新读取前台窗口与默认 IME 状态；读不到时标明 unknown，不缓存旧状态、不把无法查询误报为 IME 关闭，也不把反馈查询失败当成已完成动作失败。前台快照不等同于历史按键接收证明，也不表示控件焦点或预编辑内容。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：Windows 11 x64；主仓 TASK-0482 全局桌面分支；2026-11-12 用户黑盒报告。
- 失败测试/CI 用例与命令（若适用）：随包 Python 执行 `-I -B -m unittest discover -s apps/desktop/native/computer-use -p test_executor.py`（`-s` 实际使用绝对路径），旧实现 14 项测试出现 9 个子场景断言失败，均为缺失前台/IME 反馈；随后 `test_windows.py` 的 10 项新增测试在旧适配层出现 1 个失败、11 个子场景错误（缺少查询方法/API 绑定），原有 4 项通过。
- CI run URL 与脱敏后的关键输出（若适用）：不适用，本次仅本地验证。
- 基线对照或重跑结果：修复后 `bun run --cwd apps/desktop test:computer-use-native` **31/31 通过**（Executor 15、Windows 14、Server 2）；另有新增查询期间取消的 2 个红灯子场景修复后通过。全部为可控 OS/Input 替身，不操作真实桌面。

## 最小复现

1. 中文 IME 开启时，授权 AI 在全局桌面按字母定位图标。
2. 先 observe，再 press 字母；Windows 根据当前前台/焦点和 IME 状态处理输入。
3. 查看动作与观察文本：旧实现没有前台标题/exe 或 IME 状态，只能靠截图猜测。

## 影响

模型无法识别键盘输入落在意外前台或字母进入 IME 预编辑，容易重复无效动作；本片补齐诊断反馈，不承诺仅靠状态反馈消除所有模型空转。

## 根因证据

- `executor.py` 的 `run()` 成功动作仅返回 `Action completed. Observe the desktop again before the next action.`；`observe()` 只有截图版本、尺寸和原点。
- `windows.py` 没有前台窗口与 IME 查询；现有 `identity()` 包含窗口 nonce 写入，不能直接用于只读反馈。
- `vendor/winhands/inputs.py` 的 `key_input()` 使用扫描码；`executor.py` 的 `type_text()` 使用 Unicode 输入。物理动作前 controller 通过 display yield 隐藏 Vetta，键盘仍由 Windows 当前焦点接收；本次保留这些语义。

## 回归测试

- `test_executor.py`：observe 与全部 4 类成功动作输出前台/IME；按键后采样、再次 observe 更新；unknown 不把已完成动作判错；外部标题 JSON 转义及 70,000 字符上限；状态采样期间取消不返回成功。
- `test_windows.py`：64 位 HWND/消息结果绑定、默认 IME 开/关、无前台、进程不可访问/查询失败关闭句柄、无 IME、消息超时/OS 错误、消失的前台线程、查询期间焦点切换；查询不写 nonce 或显示窗口。
- `test_server.py`：真实私有协议→Executor→Windows 适配层，fake Win32/Input/Pillow 捕获边界；observe→press P→Win+R→type→observe，各步前台与 IME 更新；保留停止回执、held-input 释放与诊断输出隔离的既有测试。

## 修复与验证

- 修复：`windows.py` 新增只读前台采样；复用从 `identity()` 提取的标题/进程映像查询，不触及窗口 nonce。默认 IME 走 `ImmGetDefaultIMEWnd` 与 `SendMessageTimeoutW(WM_IME_CONTROL, IMC_GETOPENSTATUS)`，100 ms 超时、退出/挂起失败和前台切换如实 unknown。`executor.py` 共用格式补入动作成功和 observe 的既有 `text`，查询后复查取消。
- 回执示例：`Foreground now: hwnd=123 title="Document" exe="C:/editor.exe"; IME=open (foreground default IME).` 只表示采样时前台，不证明历史按键接收者或控件焦点；IME open 不是输入语言/转换模式/预编辑内容。
- 测试：随包 Python 直接定向执行与仓库 `test:computer-use-native` 入口均为 **31/31**；后者先按 prepare 脚本核验资源。
- 资源：`bun run --cwd apps/desktop prepare:computer-use` 生成并核验 **334** 文件；另调用 `verifyComputerUseBundle` 并逐字节比较 `worker/{executor,windows}.py` 与 native 事实源，全部一致；resources 是忽略的生成目录，不手改、不提交二进制。
- 检查：限定 11 文件的 `check:quick` **exit 1**，只有存量 WAIVER-0011/0012 过期；其余守卫通过、ratchet `new=0`。Biome 匹配 0 文件（Python/Markdown 不在其支持范围），不能声称 Python lint 通过。已做源码/测试/合同自审，无独立审查。
- 发布碎片：`.github/release-notes/fragments/v0.1.5/bug-0186-foreground-ime-feedback.md`（`## 修复` 一条），经仓库 `fragmentProblems` 校验；manifest 仍为已发布的 0.1.4，不改其发行说明或预先升版。
- 未运行及原因：未改 TS 合同，不触发 TS 测试/增量类型检查；完整 `bun run check` 按本次要求需用户先同意，未运行；全量测试、UI 验证和真实 Desktop/模型均未运行，无相应授权。未宣称模型已停止空转。
- 实机验收：用户重启使用更新 worker 的开发环境后，以中文 IME 开启和意外前台重做黑盒任务，检查 observe 和每次动作回执可读到窗口/程序及 IME，模型遇错能改走点击或运行对话框而不重复空转；不可查询状态应为 unknown。尚未人工接受，保持 verifying。
- 范围不变：不激活窗口、不切换 IME、不改扫描码/Unicode 注入、display/controller、截图/UIA/定位，6d5d10347 / a53adc41c 的修复路径没有改动。
