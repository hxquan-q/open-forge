---
id: VERIFY-0023
type: verification
status: done
priority: P1
owner: apps/desktop/agent-teams
source: 用户授权「可以使用 qwen3.8 27b 进行测试」（2026-10-24）
created: 2026-10-24
updated: 2026-10-24
related_requirement: [REQ-0002, REQ-0006]
related_plan: [PLAN-0024]
related_tasks: [TASK-0396, TASK-0402, TASK-0403]
related_bugs: [BUG-0151]
---
<!-- Copyright The Open Forge contributors. -->

# qwen3.8-27b 真实模型团队会话：端点恢复确认与通知链路行为验证

## 被验证的合同

1. ISSUE-0031 复测：qwen3.8-27b 端点输出是否恢复连贯。
2. BUG-0151 修复（TASK-0396，集成提交 `e78cad175`）在真实模型下的行为：成员错峰完成 → 通知唤醒 leader → 收尾后立即处理下一批通知（不依赖 30 秒恢复扫描）。
3. 集成后的团队链路（含 TASK-0395/0402/0403 优化）在真实 Provider 下无回归。

## Given / When / Then

- Given：Debug 实例（隔离 Profile `04987e4e`）与有效凭据；When：对 `qwen3.8/qwen3.8-27b` 发极简判别「只回复两个字：你好」；Then：精确回复「你好」（VERIFY-0018 时输出不连贯英文片段）。
- Given：「开发团队」4 成员、会话模型已切换为 qwen3.8-27b；When：要求 leader 委派两个独立任务（检索员建 notes-a.txt / 开发员建 notes-b.txt）；Then：两文件按指定内容创建、leader 汇总「两个任务均已完成」、UI 终态「已结束 已完成 2」。
- Given：两成员任务分别完成并持久化通知；When：协调文档检查；Then：存在两条 `agent-team.task-notification.v1` 记录（retry-a / retry-b），leader 被两次唤醒。

## 环境与输入

- 提交：main `1515a91dd`（PLAN-0024 五项优化全部集成后）。
- Windows 11 x64、Bun 1.4.2、Debug Profile `04987e4e`（隔离 vettaHome）。
- 端点：qwen3.8 `http://183.36.30.83:18081/v1`（openai-responses），preflight `ready` 1179ms。
- 首轮失败（配置残留）：leader 会话模型为 `gpt/gpt-6-luna`（不可达），AI_TRANSPORT_FAILED 两次自动重试耗尽 → `attention-required`（TEAM_RECOVERY_EXHAUSTED）——恢复预算与终态语义按 ADR-0125 正确工作，非本批缺陷。
- 切换模型为 qwen3.8-27b 后发第二条消息恢复：leader 用 team_retry_task 恢复两个任务。

## 实际命令与记录

- `bun run verify:ui:start:debug` / `pw:debug`（Playwright 驱动真实 UI）
- UI 操作：跳过新手引导 → 切换智能体 → 选「开发团队」→ contenteditable 输入（React 受控编辑器需 Playwright type，execCommand 无效）→ 模型选择器键盘打开（focus+Enter）→ 选 qwen3.8-27b → 发送恢复消息。
- 协调文档与 usage 从隔离 vettaHome 的 JSONL 直接解析。

## 结果

| 项 | 结果 |
|---|---|
| ISSUE-0031 端点 | **已恢复**：极简判别精确回复「你好」 |
| 首轮 leader 失败处理 | AI_TRANSPORT_FAILED → provider-unavailable → 2 次自动重试 → attention-required，完全符合 ADR-0125 |
| 委派执行 | qwen3.8 leader 正确用 team_delegate_task/team_retry_task 分派两个成员 |
| 文件产物 | notes-a.txt=`task-a done`、notes-b.txt=`task-b done`，内容精确 |
| 通知链路 | 协调文档两条完成通知（retry-a/retry-b）；leader 两次被唤醒并两次输出「两个任务均已完成」；无 30 秒等待痕迹 |
| UI 终态 | 「已结束 已完成 2」 |
| usage（22 次调用） | input 165,276 / output 3,849 / cacheRead **784,400（82.6% 命中）**；端点未上报价格，成本不可核算 |

## 未运行的验证与原因

- 逐 token 审查模型输出质量：27B 模型行为评估超出本次范围（软件合同验证为主）。
- 多团队/大规模并发：单团队双任务已覆盖通知交错核心路径。
- Fresh Profile 完整重装链路：非本次目标。

## 剩余风险

- 「两次汇总输出相同文本」符合 BUG-0151 修复后的预期（第一批通知唤醒汇总 + 第二批通知收尾后立即再汇总），但也可能是模型重复输出；已由协调文档两条通知记录佐证前者。
- qwen3.8 对复杂多工具任务的委派质量未系统评估。
