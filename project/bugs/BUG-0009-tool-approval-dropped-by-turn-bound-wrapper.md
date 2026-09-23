---
id: BUG-0009
type: bug
status: done
priority: P1
owner: packages/coding-agent
source: TASK-0063 browser_tab 审批回归测试
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: [TASK-0063]
related_issues: []
related_bugs: []
depends_on: []
---
<!-- Copyright The Open Forge contributors. -->

# Turn 绑定后 Tool 表面丢失逐次审批闸门（L3/L4 工具直通执行）

## 用户流程

- Given：宿主已接入 `CODING_AGENT_TOOL_APPROVAL_FUNCTION`（Desktop 审批 broker + 审批卡片就绪）。
- When：Agent 在任意真实 Turn 中调用 L3/L4 工具（如 `browser_tab` 的 `click`、写文件、执行命令）。
- Then：应当先弹出逐次审批；用户拒绝时不执行底层工具并返回明确拒绝结果。

## 实际行为

Turn 绑定（`bindForTurn`）后的 composer 使用 `bindToolWrapper` 提供的 Turn 目录，该目录只注册了 plan-mode / ecosystem / coding-extension 三个拦截器，`tool-approval` 仅存在于未绑定路径使用的 session 目录。`??` 回退语义使 Turn 目录**整体替换**而非叠加 session 目录，所有真实 Turn（`turn-pipeline` 总是带 context acquire）中审批拦截器从未包装 Tool，L3/L4 工具不经批准直接执行。

## 期望行为

Turn 绑定路径与未绑定路径的权限闸门一致：`permissionApproval`（order 40）最先裁决，批准后执行，拒绝则阻止且无副作用。

## 最小复现

`turn-capability-session-assembly.test.ts`：经 `capabilities.acquire`（生产同款绑定路径）取得 composer → compose 出含 `browser_tab` 的 frame → 执行 `click` 且审批端口返回 deny —— 旧实现底层工具照常执行且从不请求审批；新实现抛出拒绝且工具未执行。

## 影响

自 `e2882359b`（高风险工具接入 L0-L4 逐次审批）起，Desktop 审批端口、broker 与审批卡片全部就绪但从未被调用；需要逐次批准的高风险工具调用在所有真实会话中静默直通。plan-mode / ecosystem / extension 三个拦截器因同时注册于两侧未受影响。

## 根因证据

`capability-session-assembly.ts`：`toolInterceptionCatalog` 注册 `tool-approval`（session），`bindToolWrapper` 的 Turn 目录不含该项；`model-call-frame-composer.ts` 的 `bindForTurn` 用 `boundToolWrapper?.wrapTools ?? this.options.wrapTools` 替换而非叠加。

## 回归测试

`packages/coding-agent/test/runtime-core/turn-capability-session-assembly.test.ts` 新增「browser_tab 写动作走 L3 逐次审批，拒绝不执行；读动作直通」用例。

## 修复与验证

- 修复：将 `approvalToolInterceptor`（无 Turn 绑定状态）同时注册进 `bindToolWrapper` 的 Turn 目录，保持 `permissionApproval` 最先裁决。
- 测试：`turn-capability-session-assembly.test.ts` 7/7（含新回归用例）。
- 检查：`bun run check:quick`。
- 未运行及原因：真实 Desktop 审批卡片 E2E 未跑（`verify:ui:*` 需用户明确授权）。
