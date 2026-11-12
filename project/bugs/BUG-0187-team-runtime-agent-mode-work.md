---
id: BUG-0187
type: bug
status: verifying
priority: P1
owner: desktop
requirement: REQ-0030
source: user-report-2026-11-12
related_requirement: [REQ-0030]
related_plan: []
related_tasks: [TASK-0484]
related_issues: []
created: 2026-11-12
updated: 2026-11-12
---
<!-- Copyright The Open Forge contributors. -->

# 团队会话只钉了能力档位，成员与协调 Runtime 实际跑在 work 模式提示词下

## 用户流程

- Given：从任一入口新建 agentTeam 团队会话，团队含多个角色成员。
- When：向团队或某个成员发送任务，成员开始执行。
- Then：成员与协调 Runtime 的系统提示词应使用 coding 模式正文（与单 Agent code 会话一致），并注入项目 AI 工作区落点；产品口径「团队会话天生 coding 档」应同时成立于能力面与行为面。

## 实际行为

团队三个 Runtime 入口只声明 `capabilityProfile: "coding"`，从不声明 `agentMode`。`agentMode` 因此按缺省推导落到 `work`：新建会话回落 `desktopConfig.defaultAgentMode`（`"work"`），恢复会话回落 `LEGACY_SESSION_AGENT_MODE`（`"work"`）。结果是：

- 每个成员与协调 Runtime 的系统提示词注入的是 `work.md`，其开头为「You are operating in **Work Mode**, focused on knowledge work and document processing, not software engineering」；
- `projectAiWorkspace` 不注入，成员拿不到项目根 / Project AI workspace root 与落点规则；
- `MEMORY.md` / `JOURNAL.md` 落在会话 cwd，而不是项目 AI 工作区。

即：团队会话**拿着 coding 的全量工具面，跑着 work 的行为面**，与单 Agent code 会话不等价。

## 期望行为

团队会话在两条档位轴上都等同单 Agent code 会话：`capabilityProfile` 与 `agentMode` 均为 `coding`。不改变成员的工具白名单、团队编排、委派合同与既有会话持久化格式。

## 环境与失败证据

- 应用版本、平台：主仓 `dev` 线，Windows 11 x64；2026-11-12 用户报告（团队会话「不属于 code 会话」排查中发现）。
- 失败测试/命令：`team-runtime-manager.test.ts` 既有用例只断言 `capabilityProfile`，新增的 `agentMode` 断言在修复前为 `undefined`（见「回归测试」）。
- 基线对照：修复前三处入口 `resolveDesktopSessionConfig` 入参均无 `agentMode` 键。

## 最小复现

1. 新建团队会话并发送一条会触发成员执行的消息。
2. 取该成员 Runtime 的会话配置（或在 `team-runtime-manager.test.ts` 中记录 `resolveDesktopSessionConfig` 入参）。
3. 观察 `agentMode` 缺失，`resolveSessionAgentMode` 返回 `work`。

## 影响

自主开发团队（如 eform-craft 五角色）在系统提示词层面被声明「不做软件工程」，与 coding 工具面自相矛盾；同时缺少项目 AI 工作区指引，AI 产出物料落点错误（进项目根而非 AI 工作区）。属于提示词先验错误，不会直接报错，因此长期未被发现。

## 根因证据

- `apps/desktop/src/main/agent-teams/team-runtime-manager.ts:101-117`（成员创建）、`:139-149`（协调创建）、`:291-315`（成员恢复 / 重配）三处只传 `capabilityProfile`。
- `apps/desktop/src/main/conversations/resolve-session-config.ts:116-126`：新建会话 `requestedAgentMode ?? defaultAgentMode`，恢复会话 `frozenAgentMode ?? LEGACY_SESSION_AGENT_MODE`；两处缺省都是 `work`。
- `apps/desktop/src/main/config/desktop-config-store.ts:142`：`defaultAgentMode: "work"`。
- `apps/desktop/src/main/conversations/session-agent-mode-store.ts:20`：`LEGACY_SESSION_AGENT_MODE = "work"`。
- `apps/desktop/src/main/agent-runtime/composition.ts:212`：`resolveModePrompt: getModePrompt` 已接入生产组合，模型调用帧确实注入 mode block；`model-call-frame-contract.test.ts:305-306` 断言 coding 正文注入、work 正文不注入。
- `apps/desktop/src/main/agent-modes/index.ts:47-50`：`getModePrompt("work")` 返回 `work.md` 正文。
- 连带影响锚点：`resolve-session-config.ts:212-228`（`projectAiWorkspace` 仅在 coding 下注入）、`apps/desktop/src/main/agent-runtime/memory-journal-paths.ts:17-20`（Memory/Journal 根随 agentMode 切换）。

**非回归说明**：仓库历史中 `DEFAULT_AGENT_MODE` 从未取过 `"coding"`，`defaultAgentMode` 的默认值在改名提交前即为 `"work"`，未检索到翻转提交。因此这是长期存在的行为缺陷，不是某次默认档调整引入的回归。置信度：高（源码与 git 历史双向核对）。

**未修部分**：`agent-modes.json` 仍不记录团队会话档位，团队档位由常量裁决、每次重算而非创建时固化。这与单 Agent 会话的「创建时固化」语义仍有差异，但不产生可观察行为差异，单独跟踪。

## 回归测试

- `apps/desktop/src/main/agent-teams/team-runtime-manager.test.ts`：成员创建、协调创建、协调恢复、成员恢复四条路径都断言 `agentMode === "coding"`，并断言与 `capabilityProfile` 同值；旧实现该断言取到 `undefined` 必红。

## 修复与验证

2026-11-12 实施完成（TASK-0484，三提交 `305dfd5d6` / `f48bcea87` / `16e40c8e6`，base `393611e2a`）：

- **档位两轴**：`team-runtime-manager.ts` 新增 `TEAM_AGENT_MODE`，三处建/恢复入口与能力轴同值下发；`resolve-session-config.ts` 恢复链在无固化记录时显式请求优先于 LEGACY 回落（复核发现：恢复路径原忽略请求值，团队会话无固化记录恒回落 work，只钉入参修不了恢复；全仓无现存调用方受影响，守卫测试锁住）。
- **computer-use 授权**：controller 新增 `resolveSubject` 端口（成员 runtime id → 团队授权主体，fail-closed 缺省恒等），repository 维护 O(1) 反向索引，service 增三个只读查询，host 的 validateSession/readSessionName 支持团队主体；渲染层新增 `activeTeamSessionAtom` + root-layout 路由跟踪器，授权页主体 = 团队语境 ?? activeSession。
- **版块与入口**：Allstar 版块卡片按 cwd 并入团队会话（团队条目分派团队路由），侧栏高亮复用 `useCodingLayoutState`，placement 项目名单并入开发册。
- 验证：定向测试含红→绿对照全部通过（旧实现上「恢复路径 agentMode」「授权给团队后成员调用」「卡片含团队会话」「团队路由高亮」均实证必红）；check:quick 对改动文件全绿；全量 check:types 除预存项（用户基线 terminal-settle 类型错误、WAIVER-0011/0012 过期）外全绿。未运行 test:impact/完整 check/E2E/UI verify（用户指示跳过），实机彩排由用户执行。
- 剩余风险：团队成员 MEMORY.md/JOURNAL.md 落点从 cwd 迁到项目 AI 工作区，存量文件不自动迁移；详见 TASK-0484 交付记录。
