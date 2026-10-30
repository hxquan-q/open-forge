---
id: BUG-0160
type: bug
status: verifying
priority: P2
owner: scripts/agents
requirement: REQ-0002
plan: PLAN-0019
source: TASK-0415 independent review a77a8d5b5df3b4648
related_requirement: [REQ-0002]
related_plan: [PLAN-0019]
related_tasks: [TASK-0415, TASK-0412]
related_issues: [ISSUE-0035]
created: 2026-10-30
updated: 2026-10-30
---
<!-- Copyright The Open Forge contributors. -->

# Git 对象头有损解码接受损坏协议字节

## 用户流程

- Given：开发工具读取已提交候选的完整 Git 差异证据。
- When：外部 Git 对象元数据或正文响应的对象头中，十六进制字符被置上最高位。
- Then：必须拒绝损坏响应，不能返回可用于分类与验证的正常证据。

## 实际行为

独立只读评审指出 objectHeader 使用 Buffer 的 ascii 解码。公开 readChanges 回归已确认：真实 Git 响应的首个对象头字节置高位后，旧解码清除最高位，使 metadata/body 两种损坏响应均错误返回正常证据。未证明普通仓库内容可直接触发的攻击链。

## 期望行为

对象头只接受协议规定的 ASCII 字节；任何损坏字节都应 fail-closed，不返回部分或正常证据。合法 UTF-8 正文、路径及对象上限不受影响。

## 环境与失败证据

- Windows 11、Node v26.3.1，任务分支 task/TASK-0412-delivery-blockers；基线 f33ff37ccdf3d239c55e7bcbe15022a0b650dcd0。
- 评审位置：scripts/agents/git.mjs 的 objectHeader；关键表达式 output.toString("ascii", offset, end)。
- 已通过真实临时 Git 仓库及外部进程转发 spy，分别将 --batch-check 与 --batch 首个对象头字节置高位；其余响应仍来自真实 Git。

## 最小复现

1. 在临时真实仓库建立 before/after 提交，从公开 readChanges 入口读取。
2. 仅在外部进程返回边界复制响应，将首个对象 ID 字节按位或 0x80；保留其余响应。
3. 断言读取抛错；旧解码下 metadata/body 两项均未抛错，取得有效 red（4.04 秒）。改用 latin1 后同命令两项通过（4.11 秒）。

## 影响

破坏 TASK-0415 的损坏对象协议拒绝合同。仅涉及本轮未提交开发工具候选，不等于已确认产品漏洞或历史广域超时根因。

## 根因证据

ASCII 解码不是无损字节验证；现有损坏协议测试只替换 ASCII 对象 ID，未覆盖高位字节。使用 latin1 保留字节值，再执行既有严格 ASCII 正则即可局部修复，无需公共 API 或安全模型变更。

## 回归测试

scripts/agents/git.test.mjs 的公开 readChanges 损坏协议合同，补 metadata/body header 两个高位字节拒绝场景。

## 修复与验证

- 修复：续接 TASK-0415，将对象头解码由 ascii 改为 latin1，保留高位字节供原严格正则拒绝；正文仍为 UTF-8，不改消费者、公共 API 或状态机。
- 测试：高位对象头两项有效 red/green；定向格式化后完整 git/policy 31/31 通过（46.63 秒），原 runner/integrate/release 三完整文件 22/22 通过（66.57 秒），保留原断言及超时。
- 技术评审：原评审者 a77a8d5b5df3b4648 只读复核确认本项 P2 已处置，未发现返修新可确认问题；未独立运行测试，不等于完整候选验收或集成批准。
- 检查：返修后 buwu0sjd3 的完整 check、diff 及 TASK-0415/0412 定向合同均退出 0。第五批 bhgpw7sg8 的 quality 为 716 通过、4 项原 5000ms 超时（224.99 秒，runner 两项、integrate 一项、draft 恢复一项），runner 同例另报清理 EPERM；未进入包测试。未发现本缺陷回归，但完整候选仍红且未集成，保持 verifying。
- 未运行及原因：未验证普通仓库攻击链、真实对象库损坏或广域超时/EPERM 的共同因果；未调用真实控制器、模型、Desktop 或发布。
