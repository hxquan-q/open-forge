---
id: TASK-0404
type: task
status: done
priority: P1
owner: desktop
requirement: REQ-0030
plan: PLAN-0025
source: user-request
related_requirement: [REQ-0030]
related_plan: [PLAN-0025]
related_tasks: [TASK-0405]
related_issues: []
related_bugs: []
execution: serial
branch:
worktree:
base_commit: fb4e7b780
read_paths: []
write_paths:
  - apps/desktop/src/renderer/domains/workspace-mode/
  - apps/desktop/src/renderer/domains/project/
  - apps/desktop/src/renderer/domains/conversation/components/new-session/
  - apps/desktop/src/renderer/shared/store/workspace-mode-atoms.ts
  - apps/desktop/src/shared/i18n/locales/
  - packages/theme-sdk/src/sidebar/
  - packages/theme-ui/src/sidebar/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-26
updated: 2026-10-26
---
<!-- Copyright The Open Forge contributors. -->

# 「Allstar自主开发」版块入口：代码模式独立 + 新会话默认文档与研究档

> 实施后回填（2026-10-26）：实施时未先建 Task，经用户要求补账；交付事实以本记录与
> commit `c5700985d` 为准。

## 目标

把「代码」对话模式从新会话选项行独立成侧边栏「更多」之后的固定版块入口
「Allstar自主开发」；新会话默认「文档与研究」档，代码模式只能经该入口进入。

## 范围

### 并发评估

- 结论：不支持（已交付）
- 执行方式：serial
- Branch：chenxvhua（base `fb4e7b780`）
- 集成：已提交并推送 origin/chenxvhua

### 做

- 侧边栏「更多」之后渲染版块入口行（theme-sdk `SidebarModel.sectionEntryNavItem` 合同 +
  theme-ui `SidebarNavigation` 渲染；key `allstar-dev` 不进布局存储、不可拖拽置顶）；
- 入口点击按「新会话」同款 cwd 解析写 coding 档再落新会话页（`useAllstarDevNavigation`）；
  「新会话」（`useNewChatNavigation`）与项目详情页 `onNewSession` 统一回落默认档 work
  （`enterWorkspaceSection` 单一写入点）；
- `DEFAULT_WORKSPACE_MODE` 翻转为 work（存量存储只含 work 记录，无需迁移）；
- 已开会话右栏改为跟随会话 `capabilityProfile`（创建时固化），无会话回落项目档位；
- 删除选项行切换器（`WorkspaceModeSwitcher`、`isWorkspaceModePath`、chat.json
  `workspace.mode.*`）；徽标文案去「切页头不会改」失效引用；
- `agent-mode-entry-points.test.ts` 结构合同重写为新 IA；i18n zh/en 与发布说明碎片。

### 不做

- 不改会话创建链路（`useSessionOpener` 按项目档位派生轴的机制原样）；
- 不做版块专属路由/项目空间（M1，TASK-0405）；
- 深链 `/new-session` 沿用上次档位（用户接受，见已知限制）。

## Given / When / Then

- Given 项目档位为默认，When 点击侧边栏「Allstar自主开发」，Then 落新会话页且底部确认句
  为代码档，发送创建 capabilityProfile=coding 的会话，入口高亮；
- When 经「新会话」类入口新建，Then 档位回落 work，会话按文档与研究创建；
- Given 已打开研究会话，When 进入开发版块后切回，Then 右栏保持工作台布局。

## 必须保持

- 档位是项目级偏好，只影响新会话创建，不改变已开会话；
- 代码模式入口有且只有侧边栏版块入口一处（结构合同守住）；
- zh/en 文案全走 i18n；插件/MCP 不可信边界不受影响。

## 测试与验证

- 定向测试：desktop 9 文件（atoms / agent-mode-entry-points / NewSessionOptionsRow /
  useSidebarModel.workspace-view / useNewSessionProjectSelection / workspace-mode-copy /
  InputBarView / weknora-nav / NewSessionWorkspaceHint 相关面）+ theme-ui
  SidebarNavigation.section-entry，全绿；
- 用户流程：完整 check、desktop tsc、lint、guards 全绿；全量 desktop suite 6190/6198——
  5 例 open-marketplace 超时定性为存量环境问题（单文件跑亦超时、依赖图不含本改动、该文件
  近期有「放宽超时」提交 `9f81e6043`），建议另立案；
- 质量检查：`bun run check` 四车道 exit 0；pre-commit 门禁通过。

## 验收分层

- 工程验证：通过（命令与结果见上）。
- 技术评审：自审（无独立评审）；剩余风险：新会话页内项目选择器换项目时入口高亮按路由
  cwd 近似。
- 集成：integrated（`c5700985d` 已推送 origin/chenxvhua，仅该分支）。
- 人工功能验收：接受（2026-10-26 用户 dev 实机走查：入口位置/开发档 hint/会话徽章/右栏
  工作台回归/选项行无切换器，反馈「看起来没问题」）。
- 发布：未授权（v0.1.3 未打 tag；发布说明碎片已就位）。

## 功能验收包

- 入口与前置条件：任意档位的项目；侧边栏展开。
- 操作步骤：点「Allstar自主开发」→ 看 hint/发送/徽章/右栏；点「新会话」对比；进开发版块
  后打开旧研究会话看右栏。
- 预期行为与最终产物：见 GWT。
- 不通过表现与已知限制：深链 `/new-session`（非两入口）沿用该项目上次档位，点一次
  「新会话」即回落。
- 验收反馈及回归案例：2026-10-26 用户走查通过；无回归案例。

## 交付记录

- 实际修改：33 文件（+479/−454），清单见 commit `c5700985d`；4 个基线外新改文件补 fork
  声明头；发布说明 `fragments/v0.1.3/allstar-dev-section-entry.md` 已汇编。
- 实际运行：`check:quick`/`check:lint`/`check:guards`/完整 `bun run check` exit 0；
  desktop tsc 0 错；theme-ui/theme-sdk sidebar 零类型错误；定向与全量 suite 结果如上。
- 未运行及原因：`verify:ui:*` 未运行（用户改为自行 `bun run dev` 实机验收）；打包验证
  未运行（纯 renderer/包内改动，无 main/preload 合同变化）。
- Worktree：未拆出（单串行批次，主工作区完成）。
- 剩余风险：全量 suite 的 open-marketplace 存量超时（另立案）；theme-ui 包内 51 处
  `JSX` 命名空间存量类型红（不在根级门禁内，与本改动无关）。
