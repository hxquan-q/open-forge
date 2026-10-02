---
id: TASK-0163
type: task
status: verifying
priority: P1
owner: ai
source: user-request; upstream 8b1ed7b2e
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0149]
related_issues: []
related_bugs: [BUG-0058]
execution: parallel
branch: task/TASK-0163-model-input-modality
worktree: ../open-forge-wt/task-0163-model-input-modality
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ai/src/providers, packages/ai/test]
write_paths: [packages/ai/src/providers/transform-messages.ts, packages/ai/src/providers/anthropic/adapter.ts, packages/ai/src/providers/openai-completions/request.ts, packages/ai/src/providers/openai-responses/request.ts, packages/ai/test/transform-messages-model-input.test.ts, packages/ai/test/amazon-bedrock-messages.test.ts, packages/ai/test/anthropic-messages.test.ts, packages/ai/test/github-copilot-anthropic.test.ts, packages/ai/test/google-shared-gemini3-unsigned-tool-call.test.ts, packages/ai/test/openai-completions-tool-result-images.test.ts, packages/ai/test/openai-responses-tool-result-images.test.ts, packages/ai/test/transform-messages-copilot-openai-to-anthropic.test.ts, project/tasks/TASK-0163-model-input-modality.md]
exclusive_paths: [packages/ai/src/providers/transform-messages.ts]
depends_on: [TASK-0149]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: pending
created: 2026-10-02
updated: 2026-10-02
---
<!-- Copyright The Open Forge contributors. -->

# 按模型输入能力适配图片与工具结果

Upstreamable。上游 8b1ed7b2e 涉及 transform-messages、Anthropic adapter、OpenAI Completions/Responses request 与多 Provider 测试；不能把它当成单个条件替换。

## 做与保留

- 先对照本仓 Model.input、附件图像预算、工具结果图片处理和用户可见错误，确认当前实际行为。
- 文本模型不接收图像块；图像模型保持原有图像与签名；工具结果仍保留文字与调用对应关系。
- 保留本仓 Provider 共享重试预算、工具参数校验、usage/stop/取消和错误分类。禁止静默把用户任务降成另一种意图，按现有文本降级合同给出反馈。
- 不改移动端、不更新自动生成模型注册表、不访问真实 Provider。

## Given / When / Then 与验证

同一会话含用户图片及工具图片，切换到文本模型后继续 → 请求合法、不带图片，文字和工具关联不丢；切回图像模型 → 不破坏 canonical 历史里的图像。用真实转换链和假 transport 分别覆盖 Anthropic、OpenAI 两接口、已有 Copilot/Google/Bedrock 合同。

逐行为 red/green；目标包 Node runner 定向及 test:impact/public contract test:changed，完成后完整 check。实际命令与证据在开工后回填，不把 Task 创建当成验证通过。

当前串行；依赖 TASK-0149。工程未执行、集成 pending、人工待验收、发布未授权。错误/图片能力若涉及需改变用户合同，先说明取舍再实施。

## 独立适配合同

从 main 创建 Worktree，再快进装配已验证的 TASK-0149（7a2a5ce50，含 0148），不携带主树 WIP。仅修改模型输入投影、三个 Copilot header 调用和相关测试，不改签名 Schema/重试预算。主树记录与发布说明由 Coordinator 维护，Worker 不写公共索引/发布文件。

上游只在纯图片用户消息上加省略提示；本仓择优调整为任何用户图片被省略时都追加提示，避免“文字+图片”的请求悄悄变成纯文字并诱发臆测。工具结果同样留提示，模型有 image 能力时保持原内容。先建立失败 fixture，再适配，所有存量图片测试应明确声明 image 输入能力而不是删断言。

## 隔离提交回写

提交 3dda219e9d4dc19bdffe0c3d28b59a91c6075dae。AI 63 文件/509 测试，影响面直接 46/相关 373 测试及完整 check 通过。保留 9 个明确视觉能力的旧图片断言，额外覆盖文本省略、历史不变与 Copilot header；自定义模型需声明 image。 发布文案由 Coordinator 追加主检出；集成 pending，未合入 main、未推送或发布。
