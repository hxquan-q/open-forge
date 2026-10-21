---
id: REQ-0024
type: requirement
status: ready
priority: P2
owner: desktop
source: user-request（2026-10-20：模型选型区显示当前 API Key 余额；Coding/Agent Plan 套餐显示 5 小时/周/月额度。2026-10-21 收窄：首期 DeepSeek+Kimi，ARK 押后；会话 token 小字部分撤销）
related_requirement: [REQ-0017]
related_plan: []
related_tasks: [TASK-0346]
related_issues: []
related_bugs: []
created: 2026-10-20
updated: 2026-10-21
---
<!-- Copyright The Open Forge contributors. -->

# 模型选型区服务商余额显示

## 用户问题

希望在模型选型处直接看到当前 API Key 的余额;若是套餐(Coding Plan / Agent Plan)还想看到 5 小时/周/月额度。

## 调研结论(2026-10-20)

- 余额接口逐家核实:DeepSeek(`GET /user/balance`)与 Kimi(`GET /v1/users/me/balance`)纯 API Key 可查;OpenAI/Anthropic 无余额接口(仅 org 级 cost,需 Admin Key);Gemini/Grok/Z.ai/Qwen 无。
- **ARK 用量属火山控制面**(`/open/GetAFPUsage` 等,V4 签名/STS 或 AK-SK),数据面 API Key 大概率调不通 → **押后待实测**。
- app 已有 `SubscriptionWindow`(5h/周/月)UI,但数据源是云账号,与本需求不同源。

## 用户结果

选中 DeepSeek/Kimi 模型时,输入框下方常驻一行小字显示余额(金额+货币,按语言本地化),可手动刷新;未支持服务商与查询失败**零占位**(不出现任何提示/空壳)。Key 只在主进程使用,渲染层与日志永不接触。

## 交付记录

- T01 主进程余额数据面(04e3bd81d);T02 渲染层余额行(4f8277a58)。AC 7 条与证据链见 `docs/devflow/model-usage-display/`(本地过程文档)。
- 说明:本地编号序列(REQ-0024/TASK-0346)与 origin/dev 撞车(dev 已至 TASK-0338),**推送前统一改号**(先例:REQ-0018→0019 手术)。
