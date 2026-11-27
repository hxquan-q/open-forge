---
id: TASK-0529
type: task
status: verifying
priority: P1
owner: root
requirement: REQ-0008
source: user-request
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 97a479917
read_paths: []
write_paths:
  - packages/runtime-desktop/src/unavailable-model.ts
  - packages/runtime-desktop/src/unavailable-model.test.ts
  - packages/runtime-desktop/src/backend-pool.ts
  - packages/runtime-desktop/src/backend-pool.test.ts
  - packages/runtime-desktop/src/index.ts
  - apps/desktop/src/main/agent-runtime/composition.ts
  - apps/desktop/src/main/ipc/session.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/session-open-failure.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/session-open-failure.test.ts
  - apps/desktop/src/renderer/domains/conversation/hooks/useSessionOpener.ts
  - apps/desktop/src/shared/i18n/locales/zh/main.json
  - apps/desktop/src/shared/i18n/locales/en/main.json
  - apps/desktop/src/shared/i18n/locales/zh/chat.json
  - apps/desktop/src/shared/i18n/locales/en/chat.json
  - .github/release-notes/fragments/v0.1.5/
  - project/tasks/
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-27
updated: 2026-11-27
---
<!-- Copyright The Open Forge contributors. -->

# 会话打开失败反馈闭环（上游 issue #91）

## 合同

- 来源与目标：PLAN-0032 收尾后的基线外增量——手工合并上游 `223a8c6a3`（runtime-desktop 占位模型放行旧会话）+ `972c6cdcb`（打开失败跨页 toast 反馈）+ `a1cb2d2fb`（回归测试改断言可观察结果）。上游 issue openvetta/open-vetta#91：没有任何可用模型时（如升级迁移后服务商被清空），点侧栏旧对话只会静默退回欢迎页，用户以为对话丢失。两提交都不在分叉基线 `d217984c72` 内，本地 `useSessionOpener` 失败路径与上游修复前形态一致，缺陷在本地同样存在。
- 做（本任务）：
  - **runtime-desktop**：新增 `unavailable-model.ts`——`createUnavailableModel` 占位模型（provider `vetta-no-model`）、`isUnavailableModel`、`guardUnavailableModelStream` 包装 streamFn 在发出前抛 `AIError(MODEL_NOT_FOUND, retryable:false)`，报错文案由宿主注入可本地化。`backend-pool.ts`：`resolveInitialModel` 改 `resolveAvailableModel` 返回 undefined 不抛错；新建会话（无 sessionPath）无模型照旧抛错，恢复旧会话放行用占位；entry 记 `usesUnavailableModel`，用户随后配好模型时同工作区新会话用真实模型不留占位。`index.ts` 导出 `isUnavailableModel` 等。
  - **composition.ts**：`DesktopRuntimeBackendPool` 注入 `readUnavailableModelMessage: () => mainT("runtime.noAvailableModel")`。
  - **session.ts**：`getState` 返回时占位模型不交给界面（`model: undefined`），避免模型选择器把它当可选模型展示。
  - **useSessionOpener.ts + session-open-failure.ts**：失败 toast 基建——`sessionOpenFailureToast` 识别无模型报错给「去设置模型」入口（导航 `/settings/$tab` models）、其它失败照实给出原因，durationMs 8000 跨页留存；opener 失败路径在 `navigateBeforeCreate` 分支仅无模型时提示（该分支有输入恢复渠道），`shouldNavigate` 非 SSH 分支必提示。
  - **i18n**：main.json 加 `runtime.noAvailableModel`（zh/en）；chat.json 加 `sessionOpenFailed` 三键（zh/en）。**品牌适配**：上游文案含「在 Magpie 里接入 Vetta」，本地无 Magpie 功能，只保留「在设置里添加模型服务商」。
  - **测试**：移植 `unavailable-model.test.ts`（占位模型识别、stream 拦截不发网络请求）与 `backend-pool.test.ts` 增量（无模型恢复放行/新建拒绝/配好后用真模型）、`session-open-failure.test.ts`——按 `a1cb2d2fb` 的最终形态（断言可观察结果、计数器），不用 `toHaveBeenCalled*`。
  - release fragment 一份。
  - 不做：诊断包弹窗（`2c376e998`，另见 TASK-0532）；与本任务无关的同批上游修复（画廊 iframe 性能 `867179b27` 等见 TASK-0539，Kimi 国内站 `5fd12b81f` 见 RESEARCH-0052 改写后采纳清单）；`verify:ui:*` 需授权，不做。
- 保留本地分叉：opener 的 SSH 重绑卡片分支、批量/对话 scenario 推导、staged preview/perf 标记不动；backend-pool 本地 +37/-2 的既有分叉（hooks/entry 结构）不回填上游。
- Given / When / Then：
  - 无任何可用模型 → 点旧会话正常打开看历史，发消息时提示去设置添加模型（不发网络请求）。
  - 无任何可用模型 → 新建会话照旧被拒绝。
  - 打开会话失败（任意原因）→ 弹出 8 秒 toast 写明原因，不再只静默退回欢迎页；无模型原因时 toast 带「去设置模型」一键跳转。
  - 配好模型后同工作区新会话用真实模型，不残留占位。
- 验证：runtime-desktop 定向测试 + session-open-failure 定向 + `bun run test:impact --` 改动源文件；`bun run check`。
- 人工验收：实机清空模型配置后打开旧会话看历史、发消息看到引导提示。

## 交付

- 实际修改与验证（2026-11-27）：
  - 上游 `223a8c6a3`/`972c6cdcb`/`a1cb2d2fb` 按 patch 参照适配落地，非 cherry-pick。`unavailable-model.ts`（新，占位模型 + `guardUnavailableModelStream` 发出前拦截）与测试、`backend-pool.ts` 六处合入（`resolveAvailableModel` 返回 undefined 不抛、新建仍拒、恢复放行、`usesUnavailableModel` 标记、配好模型后注入真实模型、streamFn 包装）、`index.ts` 导出、`composition.ts` 注入 `mainT("runtime.noAvailableModel")`、`ipc/session.ts` getState 屏蔽占位模型、renderer `session-open-failure.ts`+测试与 `useSessionOpener` 接线、四份 JSON 两语对齐。
  - 品牌适配：上游文案「在 Magpie 里接入 Vetta」本地无该功能，全部改为「在设置里添加模型服务商」（unavailable-model DEFAULT、main.json、chat.json 均已确认无 Magpie 残留）。
  - 验证：runtime-desktop 定向 29/29（unavailable-model + backend-pool）、session-open-failure 定向 4/4，verifier 独立复跑 3 文件 33/33；`bun run test:impact --` 七个改动源文件 6847 通过，13 失败全部为既有 loopback SSH 环境性失败（command-spawner.remote/remote-command-runner/filesystem-service.remote-flow/skill-presentation-read/media-protocol/file-protocol，与 TASK-0527/0528 完全同签名，与改动无关）；`bun run check` 全绿（lint/types/guards/mobile-lint）。
  - verifier 复查 pass：上游移植逐行忠实、分支提示条件符合合同、类型兼容、无调用类断言。唯一 P3：create 成功后的 hydration 失败支路仍只 appendError 无 toast（与上游同构、非本补丁引入，合同「任意原因」的措辞偏宽，后续可收窄或补提示）。
  - 未运行：实机验收（清空模型配置后打开旧会话看历史、发消息看到引导提示）。
