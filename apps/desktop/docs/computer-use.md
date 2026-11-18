<!-- Copyright The Open Forge contributors. -->
# 电脑操作（Windows x64）

## 使用

Windows 完整安装包自带运行后端，不需要安装或配置 Python、winhands 或 MCP。电脑操作默认关闭；每次重启后需要重新授权。

1. 从侧栏「更多」打开「电脑操作」，也可以将它置顶。
2. 开启电脑操作，核对当前对话并点击「授权此对话」。不需要先打开或选择目标应用窗口。
3. 返回对话下达任务，例如「打开 WSL 终端，在 Vetta 目录启动 Claude CLI 并发送问候」。AI 可以先观察全局桌面，再用开始菜单、Win+R 等键鼠操作启动尚未运行的应用。
4. AI 通过 `computer_observe`、`computer_click`、`computer_press`、`computer_type`、`computer_scroll` 操作桌面。点击与滚动坐标取自最近一次桌面截图；界面变化后重新观察。
5. 可随时暂停、继续或停止。停止会等待后端结束并释放按键；停止快捷键与托盘入口可用于隐藏主窗口时的控制。

## 桌面控制

- 操作针对整个 Windows 虚拟桌面，不绑定单一窗口，也不区分前台/后台权限档；可以操作已打开的任意应用，或先通过桌面输入打开应用。
- 本功能不做逐动作审批，不要求应用白名单，也不禁止操作终端。
- 主窗口显隐与电脑操作状态独立；主窗口隐藏后可通过系统托盘或配置快捷键唤回、暂停或停止。置顶主窗口会在物理输入期间临时让位。
- 停止时会恢复旧版本遗留的隐藏窗口恢复记录；全局操作路径本身不会隐藏目标应用。
- 工具操作本机真实桌面，不是操作系统沙箱或独立虚拟桌面。

## 开发与验证

在主仓中：

```bash
bun run --cwd apps/desktop prepare:computer-use
bun run --cwd apps/desktop test:computer-use-native
bun run --cwd apps/desktop verify:computer-use
```

资源写入 `apps/desktop/resources/computer-use/`，依赖下载缓存位于同级 `computer-use-downloads/`，均不提交。开发启动和 Windows 打包会自动准备资源；Windows 打包必须通过哈希与完整性验证，不能静默产出缺少后端的安装包。运行时完全不联网安装依赖。

`verify:computer-use` 只验证随包解释器、依赖导入、私有 MCP 握手、非法输入拒绝和停止回执，不观察真实桌面或注入输入。真实桌面兼容性、DPI/多显示器、具体软件和完整安装体验需由用户另行验收。

依赖锁与原始来源哈希在 `native/computer-use/dependencies.json`；许可随 `Resources/computer-use/licenses/` 及原样 wheel 的 dist-info 文件分发。架构见 [ADR-0154](../../../docs/adr/0154-windows-computer-use-bundled-backend.md)。
