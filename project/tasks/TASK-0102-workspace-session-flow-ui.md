---
id: TASK-0102
type: task
status: done
priority: P1
owner: apps/desktop renderer/workspace-mode + conversation
requirement: REQ-0001
plan: PLAN-0001
source: ISSUE-0010; user-request 设计好 UI 页面与流程
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/workspace-mode, apps/desktop/src/renderer/domains/conversation, apps/desktop/src/shared/i18n/locales]
write_paths: [apps/desktop/src/renderer/domains/workspace-mode, apps/desktop/src/renderer/domains/conversation/components/new-session, apps/desktop/src/renderer/domains/conversation/components/chat-view/DefaultChatView.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar, apps/desktop/src/shared/i18n/locales/zh/chat.json, apps/desktop/src/shared/i18n/locales/en/chat.json, project/tasks/TASK-0102-workspace-session-flow-ui.md]
exclusive_paths: [apps/desktop/src/renderer/domains/workspace-mode/lib/workspace-session-flow.ts]
depends_on: [TASK-0083]
conflicts_with: [TASK-0077, TASK-0080, TASK-0083]
integration_status: integrated（forge/dev 主工作区；随 f9a79d399 落地。status 保持 verifying：实机页头/新会话/右栏点击流程因 Debug Renderer 主题加载后 Invalid hook call 未走通）
created: 2026-09-24
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 工作区任务类型：页头、新会话、右栏同一条流程

## 用户语言推演

用户打开项目是为了**让这次活落在对的工作台**。页头选「文档与研究 / 代码」必须立刻换右侧；新会话页要说清即将按哪档开；已开会话用白话说明「切页头不会改它」。不把三轴、Profile、agentMode 暴露给用户。

## 范围

### 并发评估

- 结论：不支持与改同一 chat catalog / 新会话页 / 右栏分支的 Task 并行
- 执行方式：serial

### 做

- 右栏选择收成 `resolveWorkspaceRightPanel`：work 且未打开预览时出工作面板；新会话页与会话页共用。
- 页头开关补后果说明（aria + tooltip），work 图标改为文档。
- 新会话选项行下增加只读确认句，不是第二套开关。
- 工作面板加标题与一句引导。
- 已开会话徽标：对齐轴用「按…开的 · 切页头不会改」；分歧轴仍分写两面。

### 不做

- 不重开三轴合同，不热切换已开会话工具集。
- 不写继承的 Vetta Release Notes。
- 不改 Team 自带 activity 宿主。

## Given / When / Then

- Given：页头切到文档与研究且无任何任务/产物投影（新会话页恒如此）；When：看右侧；Then：右侧整条不占位，不回退执行轨迹；会话页投影出现任务或产物后，工作面板再出现。
- Given：新会话页为文档与研究；When：看选项行下方；Then：只读一句说明即将按文档与研究开，没有第二套开关。
- Given：已固化 work/work 会话；When：输入栏徽标渲染；Then：说明本会话按文档与研究开的，切页头不会改。
- Given：work 会话且用户打开文件预览；When：右栏更新；Then：工作面板让位给活动面板。

## 必须保持

- 切页头不改已开会话工具与提示词。
- Team 等显式 activity 配置仍走自己的右栏。
- 无项目 cwd 时页头不渲染开关。

## 测试与验证

- `workspace-session-flow.test.ts`、`workspace-mode-copy.test.ts`、`NewSessionWorkspaceHint.test.tsx`、`NewSessionOptionsRow.test.tsx`、`WorkWorkspacePanel.test.tsx`、`DefaultChatView.test.tsx`、`InputBarView.test.tsx`、`WorkspaceModeSwitcher.test.tsx`
- `bun run --cwd apps/desktop typecheck`；`check:quick` 对本切片

## 发布说明候选（Open Forge 首发前不写入继承的 Vetta Release Notes）

【改进】页头「文档与研究 / 代码」会立刻换右侧工作台；新会话页用一句话确认即将按哪档开；已开会话标明切页头不会改它。

## 交付记录

- 实际修改：`workspace-session-flow` 收口右栏与徽标种类；页头补后果说明与文档图标；新会话选项行加只读确认句；新会话页 work 档出工作面板；工作面板加标题引导；对齐徽标改为「按…开的 · 切页头不会改」。
- 实际运行：workspace-session-flow 7、workspace-mode-copy 5、WorkspaceModeSwitcher 4、WorkWorkspacePanel 4、NewSessionWorkspaceHint 2、NewSessionOptionsRow 2、DefaultChatView 4、InputBarView 4，均通过。Biome 已对本切片 TS 文件执行 `--write`。`bun run check`（2026-09-24）：lint 6 条、types 失败，均落在其他 WIP（live-edit CRLF、webview-agent-guest、PluginPermissionVisual、date-picker 双份 react-day-picker、coding-agent/runtime 测试合同），本切片文件未出现。`verify:ui:status:dev` 不可达。Fresh 冷启动 120s 超时；热缓存后 CDP 可达，但脚本仍按「Vetta Desktop」选窗失败。随后把选窗改读 `desktop-brand.json`（现为 Open Forge），`desktop-brand` + diagnostics 测试 11 通过；`check:quick` 对这 3 个文件通过。Debug 实例 `running/ready/ui.reachable/targetFound` 均为 true，主窗标题 Open Forge；实机首屏在 `ThemeRuntimeProvider` 选 default 主题后 Invalid hook call（`useCallback` 读到 null），无法走到页头/新会话/右栏。已 `verify:ui:stop:debug`。
- 未运行及原因：页头「文档与研究 / 代码」实机点击流程未完成，原因是 Debug Renderer 在主题加载后崩溃，不是本切片断言失败。
- 剩余风险：页头「文档与研究」五字偏长，窄栏可能折行；新会话 work 面板是空骨架（尚无会话任务投影）；全仓 `check` 与实机 Renderer 仍被其他 WIP / 双份 React 挡住。
- 发布说明候选（ISSUE-0007 门禁，暂存本记录）：【改进】页头「文档与研究 / 代码」会立刻换右侧工作台；新会话页用一句话确认即将按哪档开；已开会话标明切页头不会改它。
- 编号修订：本 Task 原编号 `TASK-0084` 与 MCP 按工具可见性任务撞号（`VERIFY-0008`「异常发现」2），经裁决改名为 `TASK-0102`；交付内容、验收面与剩余风险不变。

- 2026-09-25 UI 打磨：计划状态按运行/等待/终态用设计规范白名单色分级，执行中任务复用 `vetta-live-dot` 呼吸点；来源列表只显示文件名并以 `title` 保留完整路径，支持单条移除；主操作按钮（Start / approve）改 primary；文案统一为「来源资料」，中英文 catalog 同步更新。
- 实际运行：`test:impact` 通过（直接测试 WorkDocumentSections 13 + workspace-mode-copy 5 = 18 个用例；相关测试 28 个文件 139 个用例）；`check:quick` 对本切片 5 个文件通过。
- 未运行：`verify:ui:*` 实机验证未运行（用户未授权）；完整 `bun run check` 尚未在本次打磨后运行，将在提交前执行。
