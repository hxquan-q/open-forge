---
id: TASK-0482
type: task
status: verifying
priority: P1
owner: desktop
requirement: REQ-0033
plan: PLAN-0031
source: user-request-2026-11-10
related_requirement: [REQ-0033]
related_plan: [PLAN-0031]
related_tasks: []
related_issues: []
related_bugs: [BUG-0183]
execution: serial
branch: task/TASK-0482-computer-use
worktree:
base_commit: dafb0520d15c6cf29403f56aa6c41a567a1f942f
read_paths: [apps/desktop, packages, scripts, docs, project]
write_paths: [apps/desktop, packages/coding-agent, packages/theme-ui, packages/theme-sdk, scripts, docs/adr, project, .github, bun.lock, tsconfig.json, NOTICE]
exclusive_paths: [apps/desktop/src/main/computer-use, apps/desktop/src/renderer/domains/computer-use]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-10
updated: 2026-11-12
---
<!-- Copyright The Open Forge contributors. -->

# Windows 电脑操作：随包后端与产品闭环

## 目标、范围与归属

落实 REQ-0033 / PLAN-0031：安装 Windows x64 版本后无需另装或配置 Python/winhands/MCP；独立电脑操作入口、按对话授权、观察和输入分离、暂停/接管/结束、Vetta 显隐置顶、目标窗口隐藏和找回。归属 **Open-Forge-only**；裁剪后的 WinHands 原语保留 MIT 许可与来源哈希。

不做虚拟机/独立桌面，不替换 browser_tab，不宣称任意 Python 或窗口选择是系统沙箱。不修改主仓/工作区之外文件、用户既有 winhands、用户级 MCP/Claude 配置；不操作项目远端、不发布。真实 Desktop、真实桌面和付费 Provider 未获单独验证授权，未用于测试。

## 执行合同

- 当前会话是唯一写入 Coordinator，主仓主检出串行实施，独立本地分支；不新建独立 Worktree，不合并其他分支。
- 输入：宿主提供的真实 runtime session、用户选择的窗口与权限、严格结构化工具动作。输出：主进程权威状态、工具文字/图像结果、原子窗口找回台账。
- 一个 Vetta 实例内只能有一个授权控制会话；其他桌面自动化/远程输入工具不受此仲裁，应避免同时运行。
- 测试使用假的 OS/进程边界和受控同步点；实际文件夹具只写主仓或工作区专用临时目录。完整独立 CLI 测试要求夹具在主仓外，因此其临时目录放在授权工作区内，未写系统临时目录或真实用户状态目录。

## Given / When / Then

1. Given 无系统 Python 的 Windows x64 安装，When 开启电脑操作，Then 使用随包私有后端；缺失或损坏资源阻断正式打包或明确不可用。
2. Given 当前对话和已打开应用，When 开启→选择→仅观察授权→观察→允许操作→执行→隐藏/恢复→结束，Then 连续状态一致；观察权不执行输入，恢复查看不结束授权。
3. Given 已隐藏目标或无 UIA pattern，When 请求必须前台的动作，Then 不自动前置或物理回退；用户显式调整窗口/授权后才可继续。
4. Given 排队/在途动作，When 暂停、接管、撤销或结束，Then 旧动作失效，必须确认停止与 held-input 释放才交接；观察引用在交接后失效。
5. Given Vetta 隐藏或恢复记录跨重启，When 托盘/快捷键/页面找回，Then 可停止和恢复匹配原实例且仍隐藏的窗口，不重置用户已自行恢复的窗口。
6. Given 当前对话不同于实际 owner，When 打开页面，Then 分开显示授权草稿与实际 owner，旧授权未结束前禁止新授权；优先显示实际会话名，无名称时提供稳定标识。

## 实际实现

- `packages/coding-agent/src/features/computer-use/`：TypeBox 工具合同与可选宿主函数；动作走既有风险/审批装配，观察 L0、输入 L3，执行面 exclusive。不新增 Agent Loop。
- `apps/desktop/src/main/computer-use/`：主进程控制器、私有 StdioMcpClient、完整资源验证、会话所有权/取消、窗口台账、Vetta 显示让位和系统快捷键生命周期。薄 IPC 绑定主窗口顶层 frame，preload 保持现有 host access gate。
- `apps/desktop/native/computer-use/`：固定原始哈希的 WinHands 0.4.1 原语、自有有限 MCP worker、UIA 执行器、Win32 窗口/截图/输入冲突保护。没有上游任意 run、shell、程序启动、用户技能或 memory 加载。
- HWND 身份额外绑定随窗口销毁的 property nonce；UIA 元素检查实时顶层窗口归属，坐标使用截图本地坐标并验证时间、位置与画面摘要。后台截图没有屏幕像素回退；已隐藏 owned dialog 通过宿主台账继续跟踪。
- `resources/computer-use`：335 个已核验文件，包含 CPython 3.12.10 embed、uiautomation/comtypes/Pillow 和许可；构建与运行时共用 `src/shared/computer-use-backend.json` 的必要文件合同。资源和下载缓存被忽略，不提交二进制。
- `/computer-use` 侧栏更多/置顶入口；Desktop 连接层 + theme-ui 纯视图，zh/en i18n；托盘与可配置系统停止/唤回键。主窗口隐藏不等于停止；前台物理输入时可见 Vetta 窗口临时让位且不抢焦点恢复。
- Windows `prepare-pack.js` 强制准备、核验并作为 asar 外资源分发；开发构建使用相同准备入口。非 Windows 不启用后端。
- 用户文档：`apps/desktop/docs/computer-use.md`；决策：[ADR-0154](../../docs/adr/0154-windows-computer-use-bundled-backend.md)。

## 验证证据

### 最终候选通过

- 桌面定向：12 文件 **85/85**，覆盖新页面/真实控制器连续操作、授权错配、停止等待、显示恢复、台账、系统键、IPC、生产函数源及旧导航/快捷键消费者。
- Agent 合同与审批 + Desktop 打包合同：4 文件 **18/18**，包括工具图片/取消、L3 拒绝不执行与观察不审批。
- 原生合同：`bun run --cwd apps/desktop test:computer-use-native` **20/20**，假 Win32/UIA/Input 边界；包括 hwnd 复用、序列化句柄、owned dialog、UIA 重挂载、过期画面、用户接管、输入释放、MCP 停止回执与诊断输出隔离。
- 资源构建：`node --test apps/desktop/scripts/prepare-computer-use.node-test.mjs` **6/6**；含缺必要依赖、损坏/额外文件、下载完整性及跨平台隔离。
- `verify:computer-use`：真实随包 Python/Pythonw 与依赖导入、实际私有 MCP 握手、非法请求拒绝、停止及退出成功；未枚举窗口、读取屏幕或注入输入。
- 最终 `bun run check` **exit 0**：格式、全仓类型和架构/Project/声明头等守卫通过。
- `coding-agent build`、Desktop `build:main`、`build:preload`、`build:renderer` **全部 exit 0**；未启动用户实例。

### 全量影响面未全绿，不能冒称通过

完整 `test:changed` 实际运行 7 个包：kanban 102、theme-ui 251、xianxia 1、runtime-desktop 59、cli-host 239 均通过。coding-agent 1692 通过 / 2 失败；Desktop 6415 通过 / 2 失败。Desktop 中本次新增系统快捷键导致的严格目录断言已更新并定向复验通过，保留完整旧目录项和权限会话路由断言。

剩余三个失败与本次实现无关，且在首轮尚未接入完整功能时已出现：

1. `coding-agent/test/resource-loader.test.ts`：临时夹具位于授权工作区，父目录 AGENTS 被正确读入，而断言假设没有父目录指令。未为跑绿而写到授权范围外。
2. `coding-agent/test/runtime-core/coding-tools-feature.test.ts`：`spawn rg ENOENT`；本机 rg 是 Claude 的 shell 包装函数，不是 Node 可启动的系统 rg 可执行文件。未安装全局工具或修改系统 PATH。
3. `desktop/src/main/plugins/remote-command-runner.test.ts`：既有非零退出码用例得到 0。未修改远程命令实现或放宽断言。

独立 `theme-ui verify:purity` 还报告既有 `PreviewErrorBoundary` 缺少导出；脚本和根 index 与基线无 diff。新视图无 desktop 私有依赖，但该包级脚本整体不能报告通过。以上未用 waiver、忽略或删检查掩盖。

## 独立审查

- 第一轮基础控制器独立审查 aa38211a3a4757389：3 个真实问题先红后绿（停止未确认绕过、取消正常返回跳过释放确认、恢复后的旧窗口列表）。
- 原生审查 ae421ac1dd6193396：窗口 nonce、owned dialog 前台/命中、write-ahead 未实际隐藏恢复均已按失败用例修正；复核追踪的弹窗复用竞态已在每次发送前验证完整实例，并获只读确认闭环。
- UI 审查 a8ed1f9d605911fcd：授权草稿/实际 owner 混淆已分开展示、阻止错配授权，并补实际名称/稳定标识；复核确认闭环。
- 自查补充了序列化 HWND、UIA 实时顶层归属、隐藏弹窗台账、两次调用间交接清除引用、停止时关闭后端与完整依赖合同；均有自动化覆盖。

## 验收与发布

- 实现完成，状态 **verifying**；用户尚未人工验收，不设 done。
- 独立分支本地候选；不合并 main/chenxvhua，不 push/pull/fetch 项目远端，不发布。
- 当前 manifest 0.1.4 已发布，未修改其发行说明；待发碎片位于 `.github/release-notes/fragments/v0.1.5/task-0482-computer-use-foundation.md`，由后续正常发布流程汇编。
- 未执行真实 Desktop/桌面/模型、具体软件隐藏兼容、DPI/多屏/UAC 或完整新安装包人工体验；这些不能由假 OS 合同或生产构建替代。
- 「允许继续」只恢复本功能授权，不自动创建模型回合；AI 已结束时回对话发送继续。动作期间提供真实输入冲突保护，直接修改应用前建议先明确接管。其他自动化输入不受当前实例仲裁。

验收入口：重启使用本分支构建的开发版后，从侧栏更多打开电脑操作，选应用和实际对话、先观察再授权操作，验证隐藏/恢复、托盘停止、主窗口置顶让位与任务结束找回。安装包无需另装 Python/winhands 的源代码和布局合同已实现；尚未发布供下载的新安装包。

## 权限历史与整洁

2026-11-10 原自动权限模式曾拒绝源码导入及临时文件清理；用户随后明确切换可审批模式，受限原语提取成功。已装 winhands 始终只读。曾下载的官方 Python ZIP 已成为有校验的构建缓存，不是未使用残留；源代码不包含开发机 G 盘路径。全量验证专用目录 `D:/Coding/WorkSpace/Vetta/.task-0482-verification-qM1k4p` 已检查路径身份及67个顶层夹具/缓存项后删除；未清理其他工作区文件。

## 验收反馈：开发态后端资源定位

- 来源：2026-11-11 用户在 `apps/desktop` 执行 `bun run dev` 时，开启电脑操作提示 `backend_not_bundled`；见 [BUG-0183](../bugs/BUG-0183-computer-use-dev-backend-resource-path.md)。
- Given：标准开发启动已将随包后端准备到 `apps/desktop/resources/computer-use/`；When：用户在开发态开启电脑操作；Then：开发主进程应从 `process.cwd()/resources/computer-use` 找到后端并刷新窗口列表。
- 修复范围：仅调整开发态后端资源根路径，并覆盖开发态和打包态路径选择；保留打包态 `process.resourcesPath/computer-use` 路径及资源完整性校验。不调整 UI、随包资源合同或启用授权流程。
- 验证：路径选择回归先红后绿（2/2），相关电脑操作测试 31/31，`check:quick` 和 `bun run check` 通过；未运行真实 Desktop，等待用户重启 dev 态验收。

## 2026-11-11 用户决策：全局桌面操作

- 范围调整：用户要求移除窗口选择、窗口身份绑定及按观察/后台/前台划分的操作权限；授权当前对话后，工具直接面向全局桌面，允许在没有目标窗口时观察桌面并通过全局输入打开应用。
- 保留：开启/关闭、当前对话授权、暂停/停止、停止回执与输入释放、Vetta 主窗口显隐/置顶、旧版本已隐藏窗口的找回兼容。
- 移除：目标窗口选择、动作风险审批、observe/background/foreground 权限档、用户输入自动接管、目标窗口隐藏/恢复新操作及应用/终端限制。基本参数结构校验和进程/按键释放属于功能正确性，不作为用户审批限制。
- 工具面：按 observe/click/press/type/scroll 拆成顶层 object schema，保持 Responses 兼容；全局截图允许基于当前桌面启动尚未打开的应用。
- Given/When/Then：开启电脑操作并授权当前对话后，即使目标应用尚未运行，AI 也能观察桌面、通过全局键鼠启动应用并继续操作；用户暂停或停止后，不再接受新动作，停止需等待后端确认并释放输入。
- 验证范围：代表性连续流程覆盖授权当前对话→全桌面观察→打开应用→键鼠输入→暂停/停止；原生测试使用 fake Win32 与虚拟屏幕，不操作真实桌面。
- 已运行：Coding Agent 定向测试 26/26、Desktop 定向测试 31/31、原生后端合同 14/14、后端资源打包合同 6/6；coding-agent 构建通过；改动 TypeScript Biome 检查通过。
- 未运行：全量/大规模测试、`test:impact`、完整 `bun run check`、真实 Provider/Desktop；由用户按本次内存约定手动完成。`check:quick` 已运行，Biome 通过，但 guard 被存量过期 WAIVER-0011/0012 阻断。
- 执行：单条串行任务；不运行真实模型、真实桌面或 `verify:ui:*`。
- 续接：2026-11-12 用户明确授权本次全局桌面改造；全量/大规模测试依用户要求由用户手动执行。
