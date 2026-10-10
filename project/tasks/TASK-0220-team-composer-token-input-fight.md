---
id: TASK-0220
type: task
status: verifying
priority: P1
owner: apps/desktop conversation
requirement:
plan:
source: BUG-0084（team 会话引用文件后输入框反复重建内容，中文输入法组字被打断）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0084]
execution: serial
branch: main
worktree: main-workspace
base_commit: 66a59d25e
read_paths: [apps/desktop/src/renderer/domains/conversation/components/input-bar/editor, apps/desktop/src/renderer/domains/conversation/connectors/team, apps/desktop/src/renderer/shared/lib/input-tokens]
write_paths: [apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/plugins/ControlledValueBridgePlugin.tsx, apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/ControlledValueBridge.test.tsx, .github/release-notes/v0.1.3.md, project/bugs/BUG-0084-team-composer-token-input-ime-fight.md, project/bugs/README.md, project/tasks/TASK-0220-team-composer-token-input-fight.md, project/tasks/README.md]
exclusive_paths: [apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/plugins/ControlledValueBridgePlugin.tsx]
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# 受控投影判等只看文本可承载身份：修复 team 输入框引用文件后与用户抢键盘

## 目标

草稿文本等价时，受控编辑器不再被投影重建：token 的展示元数据（`isDirectory`、`label`、`iconUrl`、`alias`、`icon`、`avatar`、`meta`）不参与判等，只有文本无法表达的差异（kind 不同、路径/名字/文本不同、数量不同）才触发 `$applySegments`。修复后 team 会话在引用文件后能正常输入（含中文输入法组字）。

## 范围

### 并发评估

- 结论：不支持（单一实现文件 + 一个测试文件，串行即可）。
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无
- 冲突文件/独占路径：见 frontmatter `exclusive_paths`；`project/bugs/README.md` 与 `project/tasks/README.md` 已有他人未提交修改，本次只追加行
- Branch：main
- Worktree：main-workspace（未声明独立 worktree）
- 集成负责人：本次实施者（串行）
- 集成顺序：不适用

### 做

- `ControlledValueBridgePlugin.tsx`：`inputSegmentsEqual` 改为**规范判等**——先比两侧 `segmentsToText` 全等（文本无法表达的差异在这里兜底），再逐项比结构：kind 严格相等，token 只比 wire 身份（member：`memberId` + `handle`；skill/scene/connector：`name`；file/image：`path`），文本段内容由规范序列化承担。展示元数据（`isDirectory` / `label` / `iconUrl` / `alias` / `icon` / `avatar` / `meta`）与序列化器合成的分隔空格不再参与判等；理由写进注释（编辑器是元数据拥有者，投影由文本解析而来）。
- 保留 effect 第一道闸门 `segmentsToText(currentSegments) === value`（文本不等必须同步）与 `CONTROLLED_SYNC_TAG` 防回环。
- 新增回归测试 `ControlledValueBridge.test.tsx`：
  1. 文件 token 草稿下 `insertPlainText("你")` 不触发投影重建，且编辑器保留 token 与输入字符；
  2. 带展示名的 connector token 在父组件重渲染后同样不被重建；
  3. 外部写入不同内容时仍会同步（比较放宽不等于不同步）。
- 发布说明：`v0.1.3.md`「修复」追加一条（用户可见：team 输入框恢复可输入）。

### 不做

- 不改 `TeamComposerConnector` / `useTeamChatModel` 的投影构造（文本 + mentions 的既有合同）。
- 不改 `parseInputSegments` / `serializeInputSegments` 的 wire 格式与 `deriveAttachments` 语义。
- 不改 `$applySegments`（仍用于挂载对齐、外部写入、历史导航）。
- 不为 file/image kind 之间加等价（各插入入口都按 `isImagePath` 分流，字符串不可表达的差异不由本任务放宽）。

## Given / When / Then

- Given：受控 `InputEditor`（team 形态）草稿里有文件 token（或带展示名的 connector token）。
- When：用户在该 token 之后打字（含中文输入法组字），或父组件因流式更新重渲染。
- Then：投影判定为等价、不回写编辑器；输入字符落在光标处，组字不被打断，token 保留。
- Given：外部值真的变化（另一段文本/别的 token）。
- When：受控 effect 运行。
- Then：编辑器按新投影同步（行为不回归）。

## 必须保持

- 文本不等时必定同步（外部清空、重编辑回填、历史导航、mention 偏移变化都走这条）。
- 编辑器 token 的 `isDirectory` / 展示元数据不被投影抹掉；`setDraft` 的 attachments 仍由编辑器读出的 segments 派生。
- 防回环 tag 与 `projectedValueRef` 语义不变。

## 测试与验证

- 定向测试：`bun --cwd apps/desktop run test -- src/renderer/domains/conversation/components/input-bar/editor/ControlledValueBridge.test.tsx src/renderer/domains/conversation/components/input-bar/editor/InputEditor.test.tsx src/renderer/domains/conversation/connectors/team/TeamComposerConnector.test.tsx src/renderer/domains/conversation/connectors/team/useTeamChatModel.test.tsx`
- 用户流程：jsdom 重放「引用文件 → 继续输入」；真实输入法组字属人工验收（见验收分层）。
- 质量检查：`bun run check:quick`（中间轮）与 `bun run check`（收尾），另跑 `bun run test:impact`。

## 验收分层

- 工程验证：通过；绑定下方交付记录的命令与结果（定向 62 例、impact 110 例、完整 check 全绿）。
- 技术评审：自审；判等放宽的边界由测试 3（外部真值仍同步）与既有 `InputEditor`/`TeamComposerConnector` 用例覆盖。
- 集成：集成于 main 工作区串行提交；实际提交见交付记录。
- 人工功能验收：待验收（中文输入法组字与实机文件粘贴只能在实机确认；修复前必现）。
- 发布：未授权。

## 功能验收包

- 入口与前置条件：dev 模式 Desktop，进入 team 会话。
- 操作步骤：资源管理器复制一个文件 → 在输入框粘贴出现文件 token → 切中文输入法输入一句话；随后发送消息确认内容与附件正确。
- 预期行为与最终产物：能连续输入不被取消，光标不跳动，token 保留，消息正常发出且附件/引用正确。
- 不通过表现与已知限制：候选仍被取消/字符不落地即为未修复；token 展示元数据（如文件夹图标）仍由编辑器持有，属预期。
- 验收反馈及回归案例：（待用户反馈）

## 交付记录

- 实际修改：
  - `apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/plugins/ControlledValueBridgePlugin.tsx`：`inputSegmentsEqual` 拆为 `sameProjectionSegment`（kind + wire 身份）与规范序列化比较（`segmentsToText(left) === segmentsToText(right)`），展示元数据与合成分隔符退出判等；注释记录 BUG-0084 的成因与边界。
  - `apps/desktop/src/renderer/domains/conversation/components/input-bar/editor/ControlledValueBridge.test.tsx`（新）：3 例——文件 token 后打字不触发投影重建、带展示名的 connector token 在父组件重渲染后不被重建、外部真值变化仍同步。
  - `.github/release-notes/v0.1.3.md`「修复」一条（迁移前手写版本，按近期实践直接追加）。
- 实际运行：
  - 定向 7 文件 62 例全绿：`bun --cwd apps/desktop run test -- <ControlledValueBridge/InputEditor/InputBarFileReference/InputBarMention/TeamComposerConnector/useTeamChatModel/TeamChatDelegationFlow>.test.tsx`。
  - 红/绿证据：新回归测试在旧判等语义下（临时恢复 `text` 逐字符比较与 `isDirectory` 比较）报 `expected 2 to be 1`；完整修复后 3 例全绿；探针实测修复前文件 token 每步 +2 次 `$applySegments`（1 次为测试自身调用），纯文本仅自身 1 次。
  - `bun run test:impact -- <两个改动文件>`：direct 1 文件 / 3 例 + related 23 文件 / 107 例全绿。
  - `bun run check`：lint、mobile-lint、check:types（root/cli/desktop/docs/mobile）、check:guards 全部 exit 0；首轮红为 `check-modified-file-notices`（修改 upstream 文件与新增测试缺声明头），补声明头后单跑守卫 `new=0` 并重跑完整 check 全绿。
- 未运行及原因：真实输入法与实机粘贴文件的人工验收未运行（需用户实机；修复前必现已由用户报告与测试级证据支撑）。
- Worktree：未拆出；serial + `exclusive_paths` 已声明。
- 集成：main 工作区串行提交 `c68ece72c`（修复 + 回归测试 + 发布说明）；本条记录随任务记录提交落地，未推共享分支。
- 剩余风险：判等放宽后，token 展示元数据的变化（如成员改名后的 chip 文本）不会立刻回写编辑器——这是有意的（编辑器持有元数据，回写会重建内容）；外部文本真值变化仍走同步（测试 3 覆盖）。`file`/`image` kind 不互相放宽，各插入入口均按 `isImagePath` 分流。

