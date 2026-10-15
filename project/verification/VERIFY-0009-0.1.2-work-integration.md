---
id: VERIFY-0009
type: verification
status: done
owner: coordinator
source: 用户指令「发版 0.1.2 前期：把所有工作整合到本地 main 主树，确保可用最新功能」
created: 2026-09-26
updated: 2026-09-26
related_requirement: [REQ-0003]
related_plan: [PLAN-0003]
related_tasks: [TASK-0045, TASK-0046, TASK-0047, TASK-0048, TASK-0049]
related_bugs: [BUG-0022]
---
<!-- Copyright The Open Forge contributors. -->

# 0.1.2 发版前期：工作整合到本地 main 与可用性核验

## 被验证的合同

1. 本地 `main` 是否已成为所有未整合工作的唯一收口点，不存在仍可合并的散落 Worktree / 分支内容。
2. `worktree-sandbox-hardening` 的沙箱 fail-closed 行为合入后，定向测试、全仓门禁与公开入口构建是否通过。
3. 当前 `main` 是否已可本地构建为可用产物，作为 0.1.2 发版前的基线。

## Given / When / Then

- Given：本地有 4 个 Worktree（主树 + 2 个 codex detached + sandbox-hardening）与 6 个未提交台账文件
  When：提交台账、`merge --no-ff` 合入沙箱分支、清理无内容 Worktree
  Then：`main` 含全部已实现工作，`git status` 仅剩不入库的本机工具目录
- Given：沙箱 fail-closed 改变了「沙箱不可用」时的会话创建行为
  When：运行定向影响测试与全仓 `bun run check`
  Then：lint / types / 定向测试通过；`check:guards` 仅因与本改动无关的存量问题报红
- Given：0.1.2 需要本地可构建产物
  When：运行 `bun run build:desktop`
  Then：构建成功退出 0

## 环境与输入

- 提交 / 版本：整合前 `8517373c0`；台账提交 `da00d55d3`；合并提交 `01baa7bc0`；核验时 `main` = `ca92af469`
- 分支：`main`；合入 `worktree-sandbox-hardening`（tip `96dffa730`，fork 点 `1a552a4cf`，16 提交）
- 操作系统 / Runner：Windows（本机）
- Bun / Node：`bun 1.3.14`（`packageManager`），Node ≥ 20
- 输入与前置状态：`main` 干净；`worktree-sandbox-hardening` 工作树干净（`git status --short` 无输出）

## 实际命令与 CI 记录

```text
git status --short
git add <6 个台账文件>            # 逐文件，未用 git add .
git commit -F <msg>
git merge --no-ff -F <msg> worktree-sandbox-hardening
git worktree remove C:/Users/xquan/.codex/worktrees/881f/open-forge
git worktree remove C:/Users/xquan/.codex/worktrees/8314/open-forge   # 被拒
bun run check
bun run test:impact -- <7 个沙箱改动测试文件>
bun run build:desktop
```

- CI run URL / job：不适用（本地核验，未触发流水线）

## 结果

- 台账提交 `da00d55d3`：6 文件 / +20 −18，pre-commit 钩子通过。
- 合并 `01baa7bc0`：18 文件 / +737 −12；`ort` 策略**自动**合并 `.github/release-notes/v0.1.2.md`，无冲突。合并后该文件同时含 main 的「改进 / 其他」与分支新增的「修复」沙箱条目。
- `bun run check`：首轮 `check:guards` ❌ —— 仅 `task-worktrees` 3 项，均属 `TASK-0122` / `TASK-0123` 存量问题（由 `2f03d6e0f` 引入，与本次整合无关）。随后经用户确认修正两端合同（`branch` 规范化 + 互登 `conflicts_with`，提交 `3db03732e`），复跑已全绿：lint ✅（4601 文件）、types ✅（root / cli / desktop / docs / mobile）、guards ✅（`task-worktrees` 126 task(s) / 0 warning(s)）、mobile lint ✅。
- `bun run test:impact`（7 文件）：cli-host 2 文件 6 测试、coding-agent 3 文件 10 测试、runtime-desktop 1 文件 3 测试、runtime-node 1 文件 4 测试，**全部通过**（7 文件 / 23 测试）；其依赖构建 15 包全部成功，证明新公开入口 `@vetta/coding-agent/sandbox/errors` 可解析。
- `bun run build:desktop`：退出 0。
- Worktree：`881f/open-forge` 已删除；`8314/open-forge` 因索引为空（git 视整树为未跟踪）被拒，经临时索引比对确认其无 `main` 之外的新增文件、HEAD `1476219e2` 是 `main` 祖先，故保留未强删。

## 未运行的验证与原因

- `verify:ui:*` 与实机启动 Desktop：用户未明确授权实机验收，按仓库规则不运行。
- `bun run test:changed`：其基线为 `origin/dev`，会重跑自该基线起 21+ 提交的全部改动面；本次改动面已由 `test:impact` 的 7 个定向文件精确覆盖，故未重复运行。
- 沙箱模式实机会话创建：属实机验收，未运行；fail-closed 行为目前仅由合同测试锁定。

## 剩余风险

1. **`bun run check` 红灯已解除**：`TASK-0122` / `TASK-0123` 的 `branch` 已规范化为 `task/TASK-<4 位>-<kebab-slug>` 并互登 `conflicts_with`（`3db03732e`），`task-worktrees` 门禁随 `bun run check` 复跑恢复全绿。
2. **沙箱 fail-closed 行为变更未实机验证**：合入后，无沙箱环境下 `sandbox` 模式会话创建将显式失败（逃生口 `VETTA_SANDBOX_FAIL_OPEN=1`）。发布流水线的 staging guard 声称保障打包版，但 `BUG-0022` 记录的「发行包未内置沙箱组件」需在打包产物上复核。
3. **`8314` codex 工作树未清理**：索引异常（空），需 Codex 侧或用户裁决后以 `--force` 清理；已确认无独有文件，清理无损。
4. **0.1.2 发布说明与版本号未定稿**：`发布日期` 仍为「待发布定稿」且缺 `Upstream baseline: upstream/dev@<sha>` 行（`scripts/release-desktop.mjs publish` 会硬校验）；`apps/desktop/package.json` 仍为 `0.1.1`。
5. **并行会话**：本记录生成期间另一会话向 `main` 追加了 `2f03d6e0f`…`ca92af469`；继续整合前应先确认其已收口。
