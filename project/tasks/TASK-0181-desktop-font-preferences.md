---
id: TASK-0181
type: task
status: done
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
worktree: unassigned（已集成，待推送后清理）
base_commit: 1e69c213dbd558f341573a841300bc7932d300d3
read_paths: [apps/desktop, packages/theme-ui, packages/ui, docs/dev]
write_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/shared/store, apps/desktop/src/shared/i18n, apps/desktop/src/renderer/domains/settings, apps/desktop/src/renderer/domains/bottom-panel/terminal, apps/desktop/DESIGN.md, project/requirements/REQ-0009-desktop-font-preferences.md, project/research/RESEARCH-0020-desktop-font-preferences-and-licenses.md, project/tasks/TASK-0181-desktop-font-preferences.md, project/tasks/README.md, .github/release-notes/v0.1.3.md]
exclusive_paths: [apps/desktop/src/renderer/shared/theme, apps/desktop/src/renderer/domains/settings/components/AppearanceSettingsView.tsx, apps/desktop/src/renderer/domains/settings/components/useAppearanceSettingsModel.ts, apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.tsx]
depends_on: []
# 发布说明与 0122/0123 的写路径重叠：仅共享 .github/release-notes 归并，按 Coordinator 串行集成登记（另一会话补记）
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-03
updated: 2026-10-08
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

- 实现提交：1ad7dc7bcf4ff9eebf539bcc138feb667206d789（feat(desktop): 添加本机界面与代码字体偏好）；23 个文件，提交前门禁通过，提交后工作树干净。本行是对已完成代码提交的交付补记。

### 后续推送授权与集成检查（2026-10-03）

- 用户明确要求先提交推送，再合入主树。本次额外授权覆盖 origin 的 Task 分支推送；不等于 origin/main 稳定晋升、发布或替其它 Task 提交未验收内容。
- 既有实现与交付记录已提交，工作树干净。执行 `git push --set-upstream origin HEAD:refs/heads/task/TASK-0181-desktop-font-preferences` 成功；`git ls-remote` 核实远端 SHA 为 `d54dfc91d4b4be47741350b39684bd21c5f27eb1`，包含功能提交 `1ad7dc7bc`。本补记也随同一 Task 分支推送。
- 合入前 main 为 `c9db5fa27`，存在其它任务的未提交/已暂存记录：ISSUE-0020、Issue/Research 索引、TASK-0185，以及未跟踪的 RESEARCH-0021、TASK-0186。它们不属于字体实现，不重置、不暂存、不代提交。
- 尚未执行 main 合并；integration_status 保持 pending。须在主树干净后再执行标准合并、集成测试与完整 check；不以 Task 分支的已验证结果冒充合并后的验证。

### 集成记录（2026-10-03）

- 主树待提交记录入库后以 `git merge --no-ff` 合入本地 main；产品代码（TerminalSurface/registry 等）自动合并无冲突，i18n settings.json 与共享索引/发布说明按并集解决。合并结果定向复验：字体相关 30 项定向用例与 registry/终端接线测试通过（证据见下）。
- 本记录中"集成 pending/须重新核对主树"的前置条件由本轮协调解决；远端 Task 分支推送 SHA（d54dfc91d/863c3efed）保持为历史来源。完整门禁随本轮集成批次统一执行，branch/worktree 待 origin/dev 推送成功后清理。

### 人工验收实测（2026-10-07，VERIFY-0017 组一，保持 verifying）

- 生效侧：界面字体选 Cambria 后正文与预览 computed font 实时变更，`localStorage.openforge-font-preferences={"ui":"Cambria","code":"Cascadia Code"}`；代码字体选 Cascadia Code 后 `--font-mono` 为 `"Cascadia Code", "SF Mono", "Fira Code", monospace`，`TerminalSurface` 接线在源码中确认。
- 「重启保留」在本实例失败并已归因：字体偏好只写入 origin 级 localStorage 键 `openforge-font-preferences`，dev 渲染源为 `http://127.0.0.1:<每次重启变化的端口>`，重启后该键为 `null`、正文字体与 `--font-mono` 回落默认（与设置向导标记 `vetta-setup-wizard-completed` 同时消失同因）。安装态源稳定时预期保留，需用户按打包形态复核。
- 终端字形仍不可观测（xterm 画在 canvas，无测量元素）。按 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 保持 `verifying` 交用户。

### 固定 origin 重启保留 + 主题切换实测（2026-10-07 / 10-08，VERIFY-0017 组一，保持 verifying）

本节结论**覆盖上一节同项**的「重启保留」判定：上一节的重启丢失已归因为 dev 渲染源端口每次重启变化，本次把 origin 固定后重测。

- 方法（10-07）：一次性 `VETTA_HOME`（`%TEMP%\font-home`，不碰隔离 Debug profile 与用户 dev 目录）+ `VETTA_DESKTOP_DEV_PORT` 指向已在运行的 renderer dev server（60957），使 origin 恒为 `http://127.0.0.1:60957`；字体一律经真实设置页 UI 保存（读取本机字体 → 93 项候选 → 选 Cambria）；重启用同一套环境变量。
  - 实例 A：`--font-sans` 由默认栈变为 `"Cambria", -apple-system, …`，body computed font 为 `Cambria, …`，`--font-mono` 保持 `"SF Mono", "Fira Code", monospace`（未选代码字体）；`localStorage["openforge-font-preferences"]={"ui":"Cambria","code":""}`。
  - 杀掉进程后同环境重启（实例 B）：origin 仍为 `http://127.0.0.1:60957`，偏好键值、`--font-sans`、body font 与 A 完全一致；说明启动即重新应用（`main.tsx:19 applyInitialTheme → applyStoredTheme → applyTheme`）。→「模拟重启 → 偏好保留」成立，前提是 localStorage 的 origin 不变（打包形态天然稳定）。
- 主题切换与重置（10-08，隔离 Debug profile `04987e4e`，同一 origin 内，全部经真实 UI）：切配色（默认 → 珊瑚，`data-theme` mono → sand）与切明暗（深色 → 浅色，`colorScheme` dark → light）之后，`--font-sans`、body font、偏好键三者均不变；界面字体下拉选回「默认」后键为 `{"ui":"","code":""}`、`--font-sans` 回到默认栈。→「切明暗/配色 → 偏好保留」与「重置恢复当前主题默认栈」成立。实测后已把该 profile 主题复位为 dark/mono。
- 仍未观测：GWT 第 2 条「活动终端字形/尺寸响应，实例、PTY 与已有输出保留」——xterm 画在 canvas，无测量元素，harness 下读不到字形变化，`TerminalSurface` 接线目前只有源码级证据；GWT 第 4/5 条（枚举失败/偏好损坏的反馈、连续请求与隐藏后重新 fit）只有工程测试（30 项定向用例）覆盖，无真实 UI 观察。
- 因此保持 `verifying`：请用户在**打包形态**下复核第 1～3 条观感与终端字形，并确认第 4/5 条的失败反馈与重新 fit 行为。证据留存 `<artifactDir>\0181-pinned-origin-restart.txt`、`0181-theme-switch-and-reset-2026-10-08.txt`、`0181-appearance-fonts-list.png`。

### 终端字形响应实测（2026-10-08，VERIFY-0017 组一，保持 verifying）

上一节把 GWT 第 2 条记为「xterm 画在 canvas，读不到字形」，本节换用**几何量**把它测出来（隔离 Debug profile，底部面板终端）：

- 该 xterm 构建是 canvas 渲染：DOM 里没有 `.xterm-rows`（取不到文本），但 `.xterm-screen` 及其 `canvas` 的像素尺寸 = 列数 × 单元格宽度，会随字体度量变化，可作客观读数。
- 读数三态（同一终端位置、同一容器宽度）：
  - 代码字体默认 → `screen 1044×210`、`canvas 1044×210`；
  - 经设置页把代码字体设为 **Courier New**（`--font-mono` 变为 `"Courier New", "SF Mono", "Fira Code", monospace`）→ `screen 1043×208`、`canvas 1043×208`；
  - 再选回「默认」→ **回到 1044×210**，与基线逐像素一致。
  双向可复现，说明差异由字体度量驱动，不是随机抖动；即「修改代码字体 → 终端字形/尺寸响应」成立。
- 等宽候选确实按实测字宽筛选：代码字体下拉只有 **21 项**（Cascadia Code / Cascadia Mono / Consolas / Courier New / Lucida Console / Maple Mono Normal NF CN …），而界面字体下拉是全部 **93 项**本机字体。
- **未观测到的一条**：GWT 第 2 条后半「实例、PTY 和已有输出保留」在真实 UI 走不到——代码字体只能在设置页改，而进设置路由会**卸载**底部面板终端（`document.querySelectorAll('.xterm').length` 由 1 → 0，返回后是**新节点**：实测前打的 `data-of-probe` 标记在返回后为 `null`）。也就是说当前应用形态下不存在「终端挂着的同时改字体」的入口，热更新只能在宿主测试里观察：`TerminalSurface.host.test.tsx:167`「changing the code font refits the existing PTY without losing output」断言 `options.fontFamily` 更新、`ipc.resize` 次数增加、终端数组长度仍为 1（未重建）、`writes` 不变（输出保留）、`ipc.open` 只调用一次且 `ipc.close` 未调用。
- 因此第 2 条目前是「字形/尺寸响应＝UI 实测通过；实例/PTY/输出保留＝宿主测试通过、UI 不可达」。若用户要求 UI 级证据，需要产品侧提供「终端可见时改字体」的入口（例如设置浮层或主题快捷切换），这属于设计问题而非本 Task 的实现缺陷。
- 证据留存：`0181-terminal-before-el.png`（默认字体）、`0181-terminal-after-code-font.png`（Courier New）、`0181-terminal-after-reset-code-font.png`（复位后）。实测后该 profile 的字体偏好已复位为 `{"ui":"","code":""}`。

### 首启状态随重启重放（2026-10-08，VERIFY-0017 组一，补证）

上一轮把「重启丢字体偏好」归因为「偏好只落在 origin 级 localStorage 键 `openforge-font-preferences`，而 dev 渲染源端口每次重启变化」。本轮因其它条目重启隔离实例（渲染源端口由 36915 变为 **52272**），顺手取证该归因的可见症状，确认丢失面比字体更宽：

- 重启前该 profile 的 localStorage 含 `openforge-font-preferences`、`vetta-setup-wizard-completed=1`、`vetta.tour.sidebar.completed=1`；重启后只剩 **4 个运行时键**（`vetta-ui-theme`、`vetta-session-execution-mode`、`vetta-workspace-path`、`vetta-selected-model`），上述三个键均为 `null`。
- 可见后果两条：① 「语言与外观」整屏向导**重放**（`div.fixed.inset-0.z-[100]`，含「跳过」「下一步」）；② 跳过向导后**产品引导 tour 重放**（`svg.driver-overlay` + `.driver-popover`），走完引导才写回 `vetta.tour.sidebar.completed=1`。两者都按 localStorage 判定（`shared/setup-wizard/storage.ts` 的 `isSetupWizardCompleted`、`shared/tour/storage.ts` 的 `isTourCompleted`）。
- 结论：该丢失不是字体偏好专有，而是 dev 形态下**整个 origin 级 localStorage 一起失效**（安装态 origin 稳定时不会发生）。归因与「需按打包形态复核」的要求不变，本段只补症状证据：`0181-setup-wizard-replay-after-restart.png`、`0181-sidebar-tour-replay-after-restart.png`（artifactDir）。实测后已在实例内走完向导与引导，两个标记均已写回。

### GWT 第 4/5 条实测（2026-10-08，VERIFY-0017 组一续测二十，保持 verifying）

上一节把 GWT 第 4 条（失败反馈）与第 5 条（连续请求、释放订阅、隐藏后重新 fit）记为「只有工程测试覆盖、无真实 UI 观察」。本节在隔离 Debug profile `04987e4e` 上把这些子句逐条在真实 UI 里做掉，闭合该缺口；第 2 条后半（实例/PTY/输出保留）的 UI 不可达结论不变。

**GWT 第 4 条：枚举失败/不支持、字体缺失、偏好损坏或写入失败 → 明确反馈且能重试/恢复，不阻塞外观页**

| 子场景 | 构造 | 实测读数 |
|---|---|---|
| 枚举失败（API 拒绝） | `window.queryLocalFonts = () => Promise.reject(new DOMException("denied","NotAllowedError"))` | 点「读取本机字体」→ `[role=alert]`＝「无法读取本机字体。如出现权限提示，请允许访问后重试；已有选择未改变。」；按钮回到可用（可重试）；已加载列表与两个选择器仍在（外观页照常可用）；还原真实 API 后重试 → 提示消失 |
| 枚举不支持 | `Object.defineProperty(window,"queryLocalFonts",{value:undefined})`（`supportsLocalFonts()` 为假） | 提示＝「当前环境不支持读取本机字体，已有选择与默认字体仍可使用。」；两个选择器 + 两个「恢复默认」按钮均在 → 页面可用 |
| 字体缺失 | 键写 `{"ui":"NoSuchFontZZZ","code":""}` 后重载 | 下拉显示该名（`loaded` 前即显示）；`--font-sans`＝`"NoSuchFontZZZ", -apple-system, …`（按回退栈渲染）；读取后出现「可用列表中未找到此字体，将按需使用默认字体回退…」；「恢复默认界面字体」可点 → 键回 `{"ui":"","code":""}`、`--font-sans` 回默认栈、提示消失 |
| 偏好损坏 | 键写 `{oops-not-json` 后重载 | 应用正常启动（未崩、无错误 UI）；`--font-sans`＝默认栈；两选择器均「默认」；随后选 Arial → 键被改写为合法 `{"ui":"Arial","code":""}`、`--font-sans` 变 `"Arial", -apple-system, …`。注：损坏值本身不在启动时改写（`getStoredFontPreferences` 只读不写），恢复发生在下一次保存，与实现一致 |
| 写入失败 | `Storage.prototype.setItem` 抛错（配额/私密模式形态） | 选择字体 → 提示「无法保存字体设置，已保留原来的选择，请重试。」；存储键、`--font-sans`、选择器显示三者**均未变**（不伪称保存成功）；还原后重试 → 成功写入，`--font-sans` 跟随 |

附属读数：本轮真实枚举为 **93 项界面候选 / 21 项代码候选**（等宽按实测字宽筛选），与上一轮在不同 origin 上的读数一致。

**GWT 第 5 条：卸载或连续请求 → 不应用过期结果，释放订阅；终端隐藏期间变更能在恢复可见后重新 fit**

| 子句 | 构造 | 实测读数 |
|---|---|---|
| 连续请求 | 计数桩（2.5s 后兑现）；对**真实按钮**同 tick 连点两次（React 尚未禁用） | `queryLocalFonts` 调用次数＝**1**；加载中 `[role=status]`＝「正在读取本机字体…」、按钮 `disabled=true`；禁用后再点仍为 1；桩载荷正常落地（选项＝默认 + AAA Stub Sans + BBB Stub Mono） |
| 卸载中放弃请求 / 不应用过期结果 | 可控桩（挂起 promise，保留 resolver）；请求在飞 → 切「通用设置」（外观段卸载，字体按钮数 → 0）→ 回「外观」 | 回页后无 `[role=alert]`、无搜索框（未应用任何列表）、页面无 `ZZSTALE` 文本；随后解决被放弃的请求（`res[0]([{family:"ZZSTALE"}])`）→ 仍无提示、无 `unhandledrejection`/`error`；回页后新请求（`calls=2`）以 `FRESH-OK` 正常落地 |
| 释放订阅（判别性） | 挂载中 `dispatchEvent(new StorageEvent("storage",{key:"openforge-font-preferences",…}))`；**卸载后**同一事件再发一次 | 挂载中：`--font-sans` 变 `"Courier New", -apple-system, …`、选择器变「Courier New」（订阅有效）；卸载后（`#/settings/general`）：同事件下 `--font-sans` **不变**（无泄漏监听），且存储键确为 `{"ui":"Courier New",…}`、回页后选择器显示「Courier New」→ 不是「事件没生效」而是「监听已摘除」 |
| 终端隐藏期间变更 → 恢复可见后重新 fit | 底部面板终端（canvas 渲染：`.xterm-screen` 像素尺寸＝列数×单元宽）；收起面板 → 容器链宽高全 0（不可测量，fit 被跳过）→ **隐藏期间**切侧边栏改变宽度 → 展开面板 | 基线 `1044×210`；收起后 `.xterm` **仍为 1**（仍挂载、仅隐藏）且尺寸 0；隐藏期间改宽无读数；展开后 **`1266×210`**（跟随新容器链 1264/1280），复原侧边栏 → 回 `1044×210`，双向可复现 |
| 未观测（如实记录） | PTY 尺寸同步调用本身（`fitIfMeasurable` → `window.vetta.terminal.resize(id, cols, rows)`） | 该 IPC 经 `contextBridge` 暴露且对象冻结，实测替换 `window.vetta.terminal.resize` 不生效（`__resizes` 恒空），故「resize 被调用、cols 增加」仍只有宿主测试证据（`TerminalSurface.host.test.tsx:167`）；本轮证明的是 fit 后的**渲染尺寸**跟随容器，列数变化为其等价读数 |

**本轮另记（未计入任何条目）：偏好状态与已应用 CSS 的短暂分叉**

- 现象：在「偏好键被外部改写」的场景下进入外观页，`useFontSettingsModel` 的挂载 effect 只 `setPreferences(getStoredFontPreferences())`（选择器会显示新值），**不**调用 `applyStoredTheme()`，故 `--font-sans` 仍是旧值。实测：键＝Courier New、选择器＝「Courier New」、`--font-sans`＝默认栈。
- 可达性枚举：全仓 `saveFontPreferences` 只有**一个写入者** `useFontSettingsModel.choose()`（同文档内，写入后立即 `applyStoredTheme()`）；`onboarding`/`pet`/`quickpanel` 三个入口的 storage 监听只对 `vetta-theme`/`vetta-color-theme` 生效，不跟随字体键；主窗无全局字体监听。
- 结论：当前单主窗形态下不存在能造成该分叉的用户可达路径，故**不作为缺陷**，只记录这处状态/CSS 语义差异；若将来新增第二写者（多窗设置、主题包投递字体），需同时补 `applyStoredTheme()`。

**方法与证据留存**：新 origin 会重放设置向导与产品引导，注入 `vetta-setup-wizard-completed`/`vetta.tour.sidebar.completed`/`vetta.tour.capabilities.completed` 后 reload 可直接进设置；侧边栏折叠按钮的可访问名随状态在 `title`「隐藏侧边栏 / 展开侧边栏」间切换（无 `aria-label`），locator 须按状态取。截图：`0181-fonts-loaded-2026-10-08.png`、`0181-fonts-load-failed.png`、`0181-fonts-missing-notice.png`、`0181-fonts-save-failed.png`、`0181-fonts-unavailable.png`（artifactDir）。实测后该 profile 字体偏好已复位为 `{"ui":"","code":""}`。

**仍待用户判定**：① 打包形态下的字体观感与终端字形（本轮为几何量，非观感）；② 是否接受「PTY 尺寸同步」以宿主测试为准（`contextBridge` 冻结使实时读数不可得）。因此维持 `verifying`。

### 用户裁定（2026-10-08）：接受宿主测试为准，闭合为 `done`

用户在 [VERIFY-0017](../verification/VERIFY-0017-behavior-acceptance-checklist.md) 组一收口轮裁定：

- **② PTY 尺寸同步**：**接受**以宿主测试为准。该 IPC 经 `contextBridge` 暴露且对象冻结，活实例内无法观测调用（替换 `window.vetta.terminal.resize` 不生效、`__resizes` 恒空），故以 `apps/desktop/src/renderer/domains/bottom-panel/terminal/TerminalSurface.host.test.tsx:167` 为准；本 Task 在真实 UI 侧已证明其**等价读数**——fit 后的渲染尺寸（`.xterm-screen` 像素尺寸 = 列数 × 单元宽）确实跟随容器宽度变化（`1044×210` ↔ `1266×210`，隐藏期间改输入后展开仍正确跟随）。
- **① 打包形态观感**：接受本轮证据（真实 UI 逐子句实测 + 枚举/无效/缺失/损坏/写失败五态反馈 + 并发与订阅释放），**打包形态的字体观感与终端字形留作发布前抽检**，不再作为本项的验收阻塞条件。
- 状态：`verifying` → `done`。`integration_status: integrated` 不变（已合入本地 main，`75c5ae2df`）；发布前抽检若发现观感问题，按新现象另立反馈/Task，不回退本项。
- 遗留（不阻塞、已记录）：dev 形态每次重启换 origin ⇒ origin 级 localStorage（字体偏好、向导/引导完成位）整体失效并重放首启流程，属 dev 形态特性；打包/安装态 origin 稳定，不受影响。另「挂载时不 apply、只 setPreferences」的状态/CSS 语义差异在当前单写者形态下用户不可达，不作缺陷。
