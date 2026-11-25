---
id: VERIFY-0024
type: verification
status: verifying
owner: apps/desktop
source: TASK-0425 historical audit
created: 2026-11-25
updated: 2026-11-25
related_requirement: [REQ-0030]
related_plan: [PLAN-0028]
related_tasks: [TASK-0425, TASK-0493]
related_bugs: [BUG-0198]
---
<!-- Copyright The Open Forge contributors. -->

# Code 模式总体检测报告

> **入仓说明（2026-11-25）**：本报告保留 2026-10-30 历史审计的全部章节与结论，不是当前缺陷清单。原基线包含 `98f7de9e6` 和当时未提交候选，不能保证仅凭该提交重建。后续状态以 [TASK-0425](../tasks/TASK-0425-code-mode-comprehensive-audit.md)、[PLAN-0028](../plans/PLAN-0028-code-mode-audit-repairs.md) 及关联 Bug/Task 为准；迁入不代表重新运行旧测试或接受功能。历史日志经过路径与工作区指令脱敏，见 [证据说明](code-mode-audit-evidence/README.md)。

**日期：2026-10-30**<br>
**范围：code 会话独立、新建 code 会话初始化、LLM 行为热跟踪**<br>
**环境：当时的主仓检出与独立辅助工作区（具体机器路径已规范化）**<br>
**检测基线：本地 `98f7de9e6` 加本次尚未提交的浏览器合同／页签接线修复候选。**

## 一、先看结论

**目前不能把这一整套功能判定为“全面验收通过”。**

- 独立入口、普通列表的静态过滤、新建会话的首屏布局、shell 命令及完成结果投屏、浏览器工具的基本合同已经具备，相关既有基线能通过。
- 本轮修正了之前没有真正接通的页签跟随，以及浏览器工具参数 Schema／本地路径的几处问题。**这些局部修正有回归证据，但不等于整个 code 模式没有缺陷。**
- 总体检测找到了明确反例：**连续新建 code 会话不一定初始化；发首条消息的过渡又可能重复初始化；只登记在开发册的项目不能正常补拉历史／进入新建候选；文件跟随存在旧目标串项目及同文件再次编辑不跟回；终端存在混流和运行态悬留等。**
- 正常回归之外，另建了独立诊断探针。最终 **12 个场景中 2 个对照通过、10 个测试失败**；其中一项测试同时验证了开发册冷加载和列表增量更新，含多条失败断言。这里的红灯是新增缺陷证据，不是把正常 CI 改成了故意失败。
- 全量跨包回归实跑了四个包，**整体 exit 1，不能写成全绿**。初次出现的 10 条失败已逐项分流，详见第五节。
- **OOM 原因没有完成闭环。** 之前把 `role="log"`／无障碍历史缓存认定为根因、称为“定案”的说法证据不足，应撤回该结论。报告给出了可复算的输出字符串保留问题，但也明确它不能单独解释此前的全部崩溃。
- **追加（2026-10-30 二次核对）：** 第四节与第六节全部问题经独立代码复核，机制、位置与数字与源码一致，未发现夸大或错判。范围勘定：初始化行为为 code 语境专属，LLM 行为热追踪为 code/普通共用（详见第十一节）。按用户决策新增需求：**热追踪收敛为 code 模式独有**（见 11.3）。

### 阶段性收尾状态

用户要求“测试没问题再阶段性收尾”。由于广域回归未全绿、总体检测又发现边界问题，本次**没有把候选标成全面完成，也没有新增提交或操作远端**。已经验证的修复、配套测试和 Task 记录保留在工作树，供阅读本报告后决定下一批修复。

这不是丢失修改：候选文件都在主仓；报告、复核脚本和测试日志在工作区。没有继续使用“累计多少笔未 push”的旧判断。

---

## 二、检测边界与方法

### 2.1 实际执行了什么

1. 回读当前源码、仓库规则、REQ-0030／ADR-0151 及已有任务，追踪入口、状态所有者、事件生产者与消费者。
2. 运行已有 code 相关组件／Hook／合同基线，检查测试是否经过生产入口。
3. 给本轮修复建立红→绿回归：真实 `ActivityPanel` 入口、模型可见工具 Schema、地址栏与工具路径规范化。
4. 运行 `test:impact`、`test:changed`、完整 `bun run check`。
5. 在工作区建立独立 Vitest 配置，直接导入生产实现，对初始化与热跟踪边界作反例测试。没有把这些诊断红灯塞进正常测试发现范围。
6. 用独立 Node/V8 进程，配合显式 GC，对生产输出摘要函数做内存保留对照。
7. 对全量回归中的失败做定向隔离复跑，而不是删除断言、延长超时或忽略错误来换绿灯。

### 2.2 没有执行什么

- 没有调用真实／付费模型，不能据软件测试保证“模型每次都会正确选择 browser_tab”。
- 没有操作用户运行中的 Desktop，没有使用真实用户目录做测试。
- 没有启动长驻 dev、附着 DevTools 或运行 `verify:ui:*`。
- 浏览器宿主测试使用 fake WebContents；**没有因此宣称已经完成真实 Electron 页面加载、截图观感和长时间浸泡验收**。
- 没有推送、拉取、发布、上传制品，未修改工作区／主仓之外的文件。验证的显式日志及 TEMP/TMP/TMPDIR 放在工作区证据目录；未清理用户目录中的旧日志或状态。

因此，本报告是**源码＋确定性软件合同＋隔离组件／状态机＋相关包回归审计**，不是一份虚构的真实模型端到端全绿报告。

---

## 三、现有功能的具体表现

### 3.1 Code 会话独立

| 功能点 | 当前具体表现 | 结论 |
|---|---|---|
| 独立入口 | 普通侧栏有 Allstar 自主开发入口，版块首页承载 code 会话卡片；新建动作先写 coding 档，再进新会话页 | 主路径存在 |
| 普通新会话 | 普通“新会话”导航会回落 work 档；项目档位只应影响新建，不修改已开会话 | 基本合同成立 |
| 普通列表过滤 | 完整列表投影按 `agentMode !== "coding"` 过滤普通 coding 会话 | 静态过滤成立；增量更新有漏洞，见 F09 |
| 开发首页列表 | 按 coding 会话分组，卡片每组展示最近 5 条；“还有 N 条”目前是文字，不是完整历史入口 | 当前是近期卡片，不是完整会话管理 |
| 两册项目 | 普通册与 allstarProjects 为不同注册表，可引用同一目录 | 数据模型已建立；开发册独立创建／冷加载尚未闭环，见 F08 |
| 已开会话模式 | 聊天右栏按会话的 capabilityProfile，而不是当前项目偏好决定 | 模式固化方向正确，主进程落盘／恢复合同已复验 |
| Agent／团队选项 | 选择器按所属 mode 过滤；未标注默认 work；已选中的身份和深链不因此撤销 | 是可见性规则，不是执行权限防线 |
| “无指定 agent” | 仍走普通单会话的 coding 能力组合，不等于没有内置工具、全局插件或 Skill | 不能把“未选 agent”理解为完全裸模型 |
| 配置隔离 | ADR 规划的版块项目专属配置／指令命名空间属于后续 M1 工作 | 不能把现阶段“入口／列表独立”宣传成完整配置／进程隔离 |

主要依据：`sidebar-conversation-projection.ts:38`、`useNewChatNavigation.ts:62`、`useAllstarDevHomePageModel.ts:109–194`、`ChatView.tsx:45–55`、`target.ts:62–69`。

### 3.2 应用启动和新建初始化

当前实现的真实语义不是“每个新会话初始化一次”，而是：

> `useCodingLayoutActive()` 的布尔结果从 false 变成 true 时执行一次布局写入。

写入内容是：

1. 左栏收起；
2. 右栏打开；
3. 右栏宽度设为 `round((window.innerWidth - 24) / 2)`，随后落成固定像素。

1280px 窗口的对照结果为右栏 628px。24px 的口径是**两侧内衬合计 16px＋列间距 8px**，不是“16×2 再加 8”。窄窗口仍受最小聊天区和面板下限约束，因此不保证任何窗口都能严格 50/50；后续窗口 resize 也不是持续按比例跟随。

启动导航已经改成默认进入新会话页，不主动打开上次会话；已有活动／进行中会话不抢跳。但启动新会话仍会读取项目档位：**默认项目若保留 coding 偏好，进入的新会话可以仍是 coding，而不一定是 work**。这一点要和“普通新会话按钮会主动回落 work”区分。

当前的问题是初始化身份与次数不准确，详见 F01／F02／F10。删除“离开时自动展开左栏”解决了一条弹出路径，但没有解决新建身份和路由过渡造成的所有回写。

### 3.3 LLM 热跟踪

| 活动 | 当前展示机制 | 已验证和限制 |
|---|---|---|
| bash／shell | start 写入全局 feed，切终端；end 配对补摘要并结束 running | 基本投屏可用；并非真实 PTY，也不是逐行流式终端 |
| 输出规模 | 最近 100 条；单条摘要最多 2048 个 JS 字符 | 是字符数而非精确 2KB；V8 保留规模不一定等于摘要长度，见 M01 |
| 文件写入 | 写类工具解析路径，更新全局 aiEditTarget；文件页签消费目标 | 不跟踪所有 read／grep／shell 间接写文件；有 F03／F04 |
| 页签选择 | 本轮修复后显式使用实际 workspace；读取当前选中值去重 | 真实入口回归与影响面已通过，旧 unbound 写入问题已修正 |
| 浏览器 | 同工作区的原生浏览器 Agent 活动事件可触发浏览器页签跟随 | 本轮修正 envelope.event；其他工作区／闲置事件忽略 |
| 本地 HTML | 地址栏和 browser_tab 使用同一条路径→file URL 规则 | 普通静态 HTML 无需强行起服务；ES module／fetch／应用路由等仍可能需要 HTTP 服务，这是正常浏览器限制 |
| 隐藏右栏 | 跟随仅改选中页签，不强制重新打开右栏；shell／文件执行不依赖面板是否可见 | 关闭右栏的对照测试通过；“隐藏面板”和销毁浏览器后端不是一回事 |
| 团队 shell／文件 | 团队事件泵也写相同的投屏／编辑目标 | 是共享全局状态，不是完整会话隔离 |
| 团队 browser_tab | 团队成员函数源明确隐藏 browser_tab，原因是没有正确绑定的 WebView 后端 | **当前不支持**，不能因为团队右栏有浏览器就认为成员一定能操作它 |

最后一项是源码明确存在的能力边界：`main/agent-teams/team-member-function-source.ts:6–13`，不是“优先级较低”。普通单会话可感知 browser_tab，也不表示所有团队会话都具备它。

> **范围勘定（2026-10-30 二次核对，详见 11.2）：** 本表热追踪机制的生产端对所有普通单会话生效——`useSessionEventController` 的 tool.start 写入**没有 capabilityProfile 闸门**，work 档会话的 bash／artifact 类工具同样写全局 feed／编辑目标（`AI_EDIT_TOOLS` 明确含 `artifact`）。消费端除 code 会话右栏外，还包括 work 会话手动打开的活动面板（`resolveWorkspaceRightPanel` 对 work＋面板打开返回 activity，且不带 code 页签白名单）、新会话页、项目详情页、会话查看页、团队会话。**当前热追踪不是 code 独有，F03／F05／F06 在 work 会话打开面板时同样存在。**

---

## 四、已确认的问题与复现证据

说明：F01–F10 是本次报告内编号，不冒充已建立的 Bug 工单；F02b 是 F02 的同根子场景。优先级用于后续排期，并不代表本次已全部修复。

### F01【P1】连续新建 code 会话会漏掉初始化

**复现：**

1. 已经处于 code 会话，用户手动打开左栏、关闭右栏，把右栏宽度改为 540。
2. 从版块再次进入同项目的新 code 会话页。
3. 即使新会话页清掉 activeSession，项目档位仍为 coding。

**实测：** `{ collapsed:false, rightOpen:false, width:540 }` 保留下来，未恢复新建要求的 `{ true,true,628 }`。

**原因：** `prevRef` 只记布尔 active；旧 code→新 code 仍是 true，`if (active === previous) return` 直接退出。

**位置：** `root-layout/useCodingSessionLayout.ts:63–84`。

**建议：** 初始化绑定“新建意图／新会话身份”，不能只绑定“当前是不是 coding”。

### F02【P1】发首条消息的过渡可能再次初始化，覆盖用户手动选择

**复现：** 新 code 会话页初始化后，用户手动改栏状态和宽度；发送首条消息，路由先到聊天页、activeSession 尚未提交；随后 coding 会话对象到达。

**实测：** 手动选择 `{ false,false,540 }` 被重新写成 `{ true,true,628 }`。

**原因：** active 在创建过渡中 true→false→true，同一个新会话被当成两次进入。

**同根子场景 F02b：** 从 work 会话打开**已有** code 会话也会触发同一初始化，虽然用户要求的是新建时初始化。

**建议：** 一个创建意图只消费一次，贯穿新会话页到实际 session 的提交；打开既有会话不要冒充新建。不要再靠延迟 1.2s／4s 猜测生命周期。

### F03【P2】文件面板会消费其他项目遗留的编辑目标

**复现：** 全局 aiEditTarget 仍为 `/project-a/private.ts`，挂载项目 B 的文件面板。

**实测：** B 的内嵌详情被设为项目 A 的路径。

**原因：** `useFollowAiFileEdits` 没有工作区／会话身份，挂载即消费全局旧目标；本轮页签 hook 已避免重放旧 shell 信号，但文件详情消费端没有同步隔离。

**位置：** `useFollowAiFileEdits.ts:13–23`、`shared/store/ai-activity-atoms.ts:8–21`。

**影响：** 用户容易误认为 AI 正在改当前项目，实际详情却指向其他项目。这里没有读取真实敏感文件，探针路径为合成数据。

**建议：** 编辑活动带源会话／workspace 身份，并在消费端过滤；不要仅按“路径看起来在目录下”代替来源身份。

### F04【P2】手动浏览别的文件后，同一 AI 文件再次编辑不会跟回

**复现：** AI 编辑 A → 用户手动打开 B → AI 再次编辑 A。

**实测：** 页签可以切回“文件”，但详情仍停在 B。

**原因：** 文件详情 hook 用 `lastFollowedRef === target.path` 去重，没有比较当前实际预览是否仍是 A。

**位置：** `useFollowAiFileEdits.ts:16–22`。

**建议：** 去重比较当前选中文件与本次活动，而不是只记上一次 AI 目标。

### F05【P2／已知演示限制】终端内容仍全局混流

**复现：** feed 中有 A 项目的命令，渲染 B 项目的终端面板。

**实测：** B 仍显示 A 的命令和输出。

**原因：** `AiTerminalReplayPanel` 直接读取全局 feed，没有按 workspace/session 过滤；条目仅留 cwd，并未使用它隔离显示。

**位置：** `AiTerminalReplayPanel.tsx:37–40`。

这项在早期演示方案里曾明确接受，所以本报告把它列为**已知限制**，不倒过来说成一项从未告知的安全隔离承诺。但当前做总体产品验收时，不能把它称为“每个 code 会话的独立终端历史”。

### F06【P2】切走会话后完成的命令可能永久显示“执行中”

**复现：** A 的 shell start 已进入 feed → 用户切到 B → A 的 tool.end 到达。

**实测：** feed 的 A 条目仍是 `running:true`，没有完成输出。

**原因：** 普通事件泵在最前面以当前 activeSession 和 chat stream owner 拦旧会话事件。保护聊天流串写是正确的，但全局终端条目也放在同一道闸门之后，end 被一起丢掉。

**位置：** `useSessionEventController.ts:205–215, 506–510`。

**建议：** 会话归属明确的工具活动状态由独立生命周期所有者维护，再投影到当前界面；不要为修投屏去删除聊天流的防串写闸门。

### F07【P2／展示能力缺口】目前不是命令输出的流式热跟踪

**复现：** shell start 后发送带 `partialResult` 的 tool.update，但尚未 end。

**实测：** 终端条目 output 仍为空，只能看到命令与 running；到 end 才补结果摘要。

**位置：** 普通事件泵只在 start/end 写 feed；团队泵同样只接 start/end。

原计划就是回放／投屏而非共享 PTY，不能把它判成“没有真终端”的 Bug；但若用户期待运行中持续看到 stdout，需要补 **tool.update 的有界合并**，不能宣传为已具备逐行输出。

### F08【P1】只登记在开发册的项目，历史加载与新建候选未闭环

**复现：** 普通 projects 只有 `/ordinary`，allstarProjects 另有 `/code-only`；该目录有 coding 历史，sessionsMap 尚未加载它；进入 Allstar 首页。

**实测：**

- `/code-only` 的已登记卡片出现，但会话请求列表为空，没有调用该目录的 listSessions。
- 卡片仍显示 `sessions:[] / totalSessions:0`。
- 页底新建会话的项目候选只有 `['/ordinary']`，不含 `/code-only`。

**原因：** 卡片已经读第二册，但 `projectOptions` 仍取普通 projects；补拉会话的 effect 又只遍历 projectOptions。

**位置：** `useAllstarDevHomePageModel.ts:132–169, 183–194`。

**影响：** “打开已有目录归入开发册”可以成功登记，但只在开发册的目录不能通过现有选择器正常发起新开发会话，冷启动后的历史也容易显为空。卡片本身只提供已有会话打开，不能填补这个创建入口。

**建议：** 开发册自身成为创建候选和历史补拉的事实源；保留 ADR 允许的“未归册 coding 近期历史可达”作为另一条聚合路径，不再借普通项目列表代替开发册。

### F09【P2】coding 会话的即时增量行会短暂进入普通侧栏

**复现：** session changed 事件携带 coding 会话及可用 firstMessage；观察随后全量刷新之前的 sessionsMap，再做普通侧栏投影。

**实测：** 普通侧栏能投影出该 coding 会话。

**原因：** `useProjects` 的即时插入只拷贝 id/path/cwd/firstMessage/modifiedAt，丢了 agentMode；普通过滤把缺标记视为 work。

**位置：** `project/hooks/useProjects.ts:167–191`，对照 `sidebar-conversation-projection.ts:46–51`。

**边界：** 后续全量 listSessions 可能纠正它，因此这里是**可复现的增量窗口漏过滤**，不是断言它会永久停在普通列表。探针冻结了全量刷新计时器，专门观察这一窗口。

### F10【P2／初始化策略冲突】新会话不保证重新带齐四页签及固定顺序

**复现：** 同一项目上次隐藏了 terminal，排序改为 browser/file/git/terminal；新建 code 会话。

**实测：** 页签仍是 `['browser','file','git']`，缺终端，顺序也不是文件/Git/终端/浏览器。

**原因：** 四个默认定义和自然排序是对的，但新会话复用 cwd 级 hidden/order/选中记录；初始化只写显隐与宽度，不处理这些偏好。

**位置：** `activity-atoms.ts:208–272`、`useActivityPanelModel.ts:96–114`、`resolve-activity-tabs.ts:18–26`。

**需要确定的产品策略：** “新建时总恢复四页签默认”与“项目级偏好跨会话保留”目前同时存在。按本次用户口径，新建初始化应优先；初始化后的手动操作仍应保留。

### G01【P2】Git 页签分支名解析存在两个稳定错误

- `## main...origin/main [ahead 1]` 被解析成 `main...origin/main`，而不是 `main`。
- `## HEAD (no branch)` 被解析成 `HEAD`，导致 detached 的短 SHA 展示兜底走不到。

**位置：** `main/git/git-repo-status.ts:36–39, 65–71`。

已有测试在全量与隔离复跑中均失败。本轮没有修改这两个生产函数来掩盖检测结果。它直接影响右栏 Git 的显示，值得与热跟踪一起排下一批。

---

## 五、实际测试结果及失败分流

### 5.1 正常验证批次

不同批次可能重复覆盖相同用例，**不要把下表简单相加作为去重覆盖总数**。

| 命令／批次 | 实际结果 | 说明 |
|---|---|---|
| 浏览器工具域 | 5 文件，42/42 通过 | 三条旧合同对齐后的结果 |
| 页签修复定向 | 3 文件，29/29 通过 | 真实面板入口、跟随 hook、地址栏 |
| 页签 test:impact 最终复跑 | 27 文件，113/113 通过，exit 0 | 首轮虽断言通过但有 Git IPC 桩遗漏，补齐外部边界后才全绿 |
| Code 现有功能基线 | 24 文件，115/115 通过 | 入口／选择器／模式轴／启动／初始化／终端／文件／浏览器／团队能力边界 |
| 模式与浏览器补验 | 6 文件，77/77 通过 | 模式配置及持久化、地址栏、两个浏览器宿主；含第四条旧 file 断言修正 |
| 完整 bun run check | 最终 exit 0 | lint、所有类型检查、守卫、mobile-lint；不包含行为测试 |
| 独立审计探针 | 12 场景，2 过、10 个失败测试 | 新发现证据；不属于正常 CI gate，详见第四节 |
| V8 输出摘要内存对照 | 已采样并保留日志 | 详见第六节，不冒充 Electron 浸泡结果 |

### 5.2 test:changed 的完整结果

选择显式 code-agent／Desktop 改动，实际扩展到了四个包。耗时约 **2351 秒（39 分钟）**。

| 包 | 测试结果 | 该轮结论 |
|---|---|---|
| coding-agent | 1677 通过、3 失败、3 跳过，共 1683 | 失败 |
| runtime-desktop | 51 通过 | 通过 |
| cli-host | 238 通过、14 跳过，共 252 | 通过 |
| desktop | 6241 通过、7 失败、19 跳过，共 6267 | 失败 |

**该轮整体 exit 1。没有因为后来一些隔离用例通过，就把这轮改写为通过。**

### 5.3 十条失败的逐项处理

| 项目 | 数量 | 隔离／核对结果 | 归属 |
|---|---:|---|---|
| BrowserViewHost 仍断言 file 拒绝 | 1 | 对齐现行 file 合同，77 例补验中通过 | 本次需补齐的旧合同遗漏，已处理 |
| Git 分支解析 | 2 | 隔离仍失败，具体错误见 G01 | 当前基线真实行为错误，未修 |
| 远程插件命令退出码 | 1 | 隔离仍返回 0，测试期望非零 | 当前基线／环境兼容项，非本轮浏览器／页签差异；尚未进一步根因化 |
| Marketplace 相关超时 | 3 | 两个文件隔离复跑全部通过 | 负载／时序敏感，不能直接视为“可忽略” |
| 资源加载 fixture 继承工作区 AGENTS | 1 | 隔离仍失败；第一条指令来自其祖先工作区而非 fixture 自身 | TEMP 被限定到工作区后暴露的夹具假设；未删除或改写真实 AGENTS |
| grep 集成 `spawn rg ENOENT` | 1 | 隔离仍失败；当前 Bash 的 rg 是函数，不是可供 Node spawn 的 PATH 可执行文件 | 测试环境依赖问题，未在系统外安装工具 |
| Session 初始化 profile 快照 | 1 | 隔离仍因新增 createExplicitMemoryRuntime 字段与旧期望列表不符 | 当前基线合同测试维护项；本轮未触碰该源文件／期望列表 |

上表的“非本轮差异”是基于实际 diff、具体失败输入及隔离复跑作出的归属，不是凭文件名猜测。**没有另建干净历史工作树执行全套前后差分**，所以不把它们统称成已严格证明的所有历史回归。

六条稳定复现项仍在：Git 两条、远程退出码一条、资源夹具一条、rg 一条、profile 快照一条。市场三条仅在隔离批次通过；尚未重新跑完整四包长批次证明它们不再偶发。

---

## 六、内存与此前白屏：能确认什么，不能确认什么

### M01【P2】输出“截成 2048 字符”不代表只保留这点内存

生产 `readContentText` 先把完整文本块放入 parts，再 join／slice。V8 的子字符串可以保留原大字符串。

独立 Node/V8 探针显式 GC 后的结果：

| 输入／保存方式 | 最终保存的摘要字符数 | 堆增量 |
|---|---:|---:|
| 3×16MiB 输入，把小摘要复制为独立字符串的对照 | 6144 | 约 0.01MiB |
| 同输入，直接保存生产函数返回值 | 6144 | **约 48.01MiB** |
| 100×50KiB 输入，保存生产函数返回值 | 204800 | **约 4.90MiB** |

释放摘要后堆回到约 9.3MiB，支持“由摘要引用保留母字符串”的判断。

**重要限制：** 正常 Node shell 执行器本来就有约 50KiB／2000 行截断（`runtime-node/src/coding/shared/truncation.ts:1–2`），所以不能把 16MiB 的纯函数压力样本当成每次真实 shell 的常态，更不能据此直接宣布此前 OOM 已定位。该探针证明的是摘要自身的内存上界没有被真正压到 2KiB。

建议后续先限制每块的拼接输入、只对实际 shell 条目提取，并在需要时对短摘要作独立字符串复制；再用真实进程堆快照确认收益。

### M02【P1／待定位】此前 OOM 未得到根因证明

已有日志能确认两次 render-process-gone 的 reason 为 oom；`performance.measure` 抛错和随后 React 内部状态报错都出现过。但这些证据**不能证明**：

- 每次 OOM 都由 HMR 或某次 hooks 崩溃引起；
- `role="log"` 一定制造了无界无障碍缓存；
- 把 role 换成 region 后，长任务 OOM 就已经治好。

本次还核对了实际 dev React bundle：`logComponentRender` 会在 props 变化时调用 performance.measure，并附带用于 DevTools 展示的属性差异；字符串属性会 stringify。这与栈的位置吻合，属于值得进一步检查的增长／复制路径，**仍不是完整持有链证据**。

因此：**之前把 role 改动当成 OOM 定案的结论在此纠正。** 目前保留的是“进程确实 OOM”“开发态性能记录需要检查”“摘要存在额外保留”三条不同强度的事实。还缺同一任务条件下的堆快照持有链、开发／生产及 DevTools 开关对照、修复前后长时浸泡。

---

## 七、浏览器与安全／能力边界

1. **内置浏览器是真实 WebContentsView，不是假预览器。** 地址栏与工具层此前确有只允许 HTTP(S) 的限制；现行 file 支持已改变这一点。
2. `browser_tab` 和 agent-browser CLI 是两条不同会话，不共享“用户看到的那个页面”。不能因模型说“打开浏览器并截图”就推断它操作了右栏。
3. 本次核对的失败会话，持久化工具调用全部是 `{}`，实际错误是缺 action。没有原始流式请求／响应片段，不能单凭它认定“模型没生成参数”还是“传输／解析丢了参数”。**这一具体回合没有成功执行导航，因此也没有新的浏览器 Agent 活动事件；停在文件页并不能证明浏览器后台其实已经打开。** 另外，如果模型使用独立的 `ls` 文件列表工具而非 bash/shell 执行 `ls`，目前也不会触发“shell→终端”的规则；不是所有工具都会切页签。源码中的 unbound／事件信封接线错误则是另有红→绿证据的真实问题。
4. 已确认旧 Schema 的 Provider 表面缺顶层 properties。现行 Anthropic 工具转换代码只提取顶层 properties／required，旧形态在这条转换路径会变成空字段对象。新 Schema 已避免这一软件缺陷；**不代表已完成所有 Provider、所有模型的真实质量验证**。该修改涉及 coding-agent 及主进程装配，后续实机验收应先正常重启 dev，再开新回合；renderer 的热更新不能替代主进程重载，回合内工具面冻结也应被尊重。
5. 团队成员目前明确隐藏 browser_tab。这是后端绑定能力缺口，单改 prompt 或“工具优先级”不能补齐。
6. file 放行当前只判协议，不是目录授权。不能再用“bash 全权限能读文件”来证明它在 sandbox／不同审批模式下没有权限面变化；也不能用 contextIsolation／webSecurity 宣称 file 页已经按工作区隔离。未尝试读取任何真实敏感文件或演示越权。若后续要求工作区沙盒等价，需要单独做文件路径／符号链接／目录授权与审批矩阵。
7. 简单 HTML 可以直接 file 打开；模块化前端的 import、fetch、服务端接口等可能必须走 HTTP。让模型起本地服务并不总是错，关键是工具能力说明要与实际任务相符。

---

## 八、推荐后续修复顺序

### 第一批：初始化与开发册闭环

- 用明确的“新建 code 会话意图／创建身份”消费初始化，不再依赖 active 布尔翻转。
- 同一创建流程跨路由提交不重复初始化；打开已有会话不误初始化；连续创建能各自初始化。
- 明确新建时四页签默认与项目持久化偏好的优先级。
- 开发册自己提供创建候选和历史加载，修 F08。

### 第二批：活动数据所有权

- 先按 11.3 新增需求把热追踪收敛为 code 独有：生产端按会话 capabilityProfile 过滤写入，消费端非 coding 挂载点不跟随。该收敛缩小 F03／F05／F06 的暴露面（work 会话不再受混流与悬留影响），但不替代下面的会话所有权修复。
- 活动携带 session/workspace/author 的明确身份；先保存活动事实，再按界面当前身份投影。
- 文件详情与页签选择共享一致的当前目标判断，修旧信号和同文件再次编辑。
- shell 完成配对不能被聊天流切换闸门一起丢掉；团队成员的 call id 还应考虑成员身份，不能只靠 conversationId 前缀假定全局唯一。
- 终端按会话隔离；若确实要运行中输出，增加有界的 tool.update 合并，并补失败／取消显示。

### 第三批：可靠性和验证债

- 修 Git 分支解析；处理六条稳定回归／环境阻断，不降断言换绿。
- 进行真实 Electron 页面／截图／隐藏与回切验证，再按获授权的预算做真实模型用例。
- 做可重复的 OOM 持有链与浸泡验证，再决定是否需要性能记录预算／清理或其他修复。

这些是建议，不是本次已经偷偷实施的改动。

---

## 九、证据文件与复核办法

证据目录：[仓库内证据目录](code-mode-audit-evidence/README.md)

| 文件 | 用途 |
|---|---|
| [phase1-test-changed.log.txt](code-mode-audit-evidence/phase1-test-changed.log.txt) | 四包全量回归历史结果，保留 10 条初次失败；路径与工作区指令已脱敏 |
| [phase1-final-check.log.txt](code-mode-audit-evidence/phase1-final-check.log.txt) | 历史完整 check 的 exit 0 证据 |
| [final-record-guards.log.txt](code-mode-audit-evidence/final-record-guards.log.txt) | 报告台账完成后的历史守卫校验 |
| [code-mode-existing-baseline.log.txt](code-mode-audit-evidence/code-mode-existing-baseline.log.txt) | 24 文件／115 例既有 code 功能基线 |
| [mode-and-browser-contracts.log.txt](code-mode-audit-evidence/mode-and-browser-contracts.log.txt) | 6 文件／77 例模式与浏览器补验 |
| [cross-package-failures-isolated.log.txt](code-mode-audit-evidence/cross-package-failures-isolated.log.txt) | Git／远程命令稳定失败及市场超时隔离复跑 |
| [coding-agent-failures-isolated.log.txt](code-mode-audit-evidence/coding-agent-failures-isolated.log.txt) | rg、资源继承和初始化快照隔离失败；工作区指令已脱敏 |
| [code-mode-behavior.probe.tsx](code-mode-audit-evidence/code-mode-behavior.probe.tsx) | 历史诊断场景；旧基线故意保留期望红灯 |
| [audit.vitest.config.mts](code-mode-audit-evidence/audit.vitest.config.mts) | 独立配置，不改变主仓正常测试发现 |
| [code-mode-behavior.probe.log.txt](code-mode-audit-evidence/code-mode-behavior.probe.log.txt) | 当时 12 场景的断言和 AUDIT 状态输出 |
| [terminal-output-memory-probe.mts](code-mode-audit-evidence/terminal-output-memory-probe.mts)／[历史输出](code-mode-audit-evidence/terminal-output-memory-probe.log.txt) | V8 堆保留的生产函数与独立短副本对照 |

### 重跑诊断探针（在主仓根执行）

在受控环境中先将 TEMP/TMP/TMPDIR 指向授权范围内新建的隔离空目录，再从当前仓库根执行（依赖与限制见证据目录 README）：

```bash
bun scripts/quality/run-vitest.mjs \
  --config project/verification/code-mode-audit-evidence/audit.vitest.config.mts \
  --run
```

**历史基线预期 exit 1**：2026-10-30 的探针有 10 个失败、2 个对照通过；当前代码和 API 已演进，今天的结果可能不同，不能用历史预期推断当前结果。此探针不属于正常 CI gate。

内存探针：

```bash
node --expose-gc --experimental-strip-types \
  project/verification/code-mode-audit-evidence/terminal-output-memory-probe.mts
```

脚本只创建合成字符串并调用生产摘要函数，不连接 Provider，不打开用户浏览器，不触碰真实会话；现已改为仓库相对导入。测量受 Node/V8、平台与当前实现影响，不能直接与历史数据等同。

---

## 十、交付状态

- 已续接 TASK-0339／TASK-0392，新增总体检测 TASK-0407；报告不冒充用户功能验收。**编号勘误**：当前主仓该总体检测为 TASK-0425，TASK-0407 是另一项画布任务；此处保留原时点文字。
- 本轮局部修复及测试仍在主仓工作树，**未新增提交、未推送**；不把静态 check 绿色当作跨包回归全绿。
- 本次新增问题保留为可复核报告／探针，没有借“自由发挥”擅自扩大成一轮未说明的产品重写。
- 已清理本轮工作区内 74 个测试临时条目；保留报告、12 个必要证据文件及空的复核临时目录，没有清理工作区／主仓之外的用户文件。
- 明早最需要决策的是：先集中修“新建身份驱动初始化＋开发册冷加载／创建闭环”，还是先补“活动状态按会话所有权”的完整链路。建议先第一批，它直接影响你最常走的演示开场；OOM 调查则应作为并行的可靠性工作，但要有堆证据，而不是再猜一个根因。

---

## 十一、二次核对与需求追加（2026-10-30）

### 11.1 报告问题复核结论

对第四节 F01–F10、G01 与第六节 M01 逐项对照主仓源码（同基线：`98f7de9e6` 加工作树修复候选）独立复核。**全部问题机制、代码位置与数字口径与源码一致，未发现夸大或错判。** 关键复核点：

- **F01／F02**：`useCodingSessionLayout.ts:73–76` 布尔边沿（`if (active === previous) return`）；`useCodingLayoutActive()` 三条件（coding 档 activeSession／`/agent-teams` 路由／coding 档新会话页），任何 false→true 边沿都写布局，不区分新建／打开既有会话。
- **F03／F04**：`useFollowAiFileEdits.ts` 无工作区身份、按上次 AI 目标去重；与本轮已修的 `useFollowAiActivity.ts:34`（`latest.cwd !== workspace.cwd` 过滤）形成对照，隔离未同步到文件详情端。
- **F05／F06／F07**：面板直接读全局 feed；`tool.end` 的 `markAiTerminalEntryDone`（`useSessionEventController.ts:510`）在双闸门（211／215 行）之后；泵只接 start／end。团队泵同构（`useTeamChatModel.ts:364–394`，仅处理当前挂载会话）。
- **F08**：`projectOptions` 取普通 projects、补拉 effect 只遍历它（`useAllstarDevHomePageModel.ts:164–194`），代码注释自认“暂用现有项目清单”。
- **F09**：`useProjects.ts:173–180` 增量插入丢 agentMode；`sidebar-conversation-projection.ts:50` 把缺标记当 work 放行。
- **F10**：`hiddenActivityTabsAtom`／`activityTabOrderAtom` 按 cwd 持久化 localStorage，初始化只写侧栏／面板开合／宽度。
- **G01**：`/^## (?!No branch)(\S+)/`（`git-repo-status.ts:38`）——`\S+` 吞掉 `...origin/main`；`## HEAD (no branch)` 匹配出 `HEAD`，detached 短 SHA 兜底（69–71 行）不可达，函数注释与实现矛盾。
- **M01**：`readContentText`（`ai-terminal-atoms.ts:58–77`）已做跨块早停，但单大块仍整串入 parts → `join().slice(0,2048)`，V8 SlicedString 保留母串；报告“不能据此定案 OOM”的保留恰当。

细节数字亦核对一致：`SPLIT_FIXED_OVERHEAD_PX=24`（两侧内衬 16＋列间距 8）、1280 窗口得 628、feed 上限 100 条／单条 2048 字符、普通新会话 `DEFAULT_WORKSPACE_MODE="work"` 回落、启动默认落新会话页且不抢跳已有会话（`useLastSessionRestore.ts`）、团队成员 browser_tab 隐藏（`team-member-function-source.ts:13`）。证据目录 12 个文件齐全，`code-mode-behavior.probe.log.txt` 结尾确为 `10 failed | 2 passed (12)`。本次复核只核日志与代码机制，未重跑探针。

### 11.2 范围勘定：初始化与热追踪的归属

**初始化行为是 code 语境专属。** hook 全局挂载于 root layout（`useRootLayoutModel.ts:109`），但写入只在进入 coding 档会话／团队路由／coding 档新会话页的 false→true 边沿发生；work 会话不触发。报告将其归入 code 模式范围是准确的。两个附带事实：它写的是全局布局原子，离开 code 会话后普通会话继承“左栏收起”等状态（设计如此，离开不回写）；且“code 语境”包含团队会话，不只是 code 单会话。

**LLM 行为热追踪不是 code 独有，code／普通共用：**

- 生产端：`useSessionEventController` 的 tool.start 写入对所有普通单会话生效——**没有 capabilityProfile 闸门**；`AI_EDIT_TOOLS` 含 `artifact`，work 档 Canvas 任务变更同样写编辑目标。团队泵（`useTeamChatModel`）写同一对 atom。
- 消费端：ActivityPanel 的挂载点除 code 会话右栏外，还包括 work 会话（用户手动打开活动面板时，`resolveWorkspaceRightPanel` 返回 activity，`enabledBuiltinTabs` 为 undefined＝全部内置页签）、新会话页、项目详情页、会话查看页、团队会话。文件跟随（`useFollowAiFileEdits`）与终端回放（`AiTerminalReplayPanel`）在所有挂载点生效。

因此 **F03／F05／F06 在普通 work 会话打开活动面板时同样存在**。3.3 表格“团队 shell／文件是共享全局状态”点到了性质，但未明说 work 普通会话也在同一共享池。第八节第二批的隔离设计应覆盖所有会话形态。

### 11.3 新增需求：LLM 行为热追踪收敛为 code 模式独有

**用户决策（2026-10-30）：LLM 行为热追踪尽量做成 code 模式独有功能。** 落点：

1. **生产端**：非 coding 档的单会话（work）不写全局 `aiTerminalFeedAtom`／`aiEditTargetAtom`——写入处按会话 capabilityProfile 过滤。团队会话天生 coding 档（`TEAM_CAPABILITY_PROFILE`），维持现状。
2. **消费端**：非 coding 语境的挂载点（work 会话手动打开的活动面板、非 coding 新会话页、会话查看页等）不执行热跟随、不展示 AI 终端回放与文件跟随。
3. **与既有问题的关系**：该收敛缩小 F03／F05／F06 的暴露面（work 会话不再受混流与悬留影响），但**不替代**第二批的会话所有权修复——code 会话之间（跨项目／跨会话）的隔离问题依然存在，仍按第二批执行。
4. **行为取舍（需按规范补发布说明）**：work 会话的 artifact／写类活动将不再驱动右栏文件跟随，AI 命令也不再投屏到 work 语境面板；这是需求本身接受的可见变化。实现时生产端过滤与消费端隐藏建议同批落地，避免只做一半造成“写了但看不到”的中间态。
