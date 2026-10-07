---
id: TASK-0208
type: task
status: verifying
priority: P1
owner: coordinator
source: user-request；origin/chenxvhua 分支
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0030]
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 899f4fce5492dfd79ae7ad67bfee8bae54abdcc2
read_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md]
write_paths: [packages/plugins/presets/allstar-coding, .github/release-notes/v0.1.3.md, project/tasks/TASK-0208-integrate-allstar-coding-ac-fence.md, project/tasks/README.md]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-05
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# 集成 origin/chenxvhua 的 allstar-coding v0.4

## 目标与范围

把用户指定的 `origin/chenxvhua`（7 个提交）合并进本地 `main`，按事实解决发布说明冲突后跑门禁，通过则把 main fast-forward 推到 `origin/dev`。

不做：不改写分支内容、不替作者补实现、不推 origin/main、不发布。

## 并发评估

串行；主工作区合并，无并行写入。冲突候选只有 `.github/release-notes/v0.1.3.md`。

## Given / When / Then

- Given：`origin/chenxvhua` 相对 `main` 领先 7 个提交，唯一冲突候选是发布说明；When：合并、按事实解决冲突、跑门禁；Then：本地 `main` 含该批改动、门禁通过、`origin/dev` fast-forward 到合并结果。

## 必须保持

- 不把 `Upstream baseline` 改成不在 `upstream/dev` 的提交（分支侧把该行误改为 `5eecd278d`，真值 `d217984c72ef7b5f66ce0a6fea1ae2375060d425`）。
- 不覆盖、不回退、不夹带任何不是本次合并产生的改动；不 force push、不推 `origin/main`、不发布。
- 保留分支自带的对 allstar-coding 发布说明内容的扩写。

## 测试与验证

- `bun run check`（全量静态门禁）。
- 插件自身用例（`allstar-coding` 包 test 脚本，含 `test/fence-judge.test.ts`、`test/ac-audit.test.ts`）。
- 合并后复核 `git log origin/dev..main`，确认推送范围只含本批。

## 交付记录（2026-10-05）

- 实际修改：
  - 合并 `origin/chenxvhua` 进本地 `main`：30 个文件，2881 插入 / 129 删除，除 `.github/release-notes/v0.1.3.md` 外全部落在 `packages/plugins/presets/allstar-coding`。
  - 冲突只在发布说明：保留分支对 allstar 段的扩写与 v0.4 收口行，保留本地三条台账/CI 记录行，并把被误改的 `Upstream baseline` 恢复为 `d217984c72ef7b5f66ce0a6fea1ae2375060d425`。
- 验证命令与结果：
  - `bun run check`：exit 0（合并后的树）。
  - `bun run --cwd packages/plugins/presets/allstar-coding test`：4 个文件 / 98 项通过。
  - 边界扫描：`src/fence*` 只经 `ctx.fs`，无 `node:fs`、`eval`、`child_process`、`fetch`、`process.env`。
  - 推送前审计：`origin/dev..main` 9 个提交、反向为空，无夹带。
- 集成与推送：合并提交 `8935058fd`；记录提交 `c058ca693`；`git push origin main:dev` 把 `899f4fce5` fast-forward 到 `8935058fd`，`ls-remote` 复核一致。未推 `origin/main`、未 force、未发布。
- 未做及原因：ac-fence 未经实机端到端，人工验收待用户；插件权限扩张与 fail-open 的取舍留在 [ISSUE-0030](../issues/ISSUE-0030-allstar-coding-ac-fence-permission-and-records.md)。
- 剩余风险：该实现由贡献者分支进入、本仓无既有记录，验收级别仅到工程验证；权限集合是否属最小集合未裁决。

### 人工验收实测（2026-10-08，VERIFY-0017 组五；保持 verifying 待裁定）

清单条目是「启用 allstar-coding 后，子代理越权工具调用是否被 ac-fence 拦截、**越权时的提示是否可读**」。本轮分两路取证：判定器套件 + 拒绝文案原文。

| 取证路径 | 本次读数 |
|---|---|
| ac-fence 判定器 | `bun run --cwd packages/plugins/presets/allstar-coding test` → **4 文件 / 98 例通过**（`fence-judge`、`ac-audit`、`state-rules`、`manifest`），与交付记录一致。判定器为**纯函数**，用例无需 mock 宿主 |
| 越权提示是否可读 | 逐条读 `src/fence/judge.ts` 的 block `reason`：全部是**完整中文句子 + 处置指引**，例如越权写写「`ac-fence：越权写：<rel> 不在任务契约 scope 内（契约 scope: …；角色 … 基线 …）。需要扩展写域 → help_protocol」；无白名单 agent_type 写「请改用白名单内的 agent_type；确有特殊需要 → help_protocol」；未登记会话写「写操作被围栏拦截（本子代理无任务契约登记）」。⇒ **不是**裸错误码或英文短语 |
| 可读性有断言 | `test/fence-judge.test.ts:175` 「scope 外 block，reason 含 help_protocol 字样」→ `expect(verdict.reason).toContain("help_protocol")`；`:220` 同类断言 ⇒ 「reason 里带申诉通道」被测试固定住 |
| 拦截机制 | 拦截走 `plugin-sdk` `registerHook` + `PreToolUse`，越权即 `{ action: "block", reason }`（`src/fence.ts:87/107` 两处出口） |

- **未覆盖**：**真实子代理会话里的拦截**——即「启用 allstar-coding 后，子代理真的发起一次越权工具调用，看到的是上面这段提示」。这需要在 Debug profile 内启用该插件、起一个真实团队会话并诱导越权，本轮未构造（既需真实模型回合，又需插件启用态；且被 ISSUE-0031 的模型禁用所限）。
- **关闭建议**：判定逻辑与提示文案都在单测级被**直接断言**（含「reason 含 help_protocol」这一可读性锚点），机制出口（PreToolUse hook → block）可静态核对；缺的是真实会话取证。倾向 `done`，是否要求补一次真实越权会话，请用户裁定。
