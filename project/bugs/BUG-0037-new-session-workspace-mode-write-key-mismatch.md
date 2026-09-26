---
id: BUG-0037
type: bug
status: done
priority: P1
owner: apps/desktop renderer/conversation + renderer/workspace-mode
requirement:
plan:
source: VERIFY-0010 实机功能与视觉验收（用户指令「调用 mcp 去 cdp 进行功能和视觉验收」）
related_requirement: [REQ-0001]
related_plan: [PLAN-0001]
related_tasks: [TASK-0102]
related_issues: [ISSUE-0010]
created: 2026-09-26
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# 新会话页选中项目后，「文档与研究 / 代码」切换写错 cwd 键：高亮与确认句相反，且切换对新建会话不生效

## 用户流程

- Given：用户从侧边栏「对话」入口进入新会话页（`#/new-session?cwd=<…>\conversation`），随后在选项行用项目选择器改选一个项目
- When：点击选项行的「文档与研究」（或先切「代码」再切「文档与研究」）
- Then：分段控件高亮那一档，下方只读确认句说明「这次按「文档与研究」开…」，并且真正创建的会话就按这一档派生解释模式与工具面

## 实际行为

选中项目后：

- 分段控件的高亮跟随**路由 cwd**（对话目录）的记录变化，`aria-pressed="true"` 与白色选中 pill 落在「文档与研究」；`localStorage["vetta-workspace-mode"]` 被写成 `{"…\\conversation":"work"}`。
- 同一行的只读确认句（`data-testid="new-session-workspace-hint"`）读**项目 cwd** 的记录，因此仍显示「这次按「代码」开：可用终端和 Git，右侧是执行轨迹。」
- 两者方向相反；且没有任何入口能把这条会话切到「文档与研究」——切换器写的键不是会话读取的键，切换实际不生效。

未选中项目时两者一致（都按对话目录取键），所以该问题只在「进入新会话页后再改选项目」这条常见路径上出现。

## 期望行为

切换器、只读确认句与新建会话派生的能力面读同一个 cwd 的记录：高亮哪一档，确认句就说明哪一档，会话也按那一档创建（0.1.2 改进项「新会话按这一档开始」的承诺）。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：`main` @ `53995f8c7`（Desktop dev 构建）／Windows 11；`bun 1.3.14`；agent-browser 0.38.1（CDP 附着）；窗口 1280×800；界面语言 `zh`
- 隔离环境：Debug Profile `04987e4e`（`~/.openforge-ui-debug/04987e4e`），项目 `E:\demo`
- 失败测试/CI 用例与命令（若适用）：无自动化用例覆盖该路径（这正是回归缺口）
- CI run URL 与脱敏后的关键输出（若适用）：不适用（本地实机验收）
- 基线对照或重跑结果：同一会话内重复「点代码 → 点文档与研究」三次，每次都可复现；页面重载后同键同值仍复现

关键 DOM 读数（`session: openforge-accept`，选中项目 `demo` 之后）：

```text
switcher   : 代码 aria-pressed=false ；文档与研究 aria-pressed=true ；视觉 pill 在「文档与研究」
hint       : 这次按「代码」开：可用终端和 Git，右侧是执行轨迹。
storedMap  : {"C:\\Users\\xquan\\.openforge-ui-debug\\04987e4e\\conversation":"work"}
```

未选中项目时（对照）：

```text
switcher   : 文档与研究 aria-pressed=true
hint       : 这次按「文档与研究」开：任务开始后，右侧会出计划、来源资料和产物；默认不含终端。
```

## 最小复现

1. 从侧边栏「对话」进入新会话页，确认确认句与高亮的档位一致
2. 点击选项行「文档与研究」（此时一致）
3. 用项目选择器选中任一项目（本例 `demo`）
4. 观察：高亮仍是「文档与研究」，确认句却变成「这次按「代码」开…」

## 影响

- 用户在 0.1.2 收敛后的唯一模式入口上改档会得到与预期相反的结果：以为开的是「文档与研究」，实际按「代码」派生解释模式与工具面，且没有任何提示。
- 高亮与文案自相矛盾，用户无法判断自己将要开哪种会话。
- 影响面：新会话页 + 项目选择器组合（产品改成「先选项目再切档」时命中率更高）。

## 根因证据

```text
apps/desktop/src/renderer/domains/workspace-mode/components/WorkspaceModeSwitcher.tsx:17
  const { cwd, mode, setMode } = useWorkspaceMode();          # cwd = 路由 cwd（对话目录），读写都落在这个键

apps/desktop/src/renderer/domains/workspace-mode/hooks/useWorkspaceMode.ts:40-53
  cwd = cwdOverride ?? params.cwd ?? search.cwd ?? activeSessionCwd
  setMode → writeWorkspaceMode(map, cwd, next)                 # 用同一个（路由）cwd 写

apps/desktop/src/renderer/domains/conversation/components/new-session/useNewSessionPageModel.ts:136
  const { mode: workspaceMode } = useWorkspaceMode(contextCwd);# 提示句用 contextCwd

apps/desktop/src/renderer/domains/conversation/components/new-session/project-selector/project-selection.ts:79-88
  resolveContextCwd：selection.kind === "project" → selection.cwd   # 选中项目后 = 项目路径

apps/desktop/src/renderer/domains/conversation/components/new-session/useNewSessionPageModel.ts:187-188
  useNewSessionSend({ cwd: contextCwd, … })

apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts:416-418
  deriveSessionAxesFromWorkspaceMode(readWorkspaceModeFor(getDefaultStore().get(workspaceModeByProjectAtom), cwd))
                                                              # 会话能力面同样按 contextCwd 取键
```

结论：切换器写 `map[路由 cwd]`，提示句与会话派生读 `map[contextCwd]`；两者只在「未选中项目且 `defaultConversationCwd === 路由 cwd`」时偶然相等。

## 回归测试

建议最低层：组件/集成测试（jsdom）——挂载新会话选项行 + 提示句，注入「已选中某项目」的选择状态，断言：

1. 切换器显示值 === 提示句代表的档位；
2. 切换后新建会话派生的 `agentMode` / `capabilityProfile` 与切换后的档位一致（可用记录下来的 `openSession` 参数断言）。

若先做行为保持型重构（把「新会话页当前档位用哪个 cwd 取键」收敛成一个纯函数，例如 `resolveNewSessionWorkspaceCwd({ selection, routeCwd, defaultConversationCwd })`），则该纯函数可直接表驱动测试，切换器、提示句与会话派生三处共同消费它。

## 修复与验证

- 修复（2026-09-26）：`WorkspaceModeSwitcher` 增加可选 `cwdOverride`，并让新会话页把它显式下发下去——`NewSessionPageView` 传 `workspaceCwd={cwd}`（= `contextCwd`），`NewSessionOptionsRow` 转交给切换器。切换器此时直接按该 cwd 读写，不再隐式依赖路由 cwd；未传 `cwdOverride` 的宿主（`/project/$cwd`、会话页）行为不变。
- 测试：
  - `apps/desktop/src/renderer/domains/workspace-mode/components/WorkspaceModeSwitcher.test.tsx`：新增「显式 cwdOverride 时按该 cwd 读写，不跟随路由 cwd」——读到的档位来自 override cwd，写回的键也落在 override cwd，路由 cwd 键保持不受影响。6/6 通过。
  - `apps/desktop/src/renderer/domains/conversation/components/new-session/NewSessionOptionsRow.test.tsx`：新增「把生效的 workspace cwd 下发给切换器」护栏（接线回归）。3/3 通过。
- 检查：`bun run check` 的 lint（4602 files）、root/cli/desktop/docs/mobile 类型检查、mobile lint 均通过；`check:guards` 仅 `task-worktrees` 红，原因见「剩余风险」，与本修复无关。
- 实机验证（CDP，Debug Profile `04987e4e`）：选中项目 `demo` 后点击「文档与研究」→ 分段控件高亮、只读确认句（「这次按「文档与研究」开…」）与 `localStorage["vetta-workspace-mode"]` 三者一致，且写入的键是 `E:\demo`（会话派生读取的同一个键）；修复前该操作写的是对话目录键、确认句仍显示「代码」。
- 未运行及原因：真实 Provider 会话按该档创建的能力面断言未单独跑（需要一次真实模型调用）；本轮已用「同一 cwd 键」的静态链路 + 组件测试覆盖。
- 补充修复（2026-09-26，「新建项目」路径）：待创建项目在落盘前没有自己的 cwd 键，期间切换器把档位写在路由 cwd 上，而会话创建按新项目 cwd 派生——不处理仍会静默回落默认档。`useNewSessionProjectSelection.applyCreatedProject` 在项目落盘时把 `contextCwd` 上的档位随迁到新项目键，路由 cwd 上的原记录保留；`useNewSessionProjectSelection.test.tsx` 新增「待创建项目落盘时档位随迁」回归（8/8 通过）。至此「选中已有项目 / 未选中 / 新建项目」三条路径的切换器、确认句与会话派生全部按同一口径读写。
- 并行情况（已消解）：上轮记录中提到的「另一版修复」实为上面的 pending-create 随迁补丁——它与 `cwdOverride` 接线覆盖的是同一缺陷的不同路径，不是替代关系，两者均已保留。
