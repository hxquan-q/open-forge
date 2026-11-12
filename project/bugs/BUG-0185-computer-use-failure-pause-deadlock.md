---
id: BUG-0185
type: bug
status: verifying
priority: P1
owner: desktop
requirement: REQ-0033
plan: PLAN-0031
source: user-report-2026-11-12
related_requirement: [REQ-0033]
related_plan: [PLAN-0031]
related_tasks: [TASK-0482]
related_issues: []
created: 2026-11-12
updated: 2026-11-12
---
<!-- Copyright The Open Forge contributors. -->

# 电脑操作一次动作失败即进入 paused 死锁，AI 无法自恢复

## 用户流程

- Given：Windows x64，电脑操作已开启并授权，AI 正在观察并操作桌面。
- When：AI 的任一次动作失败——画面变化后沿用旧截图引用点击（stale_reference）、坐标超出截图范围（invalid_input）、截图或后端动作失败（backend_failed），或用户打断 AI 回合导致工具调用中止。
- Then：会话应保持可用，AI 收到错误原因后重新观察、重试或报告；不应需要用户人工点「继续操作」才能继续。

## 实际行为

控制器把「动作失败」与「人工暂停」折叠进同一个 `paused` 相位：`execute()` 中任何 `!result.ok` 一律 `patch({ phase: "paused" })`，异常路径（含 agent 侧 signal abort）同样落 paused。而 `execute()` 的相位门卫 `phase !== "ready"` 拦截包括 `observe` 在内的所有工具调用，AI 只能反复收到 `{"ok":false,"code":"paused"}`，没有任何自救出口；唯一出口是 control 层的人工 `resume`/`grant`。UI 侧 `stale_reference` 文案写着「请让 AI 重新观察后再操作」，但照做被门卫拦死，形成死锁。

触发面不限于模型偷懒连点：后端规定每次动作成功后截图 revision 作废（`executor.py` 成功动作后 `self.shot = None`），模型跳过重新观察即触发 `stale_reference`；坐标越界、截图失败、传输异常、回合被打断等任何一次失败都同样锁死。与后端成功回执「Action completed. Observe the desktop again before the next action.」指示的恢复路径自相矛盾。

## 期望行为

结构化失败不等于会话需要人工接管。后端返回结构化错误（进程存活、held-input 已释放），或停止回执确认释放时，会话保持 ready：AI 收到错误码，可立即重新观察并重试；错误码保留在 `issue` 供 UI 提示，下一次成功动作清除。人工「暂停」语义不变：仍拦截包括 observe 在内的所有 AI 动作，需人工「继续操作」恢复。停止未确认（`stop_failed`）的失败关闭路径不变。

## 环境与失败证据

- 应用版本、提交、操作系统与相关工具版本：Windows 11 x64（build 26200）；用户 2026-11-12 报告（四项缺陷审计指控 3，工作区 tihu-blackbox 目录旁证）。
- 失败测试/CI 用例与命令：修复前新增的 3 例控制器测试失败——动作失败后 `observe` 应可用、传输异常+停止回执成功后应可继续、回合中止后应回 ready；实际均收到 `paused`。
- CI run URL 与脱敏后的关键输出（若适用）：不适用。
- 基线对照或重跑结果：旧实现 3 failed / 13 passed；修复后 desktop 包 computer-use 相关 9 文件 47 用例全部通过。

## 最小复现

1. 开启电脑操作并授权对话，让 AI 观察后连续执行两次点击（第二次沿用第一次观察的 revision）。
2. 第二次点击返回 `stale_reference`，会话进入 paused。
3. AI 随后发起 `computer_observe` 也被拒（`code:"paused"`）；只有用户在电脑操作面板点「继续操作」才恢复。

## 影响

全局桌面操作最易反复撞上的可用性缺陷：正常工作流内的恢复动作（失败后重新观察）被失败处理本身禁止，任何单次失败（含用户打断回合）都要求人工干预才能继续，长任务无法无人值守。

## 根因证据

- `controller.ts` execute：`if (!result.ok)` 一律 `patch({ phase: "paused", ... })`；catch 分支 `interrupt()` 成功后同样 patch paused。
- `controller.ts` execute 门卫：`if (phase !== "ready") return failure(phase)` 拦截一切工具调用，observe 无豁免。
- `executor.py` act：任何物理动作成功后 `self.shot = None`；`map_point` 坐标越界抛 `invalid_input`；`server.py` 把 `DesktopError` 与未知异常折叠为 `{"ok":false,"code":...}` 结果。
- 现有测试只钉人工 pause/resume（controller.test.ts），无任何用例钉「失败→paused」，ADR-0154 也仅把暂停/停止定义为人控生命周期合同。

## 回归测试

- `controller.test.ts`：`stale_reference`/`invalid_input`/`backend_failed` 三类结果失败后会话保持 ready、issue 保留错误码、observe 成功后 issue 清除；传输异常且停止回执成功后 observe 可用；agent 侧中止后回 ready 无需人工 resume；人工 pause 仍拦截包括 observe 在内的全部动作（既有用例扩展）。

## 修复与验证

- 修复：`execute()` 结果失败路径回 `ready` 并保留 `issue`，成功路径清除 `issue`（顺带修复失败后 issue 残留）；异常路径在 `interrupt()` 停止回执确认后，仅当发生 control 撤销（epoch 变化，由暂停/停止流程自行落终态）时不再 patch，否则回 `ready`（agent 中止不带 issue，传输失败带 `backend_failed`）。`interrupt()` 失败的 `error/stop_failed` 失败关闭路径不变；顺手移除 try 块入口重复的 `throwIfAborted()`。
- 测试：desktop 包 computer-use 相关 9 文件 47/47 通过（旧实现上新增 3 例失败）；`bun run --cwd apps/desktop typecheck:incremental` 通过。
- 检查：`check:quick`（改动文件）守卫中 package-boundaries / coding-agent-architecture / context-boundary / autonomy / runtime-failure-contract 全过，仅存量 WAIVER-0011/0012 过期失败（与本次无关，ratchet new=0）。
- 未运行及原因：未操作用户真实桌面与运行中的 Desktop；真实会话中「失败后 AI 自动重新观察并恢复」的端到端体验待用户下次使用验收。
