---
id: TASK-0454
type: task
status: in_progress
priority: P1
owner: scripts/agents
requirement: REQ-0019
plan: PLAN-0029
source: user-request
related_requirement: [REQ-0019]
related_plan: [PLAN-0029, PLAN-0019]
related_tasks: [TASK-0451, TASK-0455]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit:
read_paths:
  - scripts/agents/runner.mjs
  - scripts/agents/evidence.mjs
  - scripts/agents/git.mjs
  - scripts/agents/adapters.mjs
  - scripts/agents/doctor.mjs
  - scripts/agents/process.mjs
  - schemas/agents/adapters.schema.json
  - schemas/agents/evidence.schema.json
write_paths:
  - scripts/agents/runner.mjs
  - scripts/agents/runner.test.mjs
  - schemas/agents/evidence.schema.json
  - scripts/agents/README.md
exclusive_paths:
  - scripts/agents
depends_on: [TASK-0451]
conflicts_with: [TASK-0451, TASK-0452, TASK-0455]
integration_status: pending
created: 2026-11-06
updated: 2026-11-06
---
<!-- Copyright The Open Forge contributors. -->

# 评审独立：只读候选与独立上下文（PLAN-0029 Phase 1.3）

## 目标

评审独立性从“模型 family 不同”扩展为：独立上下文、未参与实现的身份、只读候选。由 TASK-0451 原草稿拆出。

## 调查结论（2026-11-06，只读核对）

- 已有：`evidence.mjs` 校验评审 actorId 不在 authors 中、family 不同（可配置），并以 digest 绑定 review.binding；“评审身份不在实现者集合”无需再做。
- 缺口：adapter `isolation` 可声明 `external-sandbox` / `read-only` / `none`，但 `adapters.mjs` 只拒绝 `none`，`read-only` 未被落实；`doctor.mjs` 也注明标签本身不可信。
- 评审与实现在同一 worktree 运行（`runner.mjs`），只靠评审前后 head/tree 不变检测改动。
- `orchestrate.mjs` 选择评审 adapter 时仅排除同 family，没有上下文标识。
- 合同约束（定稿依据）：`evidence.schema.json` 的 `identity` 为封闭对象（`additionalProperties: false`），新增 `contextId` 须同步 schema 并保持可选，兼容存量 run；`assertExecutionBoundary` 绑定仓库 common dir，同一仓库的 detached worktree 不使证明失效；`snapshot()` 的 clean 检查可检出未提交改动。

## 范围

### 并发评估

- 结论：不支持并行（共享 `scripts/agents`）。
- 执行方式：serial；集成顺序 0451 → 0454 → 0455。

### 做（2026-11-06 定稿）

- 只读候选实现方式：控制器为每次评审 attempt 创建独立 detached worktree（`git worktree add --detach`）于任务 worktree 的兄弟路径（任务 worktree、状态目录与仓库之外），检出已记录 `run.binding.head`；评审进程 `cwd` 指向该候选。不用文件系统 ACL/只读位（Windows 不可靠且需提权）。“只读”的落实 = 候选与集成工作区物理分离 + 事后核对：集成候选（任务 worktree）在评审期间不被评审进程触及。
- 评审前后对候选各做一次 `snapshot`（head/tree/clean）；结束后 head/tree 不变且 clean 才通过（统一按 “reviewer modified the candidate” 拒绝），随后 `git worktree remove --force` 清理；清理失败则本次评审失败，不静默遗留候选。任务 worktree 在评审前仍须等于已记录 binding（既有检查保留）。
- `contextId` 来源：控制器生成，不采信 adapter 自报。取本次执行的 canonical 工作根路径——实现 attempt 为任务 worktree，评审 attempt 为本次 detached 候选；写入 attempt 的 `identity`。`evidence.schema.json` 的 `identity` 增加可选 `contextId`（存量 run 兼容）。
- 上下文分离检查：评审的 `contextId` 与任一实现者相同即拒绝（runner 内导出的纯函数断言；`evidence.mjs` 既有断言不动）。
- isolation 可信来源定稿：adapter 配置的 `isolation` 仍只是执行要求声明（`none` 继续被拒），控制器不因声明放宽任何检查；计入的隔离只有控制器自己落实的部分——detached 候选 + 事后核对 + 上下文分离，记入 README。analysis 角色（planner/triage/lessons/ui-reviewer）维持现状（任务 worktree 执行 + “不得改动”事后核对）。

### 不做

- 不用 ACL/只读位实现只读；不新增 `writes: true` 角色 × `isolation: read-only` 的静态组合校验。
- 不改 `evidence.mjs` 的既有独立性断言与 checks/CI 绑定（TASK-0451）；不启用真实 adapter（TASK-0452）；不动 `adapters.mjs`/`orchestrate.mjs`。

## Given / When / Then

- Given 已记录实现 binding 的 run 与干净任务 worktree / When 评审执行 / Then 控制器以 `run.binding.head` 创建 detached 候选，评审在候选上运行，结束后候选 head/tree/clean 不变且候选被清理，attempt 的 `identity.contextId` 与所有实现者不同。
- 失败用例：无已记录 binding 的评审、评审改动候选（提交或弄脏）、清理失败、评审 contextId 与实现相同，均拒绝且 run 不进入下一轮、任务 worktree 不受影响。
- 既有行为：implementer/analysis 角色的执行路径与断言不变；`applyIntegration` 与集成证据断言不削弱。

## 测试与验证

- 失败用例先行；`runner.test.mjs` 新增候选创建、事后核对、清理与 contextId 分离断言；`scripts/agents` 全量测试经仓库 runner；`bun run test:impact -- <files>`；`bun run check:quick -- <files>`。

## 交付

- 实现：`runner.mjs` 导出 `assertDistinctContext`（纯函数，评审 contextId 与任一实现者相同即拒绝）与 `removeReviewCandidate`（`git worktree remove --force`，失败包装为该次评审失败）；reviewer attempt 由控制器在任务 worktree 兄弟路径创建 detached 候选（检出 `run.binding.head`），进程 `cwd` 指向候选，前后 `snapshot` 比对 head/tree/clean，结束后强制清理且清理失败按评审失败处理（finally 中不覆盖既有失败）；`contextId` 控制器生成写入 attempt `identity`（实现为任务 worktree，评审为本次候选路径）；`evidence.schema.json` 的 `identity` 增加可选 `contextId`（存量 run 兼容）；README 记录评审隔离落实方式与 isolation 声明不放宽检查的定稿。分派前先修复子代理测试中的一处同步 throw 断言错误（`removeReviewCandidate` 同步抛出，`rejects.toThrow` 不可达）。
- 技术评审：主会话对两个子代理的 diff 逐变量自审（候选创建/清理顺序、失败路径不泄漏候选、contextId 路径字符串与 `assertSeparateRoots` 返回值一致性、schema 可选字段兼容、错误文案）；未引入独立评审身份，不宣称独立评审。
- 实际验证（2026-11-06）：失败用例先行（RED 运行 4 failed | 11 passed，含目标错误文案）后实现转绿；`runner.test.mjs` 15 例通过；`scripts/agents` 全量 22 文件 188 例经仓库 runner 串行通过；`bun run check:quick -- <4 个改动文件>` 通过；`bun run test:impact -- <4 个改动文件>` 67 文件 832 例通过。
- 偏离与异常：其中一次全量串行运行出现 1 例失败（输出截断未能定位用例），随后两次全量复跑 188 例全绿（其中一次完整日志留存）；判定为 Windows 环境偶发（疑为 worktree 清理文件锁），如再次复现按新失败处理修复。
- 未运行与风险：完整 `bun run check` 未运行（docs-site 与 mobile 为既有环境问题，见 TASK-0448 记录）；真实评审进程在 detached 候选上的行为（路径假设、进程污染）未经真实 adapter 验证，留待 TASK-0452 端到端。
- 本提交保存至 `xquan`，目标 `origin/xquan`；`integration_status` 保持 pending。人工验收：不适用（内部控制器合同，无用户可见行为），完成标准为全量测试与门禁通过。
- 发布：不适用
