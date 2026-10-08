---
id: TASK-0163
type: task
status: done
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
worktree: unassigned（已集成，原 Worktree 保留待安全清理）
base_commit: 1cbe27c538ce65ce4e5bf054cb0c555f7c14114d
read_paths: [packages/ai/src/providers, packages/ai/test]
write_paths: [packages/ai/src/providers/transform-messages.ts, packages/ai/src/providers/anthropic/adapter.ts, packages/ai/src/providers/openai-completions/request.ts, packages/ai/src/providers/openai-responses/request.ts, packages/ai/test/transform-messages-model-input.test.ts, packages/ai/test/amazon-bedrock-messages.test.ts, packages/ai/test/anthropic-messages.test.ts, packages/ai/test/github-copilot-anthropic.test.ts, packages/ai/test/google-shared-gemini3-unsigned-tool-call.test.ts, packages/ai/test/openai-completions-tool-result-images.test.ts, packages/ai/test/openai-responses-tool-result-images.test.ts, packages/ai/test/transform-messages-copilot-openai-to-anthropic.test.ts, project/tasks/TASK-0163-model-input-modality.md]
exclusive_paths: [packages/ai/src/providers/transform-messages.ts]
depends_on: [TASK-0149]
conflicts_with: [TASK-0122, TASK-0123]
integration_status: integrated
created: 2026-10-02
updated: 2026-10-08
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

## 隔离交付证据

- 最小投影测试在旧实现上 4 failed / 2 passed；适配后全部通过。按声明的 Model.input 投影，用户消息和工具结果都保留文字与省略说明，不修改原始历史。
- 只取上游四个实现文件的相关 hunk，保留签名/工具 ID 归一化/错误重放等其余路径。Copilot 三个入口只在模型支持 image 且消息含图时发送 vision header。
- 原先“metadata missing 仍转发”的用例来自分叉基线，而非本仓新增修改。本次有意采纳新的显式能力合同；同时把原图像断言保留为 9 个明确声明 image 的视觉用例，再添加文本模型省略与可恢复历史用例，没有删掉图像能力覆盖。
- 用户文字+图片也附省略说明，比上游仅处理纯图片用户消息更明确；自定义视觉模型需要声明 image，不自动修改用户模型配置。
- `bun run --cwd packages/ai test`：63 文件 509 测试通过；test:impact 全部 12 个变更代码/测试路径，直接 8 文件 46 测试、相关 41 文件 373 测试通过；完整 check 全部通过。
- 技术评审为源码自审。真实 Provider/用户会话验收未授权；保持 verifying，集成 pending。Coordinator 已追加主检出发布说明，Worker 不提交公共发布文件。

## 隔离提交回写

提交 3dda219e9d4dc19bdffe0c3d28b59a91c6075dae。AI 63 文件/509 测试，影响面直接 46/相关 373 测试及完整 check 通过。保留 9 个明确视觉能力的旧图片断言，额外覆盖文本省略、历史不变与 Copilot header；自定义模型需声明 image。 发布文案由 Coordinator 追加主检出；集成 pending，未合入 main、未推送或发布。


## TASK-0171 主树集成（2026-10-02）

来源分支：task/TASK-0163-model-input-modality；来源提交：3dda219e9d4dc19bdffe0c3d28b59a91c6075dae。主树已有候选与隔离提交逐文件核对；共享索引采用 Coordinator 当前状态，Task 保留 Worker 详细证据与原主树摘要，发布说明逐条保留双方增量。各功能人工验收仍以原记录为准，不将合并视为接受或发布。

集成后 test:impact（上述实际暂存路径）与完整 bun run check 均退出 0；日志前缀 open-forge-task0171-merge-TASK-0163。merge commit 将保留原 Task 分支历史，尚未推送 origin/dev。

### 人工验收实测（2026-10-08，VERIFY-0017 组二，闭合为 done）

方法：隔离 Debug profile `04987e4e` 的真实会话里做「同一会话含图片 → 切纯文本模型 → 切回图像模型」的完整往返。**不再依靠只读代码或单测推断**，两个关键读数都取自客观产物：① 图片用页内 canvas 生成的 64×64 PNG 经**真实投递路径**（`MessageInput.DropZone` 的 drop 事件 + `DataTransfer`）进入输入区，附件落地为 `vetta-file://local/…png`，编辑器插入「图 1」引用；② 出站请求体由夹具 provider `faultmock`（`input: ['text']`，本机 127.0.0.1:8792）落 `requests.ndjson`——本轮给夹具补了**请求体摘要**字段（输入项类型 / 内容部件类型 / 图片部件数 / `data:image` 出现 / 省略提示计数），故「图有没有被带上」是读出来的而不是猜的。

| GWT 子句 | 实测结果 |
|---|---|
| 含图片会话切纯文本模型 → 请求合法 | 切到 `Fault Mock 1`（`input: ['text']`）后发送，回合正常完成（`FAULT_MOCK_OK…`），HTTP 200，无错误气泡 |
| 同一请求**无图片** | 请求体摘要：`contentTypes = ['input_text','output_text']`、`imageParts = 0`、`imageDataUrls = 0`、`rawHasDataImage = false`、`rawHasInputImage = false`——而该会话历史确实挂着第一轮的图片 |
| 文字 / 工具关联不丢 | 同一请求 `inputTypes` 含 `message` × 6、`function_call`、`function_call_output`（工具调用与结果配对项仍在），非空文本轮正常 |
| 任何用户图片被省略 → **追加省略提示** | 同一请求 `omissionNotices = 1`（即 `packages/ai/src/providers/transform-messages.ts:4` 的 `UNSUPPORTED_IMAGE_INPUT_NOTICE`）。注：该提示按实现是**注入请求文本**（`input_text` 部件），不是 UI 横幅——本轮先按 UI 横幅找过 `[role=alert]`/提示文案，确认为 0，读实现后改从请求体取证 |
| 切回图像模型不破坏 canonical 历史 / 图像模型保持原内容 | 切回 `glm-5.3-flash`（`input: ['text','image']`）后问「你还能看到第一轮那张图片吗」→「能看到」；再问「图里那行白色文字写的是什么」→ **`IMG`**（正是第一轮投递图里用 canvas 画的白色字符）。跨越一次纯文本模型切换仍能读出新图细节，证明 canonical 历史里的原图被完整重放、未被文本模型那轮破坏 |
| 工具结果图片分支 | **本轮未在 UI 构造**（需工具返回一张图）。由单测覆盖：`packages/ai/test/openai-completions-tool-result-images.test.ts`、`openai-responses-tool-result-images.test.ts` 等（本轮复跑 `bun run --cwd packages/ai test` = **63 文件 / 515 例全绿**，账本原记 509 例，套件已增长）。如实记录为宿主测试级证据 |

- 截图：`0163-attach-probe.png`（投递后附件 + 「图 1」）、`0163-model-picker.png`、`0163-image-model-turn.png`（图像模型轮）、`0163-text-model-retest.png`、`0163-switch-back.png`、`0163-switch-back-decisive.png`（artifactDir）。
- 夹具改动：`<debug vettaHome>/fixtures/fault-mock/server.ts` 增加请求体摘要（只记类型/计数，不记正文），可复用于任何「出站请求内容」类条目。
- 闭合依据：两条 GWT 的用户可见面已在真实应用上直接观察（含一份只有真看到图才答得出的判别性读数「IMG」），工具结果图片分支维持单测覆盖。按用户「全程自动」授权记为 `done`；如不认可（例如要求工具结果图片也走一次真机），按原 Task 回退 `verifying`。
