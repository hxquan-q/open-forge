---
id: TASK-0181
type: task
status: verifying
priority: P2
owner: frontend-apps
requirement: REQ-0009
source: user-request
related_requirement: [REQ-0009]
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
execution: parallel
branch: task/TASK-0181-desktop-font-preferences
worktree: ../open-forge-wt/task-0181-desktop-font-preferences
base_commit: 1e69c213dbd558f341573a841300bc7932d300d3
read_paths: [apps/desktop, packages/theme-ui, packages/ui, docs/dev]
write_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/shared/store, apps/desktop/src/shared/i18n, apps/desktop/src/renderer/domains/settings, apps/desktop/src/renderer/domains/bottom-panel/terminal, apps/desktop/DESIGN.md, project/requirements/REQ-0009-desktop-font-preferences.md, project/research/RESEARCH-0020-desktop-font-preferences-and-licenses.md, project/tasks/TASK-0181-desktop-font-preferences.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/domains/settings/components/AppearanceSettingsView.tsx, apps/desktop/src/renderer/domains/settings/components/useAppearanceSettingsModel.ts, apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.tsx]
depends_on: []
conflicts_with: [TASK-0122, TASK-0123]
integration_status: pending
created: 2026-10-03
updated: 2026-10-03
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 本机字体偏好

## 目标

实现 [REQ-0009](../requirements/REQ-0009-desktop-font-preferences.md)，依据 [RESEARCH-0020](../research/RESEARCH-0020-desktop-font-preferences-and-licenses.md) 提供界面/代码字体选择、预览、保存和恢复默认，终端跟随代码字体。归属 Open-Forge-only；不复制竞品代码，不分发字体文件。

## 范围与并发评估

- 条件支持与无交叉路径 Task 并发；本 Task 内状态、主题、设置和终端紧耦合，单 Agent 串行实现，不派额外 Agent。
- execution 为 parallel 以使用标准隔离 Worktree；先提交来源记录和合同，再由 main 建树。
- Branch：task/TASK-0181-desktop-font-preferences；Worktree：../open-forge-wt/task-0181-desktop-font-preferences。
- 独占上述主题、外观 model/view 和终端表面；共享 i18n/store/发布说明与导航逐路径核对归属。
- 集成负责人：本 Agent；顺序：定向/impact/check → Task 原子提交 → main 合并复验 → 审核待推批次。

### 做

- 界面与代码两项字体，保留现行默认栈；用户主动读取本机字体后可搜索、预览、选择和分别恢复默认。
- Chromium Local Font Access API：unknown 边界校验，只读 family 元数据，不读取字体二进制，不新增依赖、IPC 或权限。不可用/拒绝/失败有反馈和重试，默认始终可用。
- 等宽候选按实际字宽筛选，不靠名称；中英混排与易混代码字形预览。
- 偏好持久化、启动应用、主题切换保留覆盖优先级；写入失败不伪称保存成功。
- 活动终端更新字体、重新 fit/同步 PTY 尺寸；加载完成补测量，不重建 Shell、不丢输出。
- i18n、组件接线/生命周期测试、发布说明；保留系统字体设计基线，仅增加用户本机偏好例外。

### 不做

内置/下载/导入字体、字体上传、商店、跨机同步、独立终端字体、字号/行高/连字配置、原生菜单/外部网页字体、真实 Desktop/Provider 验证。

## Given / When / Then

1. 默认用户打开外观 → 主动读取、搜索、选择界面字体 → 预览与 UI 生效，代码仍等宽。
2. 活动终端存在 → 修改代码字体 → 终端字形/尺寸响应，实例、PTY 和已有输出保留。
3. 保存字体 → 切明暗/配色、模拟重启 → 偏好保留；分别重置恢复当前主题默认栈。
4. 枚举失败/不支持、字体缺失、偏好损坏或写入失败 → 明确反馈且能重试/恢复，不阻塞外观页。
5. 卸载或连续请求 → 不应用过期结果，释放订阅；终端隐藏期间变更能在恢复可见后重新 fit。

## 必须保持

默认视觉、主题/i18n、中文及等宽回退、终端会话和输出、包依赖方向、安全字体名处理，不增加网络/宿主权限或真实状态访问。

## 测试与验证

- 定向：bun scripts/quality/run-vitest.mjs --run 加实际测试路径；先 red 再 green。
- 用户流程：真实偏好存储/主题应用/设置组件，字体枚举/Canvas/PTY 为窄外部替身；证明活动终端不重建。
- 质量：test:impact、编辑轮 check:quick、最终 bun run check；公共影响不明时 test:changed。
- 不运行 verify:ui:*；字体观感、平台枚举与真实终端字符宽度列入人工验收。

## 验收分层

- 工程验证：通过。定向 30 项覆盖相关行为；Desktop 全包 impact 为 4680 passed / 15 skipped / 0 failed，完整 bun run check 通过。
- 技术评审：已自审，未执行独立评审；边界、生命周期、安全和可恢复状态结论见下文。
- 集成：pending。main 存在其他 Task 的未提交代码、索引及发布说明，未合并；实现保留在本 Task 分支。
- 人工功能验收：待验收，状态 verifying；用户“继续”是实施授权，不是对功能的人工接受。
- 发布：未授权；开发集成遵循已有 main:dev 合同。

## 功能验收包

设置 → 外观 → 字体：读取本机字体、搜索并分别选择；切换主题、重启、恢复默认。检查中英文字、代码对齐与活动终端输出；不可用平台可恢复默认并看到说明。

## 交付记录

- 前置：上一轮 4 个未提交管理文件属于本 Task 来源，本轮提交后作为工作树基线。
- 实际修改：本机字体元数据读取与等宽测量、外观页两项选择/预览/搜索/重置、字体偏好存储与主题覆盖、活动终端字体/尺寸同步、设置定位索引、中英 i18n、设计例外和 v0.1.3 发布说明。
- Worktree：标准工具创建成功，bun install --frozen-lockfile 成功；工作树实际路径见 frontmatter。
- 未运行：真实 UI、Provider、发布。
- 剩余风险：浏览器 API 平台支持、等宽测量与中文回退的实机表现待验收。

### 实施中证据

- 主题/存储测试 4/4 通过；设置交互测试 4/4 通过；字体边界测试 4/4 通过。终端回归先复现旧值 monospace 不随 Test Mono 变化，再修复至 host 测试 6/6 通过。
- 新工作树直接定向测试先遇到 ssh-transport/toolkit dist 缺失；按 buildableTestDependencies([desktop]) 清单恢复 24 个测试依赖构建产物后通过，不修改解析/测试规则。
- check:quick 首轮发现三份既有修改文件需补声明头，以及 TASK-0122/0123 的历史发布说明写范围冲突；已补头并登记 conflicts_with。它们的声明工作树不存在，本 Task 仅追加自己的发布条目，集成时串行核对共享说明。
- 字体授权枚举需保留点击激活，因此先发起权限请求；字体测量在 waitForCommittedPaint 后分批进行。依据 https://developer.chrome.com/docs/capabilities/web-apis/local-fonts ，未读取 blob 字节。

### 自审与验证进展

- 自审：设置 View 只消费 model/actions，字体读取及保存由独立 hook 拥有；复用 Select/Input/Button/SettingHeading，不引入公共组件框架或新依赖。字体名校验后以 CSS 字符串转义，列表仅本地使用，无遥测。字体测量分批让出主线程，卸载取消请求并清理计时器；终端保留容器字体覆盖优先级和现有 PTY 生命周期。
- 注册 appearance-fonts 定位入口；registry 测试先失败（缺记录）再通过。定向设置/外观/registry/终端合计 22/22 通过，另有字体存储及元数据边界各 4/4。
- 完整 check 首轮仅测试 i18next 选项 initImmediate 过时，改为当前 initAsync 后通过；最终代码轮次再次完整 check 通过。未改类型规则、检查阈值、超时或断言。
- 全包 impact 初次因新工作树 Electron path.txt 缺失，electron-log 导入失败；取消该轮。Node 安装脚本未生成二进制，改用 bun 执行同一官方 electron/install.js 成功，原失败的 runtime-host-contract 4/4 通过后重跑全包。
- 2026-10-03 主工作区出现其他 Task 的对话排序/Office 预览等未提交改动，不能作为干净集成目标；本 Task 先在隔离分支交付，集成时必须重新核对主树状态，不夹带其它任务。

### 可复核命令与环境

Windows / Bun 1.4.2 / Node 26.3.1；测试使用 Node runner，不启动 Desktop 实例。

- 定向：`bun scripts/quality/run-vitest.mjs --config apps/desktop/vitest.config.ts --run <目标测试路径>`。覆盖 fonts.test.ts、installed-fonts.test.ts、FontSettings.test.tsx、AppearanceSettingsView.test.tsx、registry.test.ts、TerminalSurface.host.test.tsx，共 30 个定向用例；最后一轮对恢复 DOM 替身的改动复跑前三者 12/12 通过。
- 完整质量：`bun run check`，日志 `%TEMP%/openforge-task0181-check-final-lf.log`，退出码 0。版权工具对缺失 upstream/dev 输出诊断后使用既定 pinned baseline，new=0；未修改该基线或检查规则。
- 影响测试实际文件收集与调用（提交前）：

```powershell
$files = @(git diff --name-only -- apps/desktop/src)
$files += @(git ls-files --others --exclude-standard -- apps/desktop/src)
bun run test:impact -- $files
```

选择器因共享状态/i18n 影响回退 Desktop 全包，自动准备 24 个 workspace 依赖；全包日志为 `%TEMP%/openforge-task0181-impact-final.log`。不修改 worker 数量/超时/skip，不将首次环境失败计为通过。

### 人工验收步骤与限制

1. 使用本 Task 分支构建的 Desktop，打开设置 → 外观 → 字体；当前运行的 main 安装包不会因工作树代码自动获得新功能。
2. 点击读取本机字体；若环境提示授权则允许。搜索并选择界面字体，确认预览、正文和输入文字变化，代码不被比例字体覆盖。
3. 打开代码/Diff 与一个终端，再选择代码字体；确认终端会话、已有输出保留，布局没有错位。
4. 切换明暗/配色并重启，确认偏好保留；分别恢复默认，确认回到当前默认字体栈。
5. 枚举不可用/拒绝时应显示说明并可重试，已有偏好和默认仍可用；未发现字体时可重新选择或重置。

未运行 verify:ui、产品构建/打包、真实 Provider 或人工验收（未授权）。字体列表 API 的各系统支持、中文/emoji/终端边框真实观感及完整字形宽度仍需上述验收；等宽候选按样本测量，不宣称完成所有 Unicode 字形认证。不分发任何字体资产，因此本次没有引入 MIT/OFL 字体包许可义务。

### 最终工程结果（2026-10-03）

- 全包影响测试通过：886 个测试文件通过、4 个既有跳过；4680 个用例通过、15 个既有跳过，0 失败。耗时 1334.04s；这不是串行性能基准，不据此推导字体功能的运行时性能。未新增或扩大跳过项。
- 最终完整 check 的 lint/types/guards/mobile-lint 均以 0 退出；类型、格式、包边界、声明头和任务合同检查均通过。字体测试最后只做 LF/文件尾归一化，随后又完成完整 check；不以旧版本检查代替最终检查。
- staged diff 已逐路径核对，只含 TASK-0181 的实现、测试、需求/任务与当前版本发布说明；本次以原子功能提交落在 Task 分支，提交 hash 见该分支 git log。
- main 在收尾时仍有 TASK-0185/0186 等其它工作，按干净集成前置条件保留分支和工作树，不合并、不推送、不清理。导航在本 Task 分支更新为 verifying；main 的导航随未来集成同步，避免夹带其它 Agent 的未提交索引改动。
- 发布说明已写入 v0.1.3 的新增节；未发布、未打包、未人工验收。
