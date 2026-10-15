---
id: VERIFY-0010
type: verification
status: done
owner: coordinator
source: 用户指令「调用 mcp 去 cdp 对于我的项目进行功能和视觉验收，可以重启服务」
created: 2026-09-26
updated: 2026-09-26
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
related_tasks: [TASK-0102]
related_bugs: [BUG-0022, BUG-0037, BUG-0038, BUG-0039]
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.2 候选（本地 `main`）Desktop 实机功能与视觉验收

## 被验证的合同

1. 0.1.2 改进项「`/` 技能与场景选择弹层重构」在实机成立：分组标题与计数、类型图标与来源徽标、描述第二行两行折叠、键盘/悬停同源高亮、过滤无命中与无可用项两种空态 CTA、`listbox/option/aria-selected` 语义。
2. 0.1.2 改进项「模式入口收敛到新会话卡片」在实机成立：页头不再出现切换器；新会话卡片上有切换档位；只读确认句如实说明「这次按哪一档开」。
3. 0.1.2 修复项「沙箱不可用时显式说明」在实机成立：执行模式选择器给出原因与当前实际档位，而不是静默置灰。
4. 主要路由与面板可渲染：侧边栏导航、能力库页面、侧边栏项目区；首屏不崩溃（TASK-0102 记录的 `ThemeRuntimeProvider` 主题加载后 `Invalid hook call` 未复现）。
5. 可访问性：新会话页 axe 审计无 critical/serious 违规。
6. 数据隔离：验收只写隔离 Profile，用户真实数据目录 `~/.openforge-dev` 不被改动。
7. Runtime Canary（用户本轮追加授权）：用本地确定性 Provider 验证会话创建、二代 Desktop 重启恢复与 Tool Loop，不产生真实 Provider 费用。

## Given / When / Then

- Given：隔离 Debug Profile（`~/.openforge-ui-debug/04987e4e`，项目 `E:\demo`，语言 `zh`），Desktop dev 构建，Renderer CDP 可达
  When：用 agent-browser 经 CDP 附着，逐屏 snapshot / eval / screenshot 并逐项断言
  Then：见「结果」各条；不一致处按给定证据登记缺陷
- Given：新会话页在「对话」入口且未选项目
  When：点击「文档与研究」/「代码」
  Then：高亮、只读确认句与 `localStorage` 记录三者一致
- Given：新会话页已用项目选择器选中项目 `demo`
  When：点击「文档与研究」
  Then：高亮、确认句与实际派生档位一致（**未成立，见 BUG-0037**）
- Given：本机 Windows 未内置沙箱组件（`BUG-0022` 描述的环境）
  When：打开输入栏执行模式选择器
  Then：沙盒选项被禁用并给出原因，且说明当前实际按完全访问运行
- Given：fresh Profile + `--runtime-canary`（本地确定性 Provider，无真实凭据）
  When：执行 `bun run verify:ui:debug -- runtime-canary`
  Then：会话创建、二代重启恢复、Tool Loop、锁释放等断言通过（**未成立，见 BUG-0038**）

## 环境与输入

- 提交 / 版本：`main` @ `53995f8c7`（`git status --short` 干净；Desktop `apps/desktop/package.json` 仍为 `0.1.1`，`v0.1.2.md` 待定稿）
- 操作系统 / Runner：Windows 11（本机），非 CI
- Bun / Node 或其他相关工具版本：`bun 1.3.14`（`packageManager`）；agent-browser 0.38.1（MCP `core` profile + CLI）；axe-core 4.12.1
- 输入与前置状态：验收开始时无任何 Desktop / dev server 在跑（5173/9222/9223 无监听、无 Electron 进程）
- 隔离边界：Debug Profile `04987e4e`（`~/.openforge-ui-debug/04987e4e`，`desktop-config.json` 内含项目 `E:\demo`）；Fresh Profile 临时 run 目录；窗口 1280×800；界面语言 `zh`

## 实际命令与 CI 记录

```text
git status --short
bun run verify:ui:status:debug
bun run verify:ui:start:debug                 # CDP endpoint http://127.0.0.1:41309
bun run verify:ui:status:debug                # running/ready/ui.reachable/ui.targetFound 均 true
agent-browser connect 41309 --session openforge-accept
agent-browser --session openforge-accept tab list / get url / get title
<MCP agent-browser: snapshot / click / type / press / eval / screenshot / wait_for_*（同一 session）>
agent-browser --session openforge-accept console / errors / a11y --json
bun run verify:ui:stop:debug
bun run verify:ui:start -- --runtime-canary    # fresh Profile，本地确定性 Provider
bun run verify:ui:status                       # ready=true，desktopGeneration=1
bun run verify:ui:debug -- runtime-canary      # 失败：LOCAL_RPC_SERVER_NOT_FOUND（BUG-0038）
bun run verify:ui:stop
agent-browser --session openforge-accept close
```

- CI run URL / job：不适用（本地实机验收，未触发流水线）

## 结果

### 1. 启动与首屏（通过）

- 冷启动后主窗标题 `Open Forge`，路由 `#/new-session?cwd=…\conversation`；侧边栏、新会话卡片、输入栏、项目区全部渲染。
- `errors` 为空；`console` 只有正常启动日志：`[theme-runtime] selectTheme "default"` → `theme "default" ready elapsed=902.7ms`、系统插件逐个 `load start`/激活、`[vite] connected`。**TASK-0102 记录的主题加载后 `Invalid hook call` 崩溃未复现。**
- 截图：`A1-first-paint.png`。

### 2. 新会话卡片与模式入口（部分通过，一处 P1 缺陷）

- 页头不再有工作区切换器（`header [role="group"][aria-label*="工作区"]` 不存在）；切换器只出现在新会话卡片选项行（`group[aria-label="切换工作区：文档与研究或代码"]`），与 0.1.2 说明一致。
- 只读确认句存在且 `role="status"`（`[data-testid="new-session-workspace-hint"]`）。
- 未选中项目时：点「代码」→ `aria-pressed` 与确认句均为「代码」，`localStorage` 记为空；点「文档与研究」→ 两者均为「文档与研究」，`localStorage` 记为 `{"…\conversation":"work"}`。三者一致。
- **选中项目 `demo` 后**：高亮（`aria-pressed=true` + 白色 pill）为「文档与研究」，确认句却为「这次按「代码」开：可用终端和 Git，右侧是执行轨迹。」；重复「点代码 → 点文档与研究」稳定复现，重载后同键同值仍复现。→ **BUG-0037**（P1；根因：切换器读路由 cwd，确认句与会话派生读 `contextCwd`）。
- 视觉证据：`B-defect-hint-vs-switcher.png`（白色 pill 在「文档与研究」，确认句写「代码」，项目 chip 为 `demo`）。

### 3. `/` 技能与场景弹层（通过）

- `role="listbox"` + `aria-label="选择场景或技能"`；标题「选择场景或技能」实机可见。
- 分组标题带计数（本 Profile 只有「技能 52 项」；未安装任何「场景」条目时该分组不渲染）。
- 条目结构：24px 类型图标槽 + `truncate` 名称 + `line-clamp-2` 描述（第二行完整展示、超长两行折叠）；来源徽标在实机截图中随条目展示。
- 键盘高亮：`ArrowDown` 使 `aria-selected` 从「画布报告」移动到「架构图画布」；任意时刻恰好 1 个 `aria-selected`、恰好 1 个左侧指示条（`span.absolute.inset-y-1.5.left-0.5.w-0.5.bg-primary`）。条目同时带 `hover:bg-foreground/5`，与「悬停与键盘同源」一致（另观察到指针停留位置会影响初始高亮项，属同一机制）。
- 过滤无命中：输入 `/zzzz` → 「未找到匹配项」+「换个关键词试试，或直接输入你的需求。」+ CTA「清除筛选」；点击后触发词被删除、面板关闭（`useCommandPanelModel.tsx:231-241` 注释明确这是 InputBar 形态「清除筛选 = 删触发词」的既定行为）。
- 「无可用技能」空态（`去能力市场安装`）在本 Profile 未出现（技能列表非空），未实测。
- 视觉证据：`C-slash-panel.png`。

### 4. 执行模式与沙箱降级（通过，方向与 BUG-0022 一致）

- 输入栏执行模式弹层显示「沙盒受限 / 完全访问」，并给出「当前安装未包含沙盒组件」与「当前以「完全访问」运行，命令不受沙盒隔离约束」。
- 「沙盒受限」按钮 `disabled=true` 且 `title="当前安装未包含沙盒组件"`；「完全访问」可选，`title="允许完全访问当前系统"`。
- 说明：`BUG-0022`（本机无沙盒组件）仍是当前环境的既有状态；本轮验证的是 0.1.2 修复项要求的**如实说明与显式禁用**，与 ADR-0133 的 fail-closed 方向一致。真正的「沙盒模式下创建会话必然失败」实机路径未构造（见未运行项）。
- 视觉证据：`D-sandbox-unavailable.png`。

### 5. 路由与面板 smoke（部分通过）

- 侧边栏 → 「能力」：`#/abilities`，标题「能力」+「查找、添加并管理 agent 可用的技能、连接器和插件」，`已装 61 项 / 共 62 项`、来源筛选（公开 / 个人）、条目列表渲染；无 Vite 错误浮层。
- 首次进入「能力」页会弹出 driver.js 引导浮层（`driver-popover-title`），其遮罩（`<path>`）会拦截其它区域点击——这是该引导的预期行为，但会让自动化点击在关闭引导前失效（本轮据此把「智能体」导航项的点按判为受遮罩影响，非命中测试缺陷）。
- 未逐页实测：智能体、设计、更多、设置、文件面板与预览、主题切换、语言切换（见未运行项）。

### 6. 可访问性审计（发现 3 类违规 → BUG-0039）

- `passes: 31`；`violations: 3`（`button-name` critical 1 节点；`nested-interactive` serious 2 节点；`region` moderate 2 节点）；`incomplete: 1`（`color-contrast` 27 节点，均为「背景色被其它元素覆盖无法判定」）。
- 详见 **BUG-0039**。

### 7. 视觉与布局（通过）

- 首屏、缺陷态、技能弹层、执行模式弹层四张截图逐张核对：信息层级、图标与文字对齐、卡片与输入栏在 1280×800 下无溢出或截断。
- 模式 chip 不折行：`代码` `clientWidth=58/scrollWidth=58`，`文档与研究` `clientWidth=91/scrollWidth=91`，`white-space: nowrap`，行高 16px + 上下 padding = 22px —— TASK-0102 记的「窄栏折行」风险在本窗口尺寸与 219px 侧栏下未复现。

### 8. 数据隔离（通过）

- `~/.openforge-dev`（用户真实数据）最后一次写入为 03:57:54，早于本次验收开始时间（04:23），全程无新增写入。
- 本次写入只落在隔离目录：`~/.openforge-ui-debug/04987e4e`（04:35:58 等）与 `<tmp>\vetta-ui-verification\04987e4e\**`。
- 结束时 `verify:ui:stop:debug` / `verify:ui:stop` 均返回 `stopped: true`，且无 Electron / canary Provider 残留进程。

### 9. Runtime Canary（未通过 → BUG-0038）

- `verify:ui:start -- --runtime-canary` 正常拉起：单文件 CLI 安装到仓库外（`…\runtime-canary\<id>\home\agent\bin\vetta.exe`）、本地确定性 Provider 启动、`ui.reachable/targetFound` 均 true。
- `verify:ui:debug -- runtime-canary` 在第一次 CLI 调用失败：首次 `EBUSY: resource busy or locked, uv_spawn`，重跑 `LOCAL_RPC_SERVER_NOT_FOUND`（ENOENT：`…\runtime-canary\<id>\home\action-server.json`）。
- 实际 endpoint 文件写在 `…\fresh\action-server.json`，而 runner 与 host 都按 canary home 查找 → 路径合同不一致，canary 在当前仓库状态下不可能通过。详见 **BUG-0038**。

## 未运行的验证与原因

- 真实 Provider 会话流程（发消息、流式回复、工具审批、取消、重试）：用户本轮授权的范围是「免费用途 + runtime-canary 本地确定性 Provider」，未授权真实 Provider 调用，因此**未发送任何真实请求**。
- Runtime Canary 的全部断言：因 BUG-0038 在第一步就失败，会话创建 / 二代重启恢复 / Tool Loop / 锁释放 / endpoint 清理均**无实机证据**。
- 侧边栏其余路由（智能体、设计、更多、设置、能力市场安装流程）：未逐页实测；「智能体」一次点按被 driver.js 引导遮罩拦截，未在关闭引导后重试。
- 文件面板 / 活动面板 / 文件预览 / 主题与语言切换：未实测。
- 「无可用技能」空态与「场景」分组的视觉：本 Profile 不满足触发条件。
- Main / Preload 改动后的重启验证：本轮未改代码，无需。
- `bun run check` / `bun run test:*`：本轮只做实机验收、未修改任何源码，未运行；改动面为零，因此无需回归测试。**本轮未新增或修改发布说明**：纯验收无行为变化，发现的缺陷以 BUG-0037/0038/0039 与本文登记；未修复故不写入 `.github/release-notes/v0.1.2.md`。

## 剩余风险

1. **BUG-0037 未修复**：0.1.2 的主推改进项在「对话入口 + 改选项目」这条常见路径上给出相反的开口径提示，且用户无法把会话切到「文档与研究」。建议发版前修复；若选择不修，需在发布说明或已知问题中明示。
2. **Runtime Canary 不可用作发版门禁**：本文未给出版本级 Runtime 证据，`docs/dev/README.md` 中 canary 承诺的断言目前全部缺失；修复 BUG-0038 后才具备条件。
3. **可访问性缺口**：`button-name` 为 critical 且落在主界面侧边栏，读屏用户受影响；修复成本低但需同时改三个组件。
4. **验收覆盖面**：本轮以 0.1.2 改动面 + 首屏/路由 smoke 为主，未覆盖设置页、文件/活动面板、主题与语言切换、插件安装流程；后续发版前建议补一轮同类实机走查。
5. **环境差异**：验收使用隔离 Profile（无登录态、无真实凭据、项目为 `E:\demo`）；未登录形态下能力市场等页面的降级表现未逐项确认（本轮「能力」页在未登录下仍正常列出本地能力，未观察到报错）。

## 证据清单

截图与日志位于验证产物目录（fresh 的日志路径见 `verify:ui:status` 输出；debug 的 `artifactDir`）：

```text
C:\Users\xquan\AppData\Local\Temp\vetta-ui-verification\04987e4e\artifacts\debug\
  A1-first-paint.png                  首屏
  B-defect-hint-vs-switcher.png       BUG-0037 的视觉证据
  C-slash-panel.png                   「/」技能弹层
  D-sandbox-unavailable.png           执行模式与沙箱降级
host.log（debug / fresh 各一份）       启动、插件激活、CDP 配置与 endpoint 路径
```
