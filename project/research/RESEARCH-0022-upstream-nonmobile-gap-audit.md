---
id: RESEARCH-0022
type: research
status: done
priority: P1
owner: desktop + runtime-core + coding-agent
source: user-request; openvetta/open-vetta source comparison
created: 2026-10-03
updated: 2026-10-03
related_requirement: [REQ-0008]
related_plan: [PLAN-0014]
related_tasks: [TASK-0151, TASK-0152, TASK-0154, TASK-0155, TASK-0156, TASK-0157, TASK-0158, TASK-0159, TASK-0160, TASK-0161, TASK-0176, TASK-0185]
related_issues: []
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# 非手机上游最新优化与本仓缺口审计

## 当前结论

有未跟进的改进，最值得先吸收的是 **会话一致性、流式渲染和终态语义**，而非继续追手机远程或整体升级上游。旧 PLAN-0014 只吸收了部分任务；新 dev 又增加了一轮消息流治理。建议先做小而明确的修复，再适配 feed/attach，保留本仓历史窗口化、内存上限和队列修复。

本报告是研究交付，不是实施授权或功能验收。尚未移植、未确认复现与已有等价实现分开记录；没有用“提交不是 HEAD 的祖先”直接推导缺功能。

## 问题与范围

- 用户要求核对原始 Vetta 最新代码，排除手机远程后识别尚未吸收的优化。
- 第一层核查上次固定快照至最新 dev 的所有提交；第二层回查既有计划的未落地代表切片。
- 排除手机、移动端、配对、P2P、中继、远程桌面；桌面端 SSH 项目能力与手机远程不是同一范围。
- 主线程核查新增会话流、目标模式、质量入口；只读研究支线核查旧批次配置、MCP、Prompt、富内容和项目工具，最终由主线程串行记录。
- 不修改业务代码、协议或测试，不合并、不提交、不推送、不启动 Desktop、不访问真实 Provider/SSH/用户状态。工作区既有 ISSUE-0020、RESEARCH-0021、TASK-0186 等修改保留。

## 事实来源与固定快照

核对日期：2026-10-03，Asia/Shanghai。通过公开仓库 ls-remote 核实，并使用 `git fetch --no-tags --no-write-fetch-head https://github.com/openvetta/open-vetta.git main dev` 只取得 Git 对象；没有新增 remote 或改变本地分支。

| 对象 | 固定 SHA | 说明 |
| --- | --- | --- |
| 本仓 HEAD | `48b8e487fd47e4009da7edf0d09169426a873529` | Open Forge 0.1.3；包含 10-03 队列消息顺序修复 |
| 上游 main | `a2d314a8521aa438c78dd51ed18c9e523a2cfab9` | 0.5.60；提交时间 09-30 10:34:24 +08:00，本次没有前进 |
| 上游 dev | `26048167cdf59b332678d693463bceb7bad5232c` | 0.5.61 开发分支；10-02 20:39:00 +08:00 |
| 上次 PLAN-0014 基线 | `071ed323cda92cd7c1c37122b9ad68b3d642cfc5` | 09-30 17:31:20 +08:00 |

新范围共 39 个提交，38 个非 merge；包含重构、文档以及中途又被撤回的改动，不能说成 39 项独立优化，也不是全部已经进入稳定 main。

第一方入口：[上游 main](https://github.com/openvetta/open-vetta/commit/a2d314a8521aa438c78dd51ed18c9e523a2cfab9)、[最新 dev](https://github.com/openvetta/open-vetta/commit/26048167cdf59b332678d693463bceb7bad5232c)、[既有计划](../plans/PLAN-0014-selective-upstream-nonmobile.md)、[既有研究](RESEARCH-0019-post-integration-optimization-audit.md)。

## 最新一轮：应优先评估的缺口

### 1. 流式输出不要使所有历史回复重渲染（P1，小切片）

- 上游 [00ebe0b88](https://github.com/openvetta/open-vetta/commit/00ebe0b88)：用量内容未变时沿用之前的数组引用，避免每次流式 tick 破坏回复行 memo。
- 本仓 `apps/desktop/src/renderer/domains/conversation/components/message-list/message-list-derived.ts:45` 每次创建新数组；`MessageListView.tsx:183–205` 随 messages 变化重新收集并把 sessionUsages 传入各回复，尚无该引用复用。
- 建议直接适配小补丁，但保留本仓 placeholder 的 usage 收集。预计减少历史行无效刷新；没有本机性能测量，不能承诺具体 CPU/内存降幅。

### 2. 工具执行间隙不应提前把整条回复标为完成（P1，小切片）

- 上游 [f4dfc2690](https://github.com/openvetta/open-vetta/commit/f4dfc2690)：assistant done 且 stopReason=toolUse 只累计 usage，保持 streaming，等待整个回合终态。
- 本仓 `apps/desktop/src/renderer/shared/conversation/message-stream.ts:148–183` 没有 toolUse 特判，直接写 phase、endedAt 与 durationSeconds；共享投影也供 Team 使用。
- 这是结束显示/耗时统计的静态同形缺口，不代表执行中的工具会因此被取消。后续需覆盖多次模型调用、工具结果、最终错误/取消和 usage 仅累计一次。

### 3. 同回合失败后恢复成功，不应残留 error 结束原因（P1，小切片）

- 上游 [94d7e1381](https://github.com/openvetta/open-vetta/commit/94d7e1381)：以真实 assistant done 纠正终态，而不是依赖已经没有内置生产者的 message.final。
- 本仓 `packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts:135–152` 仍在 message.final 分支清除错误，而 assistant done 只特殊处理 aborted；`test/runtime-host/running-changed-reason.test.ts:66–73` 仍手工构造旧事件。
- 静态路径与上游修复前相同，需用真实事件序列建立红测；不把此处研究当作运行时复现或已确认的全平台故障。

### 4. 重开运行中会话：历史快照、整轮重放与消息身份统一（P1，中型适配）

- 上游 [422983be7](https://github.com/openvetta/open-vetta/commit/422983be7)、[49b0cd6c1](https://github.com/openvetta/open-vetta/commit/49b0cd6c1)、[bc850b92f](https://github.com/openvetta/open-vetta/commit/bc850b92f)：运行中 turn 身份、确定性历史标识、统一 conversation-feed reducer。
- 上游 [9e18d7f84](https://github.com/openvetta/open-vetta/commit/9e18d7f84)、[c28c4d4d1](https://github.com/openvetta/open-vetta/commit/c28c4d4d1)、[1203755a7](https://github.com/openvetta/open-vetta/commit/1203755a7)：attach 统一订阅与历史快照，重放中的运行回合不再和历史重复拼接。
- 本仓仍通过 `useSessionOpener.ts:331–380,538–560,695` 分阶段加载预览/历史和 subscribe；仍使用 conversation-projection、live-history-patch、optimistic-user-message-cache 等对账路径，没有该 feed/attach 实现。
- 本仓已经集成 [TASK-0185](../tasks/TASK-0185-consumed-queue-user-message-ordering.md) 的队列顺序局部修复；不可称本仓队列问题完全未修，也不能把这次补丁覆盖掉。
- 续接 TASK-0152，但原任务固定的是旧的回复段身份补丁，应先扩充到新 upstream 方案的必要合同再实施。保护窗口化、TranscriptItemSpan、乐观消息因果顺序、归档/恢复、错误/取消/usage 与跨宿主兼容。

### 5. 滚动记忆只记录用户主动停留的位置（P1，小切片）

- 上游 [15317178d](https://github.com/openvetta/open-vetta/commit/15317178d)：自动跟随底部期间清除滚动记忆，避免重新挂载时恢复到“尚未滚到底”的中间位置。
- 本仓 `apps/desktop/src/renderer/shared/components/message-feed/useMessageFeedScrollModel.ts:178–186` 的 captureState 直接保存 snapshot，没有 shouldFollowBottomRef 的排除逻辑。
- 可独立吸收；覆盖主动浏览历史应恢复位置、自动跟随应回到最新消息、切换会话和长内容异步测量。

### 6. 事件合同要约束真实生产者，而非只验证手造的测试事件（P2，配合终态修复）

- 上游 [4067e4e7b](https://github.com/openvetta/open-vetta/commit/4067e4e7b)、[e0c24f4ab](https://github.com/openvetta/open-vetta/commit/e0c24f4ab)、[4c04cb7f5](https://github.com/openvetta/open-vetta/commit/4c04cb7f5)：移除五种旧事件，增加生产者穷尽登记、已删除事件守卫和分域控制器。
- 本仓 contracts、observation bridge、codec 和测试仍有 message.final 等旧分支，没有对应 producer/tombstone 守卫。前一项错误残留就是这种“测试通过但事件并不真实产生”的风险实例。
- 建议先补生产者/消费者合同检查，再依据本仓 Plugin、CLI、IPC 兼容约束决定移除或过渡；不能仅为减少类型而删掉外部仍在使用的协议。

### 7. 持久化目标模式，以及它刚补上的启动/恢复竞态（P2，新能力）

- 旧 [TASK-0156](../tasks/TASK-0156-session-goal-mode.md) 仍未接入上游 features/goal 和 Desktop useGoalModeModel；本仓已有 todo/continuation 不等同于完整目标产品。
- 新 [bc1b7812d](https://github.com/openvetta/open-vetta/commit/bc1b7812d)：Gemini 空 contents 归类 INVALID_REQUEST，目标启动提供临时上下文，并防止旧异步写盘覆盖恢复状态。
- 新 [5da5286b8](https://github.com/openvetta/open-vetta/commit/5da5286b8)：命令回执不得覆盖已经观测到的完成、暂停或清除状态。
- 这些目标模式专属修复应随功能整体接入，不能称本仓现有目标模式已经出现同一 bug。Google request 层的空 contents 校验是可独立评估的通用子项。

## 旧计划中的尚未落地项

以下为旧计划的代表性源码缺口；并非对每个 Task 全部子能力的穷尽审计。相关 Task 仍为 draft，但结论来自实现对照而非状态标签。

| 范围 | 本仓事实与影响 | 上游证据 / 适配边界 |
| --- | --- | --- |
| **配置串行事务（TASK-0151，优先）** | general-settings-service.ts:56–58 先读再合并写；desktop-config-store.ts:363–370 用旧 config 覆盖已知字段。并发读改写有相互覆盖窗口，已做原子落盘不等于已做事务。 | [93bfc01ad](https://github.com/openvetta/open-vetta/commit/93bfc01ad) 把读取最新值、updater、写入放入串行队列；保留未知字段和本仓独立 SSH 主机存储，迁移所有消费者。 |
| **跨工作区 MCP 复用（TASK-0154）** | runtime-desktop/backend-pool.ts:355–373,512 已按 cwd/agentDir 复用，不是每会话重新启动；缺少全局 MCP application source 跨工作区共享。 | [d04645196](https://github.com/openvetta/open-vetta/commit/d04645196) 的 mcp-resource-manager.ts 区分 application/workspace scope；保留 idle timeout、工具目录缓存、roots 和权限隔离。可能减少多项目连接/进程，收益未测量。 |
| **Windows 沙盒制品完整性（TASK-0159，优先决策）** | prepare-pack.js:643–658,678 和 sandbox-staging-guard.mjs:4–15,39–41 仍缺失只告警，目录非空即可视为存在。可能产出不完整沙盒制品。 | [f174cf914](https://github.com/openvetta/open-vetta/commit/f174cf914)、[cca02889c](https://github.com/openvetta/open-vetta/commit/cca02889c) 要求指定 exe、固定来源和摘要验证。须先决定本仓可信制品源/架构；已有 sandbox/capability.ts:332,351 的运行时能力检查，不能称本仓无检查或自动降为完全访问。 |
| **dev 主进程缓存输入（TASK-0159，可拆小片）** | build-dev-processes.mjs:76–87 手工列少数包；vite.main.config.ts:36–39 中实际会 bundle 的 runtime-storage 未列为缓存输入。只改遗漏包产物时存在运行旧 bundle 的条件。 | [34a350058](https://github.com/openvetta/open-vetta/commit/34a350058) 自动枚举实际打包的 workspace manifest/dist；要避免无关包导致过度失效，核对嵌套插件包与 toolkit。 |
| **消息内富 Markdown（TASK-0157，新能力）** | theme-ui/MarkdownContent.tsx:35,195–203 仍为 GFM 与默认代码块，尚未见公式/Mermaid/HTML/SVG renderer 的生产接入。 | [ed8b1af40](https://github.com/openvetta/open-vetta/commit/ed8b1af40)、[a8029e94f](https://github.com/openvetta/open-vetta/commit/a8029e94f)、[093ce834b](https://github.com/openvetta/open-vetta/commit/093ce834b)。本仓已有 CanvasHtmlSandbox.tsx，不能说整个产品没 HTML 预览；复用隔离原则并保护流式冻结、资源隐私和内存约束。 |
| **Git 特殊路径/重命名（TASK-0160，优先）** | presets/git/src/git/log.ts:55–91 缺 NUL/literal pathspec；parseLog.ts:68–86 按换行/tab 拆分。特殊文件名和重命名 diff 存在边界正确性差额。 | [2dd10fc5b](https://github.com/openvetta/open-vetta/commit/2dd10fc5b) 使用 -z、--find-renames、--literal-pathspecs 与前后路径。命令/parser 成套适配；本仓 CommitDetailPane.tsx:65–150 已有详情、文件树、diff，不要重做整个功能。 |
| **未安装 Git 的恢复入口（TASK-0160）** | tab-visibility.ts:11–22 将失败/超时/缺 Git 一并归为 false；GitPanel.tsx 没有 no-git 状态，用户可能只看到面板消失。 | [d9cc3e003](https://github.com/openvetta/open-vetta/commit/d9cc3e003)、[b41710a19](https://github.com/openvetta/open-vetta/commit/b41710a19) 的探测与安装引导；区分权限、超时、未安装及远端 SSH 环境，不对所有失败提示本机安装。 |

### 有差额，但尚不应判为已确认故障

- **Prompt 优先级（TASK-0155）**：本仓 narration.md:2 无条件要求 progress；[fcde2f517](https://github.com/openvetta/open-vetta/commit/fcde2f517) 加工具可用性条件和项目指令优先例外。文本差额明确，但完整装配优先级和模型效果未验证，不宣称当前模型必然违令。
- **脚本面板/公开筛选合同（TASK-0158）**：本仓没有 presets/scripts，plugin-sdk/src/fs.ts:49 的递归列举只有 rootPath。上游脚本面板及 names/ignoredDirectories 合同尚未原样接入；其他等价入口、旧 helper fallback 和终端权限链未穷尽。
- **通知/提示音（TASK-0161）**：本仓 notification-service.ts:106–135 已有开关、抑制、合并与导航，不是没有通知。独立提示音偏好/schema 未见接入；操作系统默认声音不能等同于产品可配置声音能力。

### 旧批次代码锚点

- 配置：`apps/desktop/src/main/general-settings/general-settings-service.ts`、`apps/desktop/src/main/config/desktop-config-store.ts`。
- MCP：`packages/runtime-desktop/src/backend-pool.ts`、`apps/desktop/src/main/agent-runtime/composition.ts`、`apps/desktop/src/main/agent-runtime/mcp-supervisor.ts`。
- 制品/开发缓存：`apps/desktop/scripts/prepare-pack.js`、`apps/desktop/scripts/sandbox-staging-guard.mjs`、`apps/desktop/scripts/build-dev-processes.mjs`、`apps/desktop/vite.main.config.ts`。
- 富内容：`packages/theme-ui/src/markdown/MarkdownContent.tsx`、`apps/desktop/src/renderer/domains/activity-panel/components/canvas-tab/CanvasHtmlSandbox.tsx`。
- Git：`packages/plugins/presets/git/src/git/log.ts`、`parseLog.ts`、`tab-visibility.ts` 及 `src/components/graph/CommitDetailPane.tsx`。

## 已吸收、应保留而非重复移植

- Anthropic 网关初始 thinking signature 可缺省：本仓 `packages/ai/src/providers/anthropic/response-schema.ts` 已为 optional，TASK-0149 已集成。
- 原子写占用重试：`packages/toolkit/src/atomic-write.ts` 已有 EPERM/EACCES/EBUSY 重试，并保留同路径 asyncWriteTails 和完整字节写入循环；TASK-0150、0175。整体覆盖反而可能回退本仓能力。
- SSH 进程组取消、Windows ssh2、撤销主机密钥保护、失效代次和跨平台夹具已分别处理；不是手机远程，也不应按未合并上游的 SHA 重做。
- 模型输入模态过滤与知识库加工 Prompt 来源：TASK-0163、0162 已集成。源码分别见 `packages/ai/src/providers/transform-messages.ts:18–41`、`apps/desktop/src/main/knowledge/processing-session-factory.ts:17,34`。
- `check:quick` 的变更 lint 和 `test:impact` 已存在；TASK-0176 已交付性能基线并否决没有证据的调参，不是完全没有跟进验证成本。
- 上述“已集成”不等于所有人工产品验收已完成；各 Task 的 verifying 和 integrated 是不同维度。

## 被否决的直接同步方案

1. **整仓 merge / 按目录覆盖 / 批量 cherry-pick**：本仓品牌、协议、预算、分页、内存约束与上游已经分叉，应按行为适配。
2. **照抄首屏全量历史与删除 firstItemIndex**：上游 [84cfe8dc6](https://github.com/openvetta/open-vetta/commit/84cfe8dc6) 加索引锚定后，又以 [f08a4b02e](https://github.com/openvetta/open-vetta/commit/f08a4b02e) 改为一次加载全部历史，再以 [f6c55809f](https://github.com/openvetta/open-vetta/commit/f6c55809f) 撤回锚定。本仓 TASK-0050 有真正的分页/prepend 和内存约束，不适用“以后只往尾部追加”的假设；上游声称多约 10ms 也不是本仓长历史的基线。
3. **整轮原始事件无限保存**：最新上游 recordTurnReplay 在事件到达时 push，直到重放时才 coalesce；本仓已有 4096 replay 上限与订阅队列保护。适配 attach 时需定义有界存储/快照回退，而非撤销内存保护。
4. **把 AnnotationScope 就绪重挂载当作本仓现成 bug**：上游 c362aacc4 确实修复此问题，但本仓尚无该批注组件/新 SessionConversation 组合树；它是新能力接入时的回归合同，不是当前已复现缺陷。新的 Conversation/AgentMessage/EventMessage 组合组件拆分可后置，不能把大重构本身当作已量化性能收益。
5. **降低完整质量门禁**：上游 [16042ab46](https://github.com/openvetta/open-vetta/commit/16042ab46) 改了日常 test/check 默认范围，并保留独立 full 入口。本仓已有快速通道，建议仅研究精确依赖映射；不能使根规则要求的完整 `bun run check` 静默变小。

## 下一步触发信号

用户要求继续实施时，先将源码证据补入既有 Task/必要新 Task；推荐顺序：

1. 用量数组复用、toolUse 终态、失败后恢复终态、主动滚动记忆四个独立小切片。
2. 配置事务、资源/MCP 准备，再做适配本仓有界历史的 feed/attach 和真实事件合同。
3. 目标模式、富内容/批注、脚本/Git/通知按产品优先级推进。

每片先写可失败基线，通过正常入口和工具/取消/恢复流程验证；本报告不创建“已开工”的实施状态。真实 UI、模型和用户主机验证继续需要单独授权。

## 验证、置信度与失效条件

- Git SHA、版本、提交范围和本地源码同形差异：高置信度。
- 用户可见故障和性能收益：静态判断，未运行新回归、性能或 UI 测试；没有声称当前每次都能复现。
- 本轮只运行文档级检查，结果见下；未运行完整 check、test:impact、构建、UI 或真实 Provider。
- 当本仓 HEAD、上游 HEAD、Task 状态、历史/事件协议或消息列表实现变化时，应重新核对。此报告不是未来版本的持续最新声明。
### 本轮实际文档检查

- `git diff --check -- project/research/README.md .github/release-notes/v0.1.3.md`：通过。
- `node scripts/quality/check-project-indexes.mjs`：通过。
- `node scripts/quality/workflow-skills.mjs`：通过。
- `bun run scripts/release/release-notes.mjs --check`：通过，当前版本 0.1.3。
- 复用仓库 `parseFrontmatter`、`asText`、`brokenFileLinks` 检查本报告元数据、相对链接与 UTF-8/LF：通过。临时检查命令起初误用 helper 参数，按真实函数签名修正后通过；未修改产品或验证脚本。
- 文档 done 仅代表调查与记录完成，不代表表内待适配能力已实现。没有提交、合并、推送或业务代码变更。

## 后续实施记录

2026-10-03 用户授权实施后，稳定性首批由 [TASK-0187](../tasks/TASK-0187-upstream-stability-batch.md) 统一管理，子 Task 为 TASK-0188–0193 与 TASK-0151。本报告保留最初固定 SHA 的审计事实；最新实现、验证与集成状态以这些 Task 为准，不把报告中的“尚未接入”沿用为后续版本事实。
