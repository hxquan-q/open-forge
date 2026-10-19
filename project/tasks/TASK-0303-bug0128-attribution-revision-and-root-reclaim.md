---
id: TASK-0303
type: task
status: verifying
priority: P2
owner: project
requirement:
plan:
source: BUG-0128
related_requirement: []
related_plan: []
related_tasks: [TASK-0301, TASK-0302]
related_issues: []
related_bugs: [BUG-0128]
execution: serial
branch: main
worktree:
base_commit: 87e09ac04
read_paths:
  - project/bugs/BUG-0128-electron-low-integrity-label-sandbox-launch-failure.md
  - project/research/RESEARCH-0028-windows-agent-mic-low-label-attribution.md
write_paths:
  - project/bugs/BUG-0128-electron-low-integrity-label-sandbox-launch-failure.md
  - project/research/RESEARCH-0028-windows-agent-mic-low-label-attribution.md
  - project/tasks/TASK-0303-bug0128-attribution-revision-and-root-reclaim.md
  - project/tasks/README.md
  - project/research/README.md
  - project/bugs/README.md
  - .github/release-notes/v0.1.3.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# BUG-0128 归因修订（DSH 定案）与仓库根完整性标签全树重置

## 目标

把 BUG-0128 的错误归因（Codex）修订为已定案事实（DeepSeek Harness 的 workspace-write 沙箱物化），并把本机仓库树残留的继承式 Low 完整性标签一次性恢复为 Medium——依据 RESEARCH-0028 的 MIC 取低值规则，树内 Low 标签 exe 会以 Low 进程运行、写树外目标被拒，仅修 electron dist 不充分。

## 范围

### 并发评估

- 结论：不支持并行（单会话串行的文档修订 + 一次本机 ACL 运维动作）
- 执行方式：serial
- 可并行 Task：无
- 前置依赖：无（RESEARCH-0028 已在本 Task 内先行落盘）
- 冲突文件/独占路径：`project/bugs/BUG-0128-*`、`project/tasks/README.md` 焦点表
- Branch：main（本地工作区）
- Worktree：不拆——纯管理记录与本机运维，无生产代码改动，无并行写冲突
- 集成负责人：本会话
- 集成顺序：记录落盘 → 根重置与验证 → 台账回写 → 单次提交

### 做

- 执行仓库根一次性重标：`icacls . /setintegritylevel "(OI)(CI)Medium"`（root-only，靠 NTFS 继承自动翻转全树，已在临时目录实验证实）。
- 三步验证：根标签 Medium；抽查深层文件（如 `package.json`）为 `Medium (I)(NW)`；electron dist 显式 Medium 不受影响。
- 修订 BUG-0128：归因段落改为 DSH 定案（指纹 + 会话时间证据 + 排除依据），补 MIC 取低值规则影响，回链 RESEARCH-0028。
- 落盘 RESEARCH-0028、同步 tasks/research/bugs 索引与 v0.1.3 发布说明一句。

### 不做

- 不改生产代码：dev 路线已由 TASK-0302 启动器自愈覆盖（探测 `not-needed` 路径行为不变）。
- 不向上游提交 issue（用户自行执行，素材已备）。
- 不清除 DSH 的 DACL 残留（`S-1-4-*` 授权与 Everyone deny，无害；需 #8048 的 PowerShell 脚本，后续另议）。
- 不新增常驻 reclaim/tripwire 脚本（需要时另行立项）。

## Given / When / Then

- Given：仓库根仍带显式 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`，全树子项 `(I)` Low；BUG-0128 归因段落仍指向 Codex。
- When：在仓库根执行一次 `icacls . /setintegritylevel "(OI)(CI)Medium"`（PowerShell/cmd 或 `MSYS_NO_PATHCONV=1`），并完成归因修订落盘。
- Then：根为 Medium，全树继承项自动翻转为 `(I)` Medium；electron dist 显式 Medium 不变；BUG-0128 记录与取证事实一致；索引与发布说明同步。

## 必须保持

- 不改动 git 跟踪内容以外的任何文件状态：ACL 重标只动 NTFS 元数据（ChangeTime），不触碰文件内容与 git 索引。
- 其他并行会话的未提交改动不受影响（本任务只写上述台账文件）。
- BUG-0128 状态保持 `verifying`（人工验收仍待做），本任务不代行验收。

## 测试与验证

- 定向测试：icacls 三查（根 / 深层文件 / electron.exe）。
- 用户流程：不启动真实 `bun run dev`（非必需：无代码变化，启动器探针在无 Low 标签时走既有 `not-needed` 路径，已有 18/18 单测覆盖）。
- 质量检查：`bun run check:quick`；提交前按 Claude 专属补充执行完整 `bun run check`。

## 验收分层

- 工程验证：待执行；绑定 icacls 三查输出与 check 结果。
- 技术评审：自审；归因证据链见 RESEARCH-0028。
- 集成：与 frontmatter `integration_status` 一致，实际提交后回写。
- 人工功能验收：不适用（纯台账与本机运维，无产品行为变化；BUG-0128 本体的人工验收另行）。
- 发布：未授权；仅按规范补 v0.1.3 发布说明一句，不触发发布。

## 功能验收包

- 入口与前置条件：Windows 本机、仓库根 ACL 可写。
- 操作步骤：执行重标命令 → icacls 三查 → 复查台账与提交。
- 预期行为与最终产物：全树 Medium；BUG-0128/索引/发布说明更新。
- 不通过表现与已知限制：重标失败（ACL 拒绝）时保留现状并记录；DSH 残留 DACL 留存为已知无害限制。
- 验收反馈及回归案例：根标签再变 Low 时按 RESEARCH-0028 第 7 节 tripwire 方法对账。

## 交付记录

- 实际修改：BUG-0128 归因/影响/修复三节修订（DSH 定案、MIC 取低值规则、TASK-0303 回链）；新建 RESEARCH-0028 与本 Task；tasks/research 索引与 v0.1.3 发布说明同步。无生产代码改动。
- 实际运行：仓库根 `icacls . /setintegritylevel "(OI)(CI)Medium"`（exit 0，"Successfully processed 1 files"）；icacls 三查——根 `Medium Mandatory Level:(OI)(CI)(NW)`（原 Low）、`package.json` 与 `apps/desktop/package.json` 均 `Medium (I)(NW)`（NTFS 继承自动翻转）、`apps/desktop/node_modules/electron/dist/electron.exe` 显式 `Medium (NW)` 不受影响；`bun run check:quick` 通过（声明头 ratchet `new=0`）；`bun run check` 通过（types/guards 全 exit 0）。
- 未运行及原因：真实 `bun run dev` 未启动（无代码变化，启动器在无 Low 标签时走既有 `not-needed` 路径，18/18 单测已覆盖）；上游 issue 未提交（用户自行执行，素材见 RESEARCH-0028）；DSH 的 DACL 残留未清除（范围外，见不做项）。
- Worktree：未拆，理由见并发评估。
- 剩余风险：DSH reuse cache 位置未定位，后续 DSH 沙箱会话理论上可能重新物化 Low 标签——复发时按 RESEARCH-0028 第 7 节用根 ACL ChangeTime 对账 `~/.dsh/sessions/`；dev 启动器自愈（TASK-0302）继续作为边界。会话级触发点未钉死（zstd transcript 未解压），不影响工具级定案。
