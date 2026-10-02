---
id: BUG-0058
type: bug
status: investigating
priority: P1
owner: ai
source: upstream 8b1ed7b2e and current request transformation
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0163]
related_issues: []
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 文本模型收到超出其输入能力的图片

## 用户流程与实际行为

包含图片的会话切换到仅声明 text 的模型后继续。当前 transformMessages 直接透传用户图片，Copilot header 也只看历史内容而不看模型能力；上游 8b1ed7b2e 针对同一合同修复。隔离 fixture 的失败结果在 TASK-0163 回填，不声称已连接真实 Provider。

## 期望与不变量

仅投影本轮请求，图片模型仍可重放原图；文本模型收到清楚的图片省略提示而不是图片块，工具关联/文字/usage/错误不丢；canonical 历史不改。

## 复现、根因与验证

在 transformMessages 和真实 provider request adapter 边界捕获 fake transport 请求，比较 text 与 image 两档模型及切换后的原历史。当前源码缺少按 Model.input 投影的分支；实际 red/green、影响面和类型检查由 TASK-0163 记录。未访问真实用户状态或服务。
