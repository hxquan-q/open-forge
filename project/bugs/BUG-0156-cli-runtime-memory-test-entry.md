---
id: BUG-0156
type: bug
status: verifying
priority: P0
owner: cli-host/testing
requirement: REQ-0002
source: user-request; quality run 40657425393
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0413]
related_issues: []
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 干净 CI 的 CLI 合同测试无法解析记忆包入口

## 用户流程与实际行为

Given：安装后的干净 workspace，没有生成的 runtime-memory/dist。When：quality 流水线执行 verify:runtime-contract。Then：应从现有测试源码映射加载全部 workspace 依赖并验证 Runtime；实际测试收集失败，轻量质量 job 和交付被阻断。dev push 的平台矩阵按 workflow 条件不运行，不能将其跳过归因于本错误。

## 环境与失败证据

https://github.com/hxquan-q/open-forge/actions/runs/40657425393 ，head bf15534dd931998b510ada94d787df8e834d072d。Verify runtime contract 报 `Failed to resolve entry for package "@vetta/runtime-memory"`，入口为 packages/coding-agent/src/composition/contracts/runtime-session-options.ts 的 parseMemoryPolicyConfiguration 导入，subagent/todo 合同等未能收集。

## 最小复现与根因证据

quality.yml 安装后直接执行合同测试，未构建 workspace。apps/cli-host/vitest.config.ts 对其他 workspace 公共入口使用源码 alias，但没有 runtime-memory；该包生产 exports 正确指向构建后的 dist，干净检出没有该产物。coding-agent 自身测试已使用 runtime-memory 源码 alias，本地已有 dist 会掩盖遗漏。

## 回归与修复

TASK-0413 已用真实 Vite resolver 加载实际 CLI 配置。旧配置即使已有 dist，仍以期望 src、得到 dist 的断言形成 1 例 red；补齐 alias 后新合同 1 例、完整 Runtime 合同 138 例、安装制品 14 例通过，保留生产 exports。独立评审的无关 WebSocket 监听已关闭，定向复验 1/1 通过；首次组合门禁已运行但因宿主 rg、Desktop 超时及格式错误整体失败，定向复验见 TASK-0412；第三次完整批次 CLI 239 项通过、14 既有跳过，quality 700 项及完整 check 通过，但组合因两个 Desktop 市场超时仍红；最终候选完整门禁和新 SHA 远端结果待完成，因此处于 verifying。
