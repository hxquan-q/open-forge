---
id: ISSUE-0031
type: issue
status: draft
priority: P2
owner: packages/ai
related_requirement: []
related_plan: []
source: VERIFY-0018（用户要求用 qwen3.8 实测当前应用）
created: 2026-10-08
updated: 2026-10-08
---
<!-- Copyright The Open Forge contributors. -->

# qwen3.8-27b 端点输出不连贯，任何 prompt 都无法获得可用回复

## 背景

按 [VERIFY-0018](../verification/VERIFY-0018-qwen38-real-provider-smoke.md) 用 Debug Profile 实测 `qwen3.8/qwen3.8-27b`（`http://183.36.30.83:18081/v1`，`openai-responses`）。鉴权、目录、会话生命周期、usage 归一化与 Prompt 缓存（97.2% 读命中、`extended` 前缀）全部正常，但模型正文始终不连贯。

## 已知事实

- 三类输入输出全部不可用：Todo+读文件任务（out=17，一句无关清单行）、续聊（out=1263，复述系统提示/技能片段长文）、极简「只回复两个字：你好」（仍输出无关英文片段）。
- 输出内容围绕系统提示词与 Skill 描述自由联想，表现为模型**实际只见到了系统侧上下文、用户消息未生效**的形态。
- 同 adapter、同网关生态的对照 `glm/glm-5.3-flash`（`:16800`）对相同 prompt 精确回复「你好」——本仓请求构造与 `openai-responses` adapter 无普遍缺陷。
- `provider.preflight` 对该模型返回 `ready`、`stop`、`cacheUsageReporting: read-only`，凭据有效。
- 会话 JSONL 中请求前缀指纹连续两轮稳定（`prefixStatus: extended`、`changedSegments: []`），我方发送侧未见异常。

## 未决问题

- 端点 `/responses` 实现是否丢弃或错放 `input` 项里的用户消息，或
- 后端实际部署的并非可用的 qwen3.8-27b instruct 模型 / chat template 错误，或
- 本 adapter 与该端点 Responses 实现的某个字段口径不兼容（glm 未触发的边界）。

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| A：重开 Debug 实例，`VETTA_PROVIDER_OBSERVATION_CAPTURE=wire` 抓一次 wire | 直接看到端点收到的请求与返回正文 | 需重启在跑 Debug 实例；wire 档含对话正文，只在隔离 Profile 短期用 | 低 |
| B：核查该端点实际部署的模型与 `/responses` 实现（网关运维侧） | 若是部署问题可直接修复，无需改仓 | 需要端点 owner 配合，本仓拿不到证据 | 低 |
| C：暂将默认/测试模型切到 glm-5.3-flash 等已验证模型 | 立刻恢复可用 | 不解决 qwen3.8 本身 | 无 |

## 推荐

先 B（联系端点 owner 确认部署与模板）再 A（wire 档对比 glm/qwen 两条端点的请求差异）；若 B 证明端点正常而请求被错放，再转 Bug 审 adapter 对该实现的兼容面。

## 决策触发条件

qwen3.8 被要求作为可用测试/使用模型时必须先闭合本 Issue；此前该 modelKey 不应用于任何真实流程验证。

## 后续 Task

未定；若 A/B 定位到仓内 adapter 缺陷，转 BUG 并挂修复 Task。
