<!-- Copyright The Open Forge contributors. -->
# Tasks

Task 是可执行的最小工作项，必须能被一个 Agent 或开发者在一次明确的验证闭环中完成。并行执行时必须同时遵守 [`../collaboration/README.md`](../collaboration/README.md)。详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)，模板见 [`templates/task.md`](templates/task.md)。

## 状态

```text
draft → ready → in_progress → blocked → verifying → done → archived
```

状态和实现/验证事实以每个 Task 文件的 frontmatter 与交付记录为准；本 README 的当前焦点表是导航副本，由 Coordinator 同步维护，并由 `bun run check` 校验状态一致性。

## 当前执行焦点

| Task ID | 状态 | Plan | 焦点 / 协调说明 |
|---|---|---|---|
| `TASK-0421` | `verifying` | PLAN-0026 | [Team 首发 handoff 失败循环与人工重试](TASK-0421-handoff-failure-loop.md)：BUG-0164；原自动风暴已修，当前草稿/文件引用手动重试回归通过，未做实机验收；serial。 |
| `TASK-0420` | `verifying` | PLAN-0026 | [Team 工作区纳入开发册与可选配置兼容](TASK-0420-team-workspace-dev-book.md)：BUG-0163；开发册/普通册/缺省字段用例通过，Desktop typecheck 与完整 check 全绿；待开发册实机验收；serial。 |
| `TASK-0419` | `verifying` | PLAN-0026 | [CREATE 返回透传档位](TASK-0419-create-returns-profile.md)：BUG-0161（验收反馈 P1），恢复交互式会话终端热追踪，源码断言红 1→绿；serial。 |
| `TASK-0418` | `verifying` | PLAN-0026 | [文件页签卸载不回拉宽度](TASK-0418-unmount-preview-width.md)：BUG-0162（验收反馈 P1），卸载/主动关闭语义拆分红 1→绿 2/2；serial。 |
| `TASK-0417` | `in_progress` | PLAN-0026 | [编辑目标按来源过滤](TASK-0417-edit-target-cross-workspace.md)：BUG-0160 原跨项目过滤已落地；当前审查到同 cwd 旧目标挂载回放，修复续接待完善合同/验证；serial。 |
| `TASK-0416` | `verifying` | PLAN-0026 | [热追踪收敛 code 独有](TASK-0416-hot-tracking-code-only.md)：REQ-0030/§11.3（P1），生产+消费同批红 3→绿 24/24；待实机；serial。 |
| `TASK-0415` | `verifying` | PLAN-0026 | [新建 code 会话恢复四页签默认](TASK-0415-new-session-tab-defaults.md)：BUG-0159（F10），红 2→绿 9/9+相邻 10 例；待实机走查；serial。 |
| `TASK-0414` | `verifying` | PLAN-0026 | [新建 code 会话意图驱动初始化](TASK-0414-coding-create-intent.md)：BUG-0158（F01/F02/F02b，P1），布局红 7→绿+相邻 39/39；待实机三流程走查；serial。 |
| `TASK-0413` | `verifying` | PLAN-0026 | [终端条目完成结算解耦](TASK-0413-terminal-entry-stuck-running.md)：BUG-0157（F06），end 结算提升闸门前红 1→绿，控制器 13/13+团队 40/40；serial。 |
| `TASK-0412` | `verifying` | PLAN-0026 | [coding 增量行侧栏漏过滤](TASK-0412-incremental-coding-sidebar-leak.md)：BUG-0156（F09），档位端到端透传红 3→绿 17+12 例；顺带修复该主进程套件既有收集断裂（ipc/session 单点 mock）；serial。 |
| `TASK-0411` | `verifying` | PLAN-0026 | [同一 AI 文件再次编辑跟回](TASK-0411-ai-file-edit-refollow.md)：BUG-0155（F04），双条件去重红 1→绿 8/8（含相邻）；serial。 |
| `TASK-0410` | `verifying` | PLAN-0026 | [开发册项目闭环](TASK-0410-allstar-book-project-closure.md)：BUG-0154（F08，P1），册为候选/补拉事实源，红 3→绿 7/7+View 3/3+相邻 26 例；待实机走查；serial。 |
| `TASK-0409` | `verifying` | PLAN-0026 | [修复终端输出摘要内存保留](TASK-0409-terminal-output-retention.md)：BUG-0153，探针 48→0.01/4.91→0.22 MiB，定向与直接相关面 72/72 绿；impact 暴露范围外 weknora AC-20 既有失败待分诊；serial。 |
| `TASK-0408` | `verifying` | PLAN-0026 | [修复 Git 页签分支名解析](TASK-0408-git-branch-status-parse.md)：BUG-0152 红基线 3 红→绿 5/5，check:quick 过；工程完成待批次收尾统一 check/impact；serial，主检出串行。 |
| `TASK-0407` | `verifying` | PLAN-0025 | [Code 模式总体检测](TASK-0407-code-mode-comprehensive-audit.md)：报告已交付工作区；正常基线 115 例过，独立探针 12 场景中 10 个测试复现缺口；跨包失败已分流，未称全面验收通过。 |
| `TASK-0406` | `done` | PLAN-0025 | [Agent/团队所属模式](TASK-0406-agent-team-mode-attribution.md)：清单 mode + 严格单向档位过滤（未标注默认归 work 档）交付并验收；含 f19ead604 文档校验修复；遗留：用户自建 agent 的模式编辑入口（backlog）、ISSUE-0035 定位重合讨论。 |
| `TASK-0405` | `ready` | PLAN-0025 | [M1 版块壳：/allstar 路由、项目空间、会话管理与配置 v1](TASK-0405-allstar-dev-section-shell.md)；前置 ADR 需用户当日评审；serial，2026-11-06 前收口发 0.1.4。 |
| `TASK-0404` | `done` | PLAN-0025 | [「Allstar自主开发」版块入口](TASK-0404-allstar-dev-section-entry.md)：代码模式独立入口、新会话默认文档与研究档、右栏随会话轴；`c5700985d` 已推 origin/chenxvhua，工程验证与用户实机验收通过。 |
| `TASK-0403` | `done` | PLAN-0024 | 已集成 main，见 Task 集成记录。 |
| `TASK-0402` | `done` | PLAN-0024 | 已集成 main，见 Task 集成记录。 |
| `TASK-0397` | `done` | PLAN-0024 | 已集成 main，见 Task 集成记录。 |
| `TASK-0396` | `done` | PLAN-0024 | 已集成 main，见 Task 集成记录。 |
| `TASK-0395` | `done` | PLAN-0024 | 已集成 main，见 Task 集成记录。 |
| `TASK-0394` | `done` | PLAN-0024 | RESEARCH-0043 固定版本证据已回读；coordination-only。 |
| `TASK-0392` | `verifying` | PLAN-0006 | 2026-10-29 续接：页签跟随接线修复，真实入口红→绿；impact 27 文件/113 例通过，完整 check 已通过；待批次收尾与用户验收。历史交付： [Browser 与 Agent 联动及标签栏性能](TASK-0392-browser-agent-tabs.md)；已合入本地 main（2026-10-24），定向 68 例/影响面/完整 check 绿，同窗反平衡对原版约 -17～-23%、布局读取 4370→0；待用户真机验收。 |
| `TASK-0367` | `done` | PLAN-0021 | [记忆入口与 legacy rollover 兼容基线](TASK-0367-memory-entry-compatibility-baseline.md)；VERIFY-0020 三宿主启用矩阵与 6 条兼容基线交付，工程验证全绿，人工验收不适用。 |
| `TASK-0368` | `done` | PLAN-0021 | [SQLite 驱动与多运行时隔离门禁](TASK-0368-memory-sqlite-native-probe.md)；窗口B交付并集成：probe 全矩阵三运行时×12检查全过（win32-x64），跨平台待环境复验。 |
| `TASK-0369` | `done` | PLAN-0021 | [记忆协议包与新旧策略合同](TASK-0369-memory-runtime-contracts.md)；@vetta/runtime-memory 合同包 + memoryPolicy 会话边界校验 + ADR-0149/0150 落地，完整 check 全绿。 |
| `TASK-0370` | `done` | PLAN-0021 | [稳定项目记忆身份与 Worktree 关联](TASK-0370-memory-project-identity.md)；身份解析器+JSON 注册表落地（alias 规范化、Worktree 候选/确认、移动/复制映射），13 例与完整 check 全绿。 |
| `TASK-0371` | `done` | PLAN-0021 | [SQLite 事实修订存储与资源生命周期](TASK-0371-memory-sqlite-revision-store.md)；@vetta/runtime-node/memory 落地（worker 存储+迁移+lease 池+staging 工具），563 例与完整 check 全绿。 |
| `TASK-0372` | `done` | PLAN-0021 | [有作用域的词法与中文短词检索](TASK-0372-memory-lexical-retrieval.md)；trigram FTS+短词 instr 回退+字面量转义落地（先 scope/时间过滤后匹配），572 例与完整 check 全绿。 |
| `TASK-0373` | `done` | PLAN-0021 | [全版本遗忘与防重抽取撤销屏障](TASK-0373-memory-erasure-barrier.md)；事务性家族清除+来源抑制+epoch 重检合同+无正文审计落地，576+38 例与完整 check 全绿。 |
| `TASK-0374` | `done` | PLAN-0021 | [显式记住、检索、更正与遗忘工具](TASK-0374-memory-explicit-tools.md)；memory_remember/recall/get/correct/forget 五工具落地（宿主绑定 scope、expectedRevision 冲突、家族遗忘），定向 1633 例全绿。 |
| `TASK-0375` | `done` | PLAN-0021 | [Desktop 正常会话接线与有界上下文注入](TASK-0375-memory-desktop-session-wiring.md)；memoryPolicy 透传+组合装配+证据注入（有界/来源/数据框架）落地，策略关闭零变化，定向 20 例与完整 check 全绿。 |
| `TASK-0376` | `done` | PLAN-0021 | [Desktop 记忆管理 IPC 与权限控制](TASK-0376-memory-desktop-control-api.md)；shared 合同+主进程服务+IPC+preload 接线（分页/搜索/详情/更正/遗忘/模式），定向 7 例全绿。 |
| `TASK-0377` | `done` | PLAN-0021 | [记忆查看、纠正、遗忘与设置界面](TASK-0377-memory-desktop-control-ui.md)；/memory 页面（模式/范围/搜索/详情/纠正/忘记）+zh/en i18n，定向 6 例与完整 check 全绿；实机验收待用户。 |
| `TASK-0378` | `done` | PLAN-0021 | [旧记忆导入、Markdown 导出与回滚](TASK-0378-memory-legacy-import-export.md)；MEMORY.md 幂等导入（hash 键/撤销不重生）+版本化导出+展示组件，定向 12 例与完整 check 全绿。 |
| `TASK-0379` | `done` | PLAN-0021 | [增量捕获、持久队列与崩溃对账](TASK-0379-memory-durable-capture-queue.md)；持久 jobs 队列（幂等/lease/过期回收/高水位/纪元复检）+捕获过滤 Observer，定向 10 例与完整 check 全绿。 |
| `TASK-0380` | `done` | PLAN-0021 | [受预算约束的自动抽取与事实合并](TASK-0380-memory-automatic-extraction.md)；决策层落地（预算账本/错误分类/建议校验去重），定向 7 例全绿；真实 Provider 未授权不跑。 |
| `TASK-0381` | `done` | PLAN-0021 | [本地 embedding 资源与版本化向量存储](TASK-0381-memory-local-embedding.md)；窗口B交付并集成：适配端口+版本化向量存储+持久任务（真实模型推理未授权保持未验证）。 |
| `TASK-0382` | `done` | PLAN-0021 | [混合检索、融合排名与注入预算](TASK-0382-memory-hybrid-retrieval-context.md)；RRF 双路融合+注入预算（pin 占额/scope 保底）落地，定向 16 例全绿；参数为待评测初值。 |
| `TASK-0383` | `draft` | PLAN-0021 | [迟到更正、历史已知视图与冲突状态](TASK-0383-memory-bitemporal-queries.md)；待前置产物，未开工；serial。 |
| `TASK-0384` | `draft` | PLAN-0021 | [经验晋升、软衰减与可重建摘要](TASK-0384-memory-experience-evolution.md)；待前置产物，未开工；serial。 |
| `TASK-0385` | `draft` | PLAN-0021 | [CLI 显式策略与跨会话记忆接入](TASK-0385-memory-cli-host-integration.md)；待前置产物，未开工；serial。 |
| `TASK-0386` | `draft` | PLAN-0021 | [IM 记忆身份选择与 legacy 兼容适配](TASK-0386-memory-im-identity-adapter.md)；待前置产物，未开工；serial。 |
| `TASK-0387` | `draft` | PLAN-0021 | [项目记忆的可选迁移包与副本隔离](TASK-0387-memory-project-archive.md)；待前置产物，未开工；serial。 |
| `TASK-0388` | `done` | PLAN-0021 | [记忆连续流程、质量对照与发布门槛](TASK-0388-memory-evaluation-harness.md)；确定性评测基座（3 场景×5 臂×延迟×成本）+连续用户流程 3 例落地，VERIFY-0021；真实质量保留未验证。 |
| `TASK-0389` | `draft` | PLAN-0021 | [可选多跳关系或概要检索消融实验](TASK-0389-memory-graph-ablation.md)；待前置产物，未开工；serial。 |
| `TASK-0390` | `verifying` | PLAN-0021 | [记忆交付后复核修复与正常入口闭环](TASK-0390-memory-postreview-fix-loop.md)；VERIFY-0022 六项 P1 全关闭（BUG-0147–0150），三包 124 例+完整 check 绿；真实 UI/模型未验证，工程交付待人工接受。 |
| `TASK-0366` | `verifying` | PLAN-0006 | BUG-0146：注入垫片改外层 IIFE 形参，依赖函数在压缩产物可用，点选提交链与停止点选实机验证通过，卡死消失。定向全绿。串行。 |
| `TASK-0365` | `verifying` | PLAN-0006 | BUG-0145：点选改在 pointerdown 打开元素旁批注。定向 13 例与 `check:quick` 全绿。主进程脚本，需重启 dev 后实机看。串行。本地 main 已提交，未推送。 |
| `TASK-0391` | `verifying` | — | 新增 macOS 测试包专用 workflow：手动 dispatch，只出未签名 DMG，不跑 quality / Win / Linux leg 与 packaged E2E；YAML 结构已校验，首次 dispatch 即真实验证；需先入 dev 并随 `dev → main` 晋升才出现运行按钮；serial。 |
| `TASK-0362` | `verifying` | — | BUG-0144：内置浏览器占位洞跟着布局与窗口缩放走到终值。用户已确认侧栏与缩窗可用。定向 34 例通过。主工作区串行。 |
| `TASK-0361` | `verifying` | — | REQ-0026 / ADR-0147：项目迁移包已实施——OFAR v2 workspace 帧、preview/apply 两段式导入（cwd 重写+指纹按落盘形态）、产物打包恢复（默认不覆盖）、迁移向导 UI 与 i18n；定向 73 例、impact 119 例、完整 check 全绿；六提交本地 main 未推送；顺带修复 TASK-0349 菜单接线缺口；待真实双目录迁移人工验收；serial。 |
| `TASK-0360` | `verifying` | PLAN-0006 | 用户要求 UI 测试。正在用隔离 Fresh 实例核对页内批注。不附着日常 Desktop。 |
| `TASK-0352` | `blocked` | PLAN-0020 | Windows沙箱制品完整性与运行时定位；来源BUG-0137，生产实现serial、独立调查只读；待红/绿与工程验收。 |
| `TASK-0353` | `verifying` | PLAN-0020 | 消息历史与live合并身份去重及可读诊断；来源BUG-0123，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0354` | `verifying` | PLAN-0020 | 远端会话资源加载去重与有界等待；来源BUG-0125，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0355` | `verifying` | PLAN-0020 | 启动paint与超时分流及阶段观测；来源BUG-0138，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0356` | `verifying` | PLAN-0020 | 插件Hook派发与渲染端代次生命周期对齐；来源BUG-0124，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0357` | `verifying` | PLAN-0020 | HostedRoute能力注册与模块重载一致性；来源BUG-0139，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0358` | `verifying` | PLAN-0020 | Desktop测试日志与真实数据根隔离；来源BUG-0140，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0359` | `verifying` | PLAN-0020 | Windows远程输入类型初始化幂等；来源BUG-0141，生产实现serial、独立调查只读；定向回归与独立复审通过，组合证据见PLAN-0020；本地main提交，未发布。 |
| `TASK-0351` | `verifying` | PLAN-0006 | RESEARCH-0036：单击在元素旁批注并发送；Alt+单击只把元素放进输入框。待真实 Desktop 点选验收。 |
| `TASK-0350` | `done` | — | 最近14天日志只读调查完成：55份运行日志+8份辅助日志，RESEARCH-0035与脱敏指纹附表已落盘；优先沙箱制品核查、消息身份、远端资源及启动测量，区分历史修复与测试污染；文档索引/合同/发布说明检查通过，无产品修复；coordination-only。 |
| `TASK-0349` | `verifying` | — | 用户请求：完善会话管理——项目级多会话 `.ofar` 导出（服务+IPC+preload+项目右键菜单，菜单重构为声明式）、导入写入后 emit 列表变更让侧栏即时刷新、导入/导出反馈 alert→Toast；定向 6 文件 30 例、impact（desktop 85 例 + theme-ui 186 例）、desktop tsc 与完整 check 全绿；待真实 Desktop 人工验收；serial，main 主工作区串行。 |
| `TASK-0342` | `done` | — | 验收批次收口（用户决策）：26 个 Task 从 `verifying` 闭合为 `done`（安全与设计插件 0309–0317、PLAN-0019 自主开发 0322–0328/0330–0332/0334、上游 UI 同步 0335–0338、浏览器/预览线 0339/0340），`BUG-0134`/`BUG-0135` 同步关闭；纯台账改动，`bun run check` 校验索引一致性。 |
| `TASK-0339` | `verifying` | — | 2026-10-30 续接：用户已批准旧测试对齐；工具域 42 例、模式/浏览器合同 77 例通过。跨包 10 失败已分流（另见 TASK-0407），未宣称全量绿；候选未提交。历史交付： BUG-0134：browser_tab 可纠正错误（缺 action/非法动作/`file://`/无会话给恢复步骤）+ 通用链路「相同工具+相同参数+相同确定性错误」连续 3 次止损；定向 34 例、impact、根 tsgo、Desktop typecheck 与 check:quick 通过；实现 `f2728086a` 已推送 origin/dev，待真实模型回合验收；serial，main 主工作区串行。 2026-10-21 用户验收闭合。 |
| `TASK-0340` | `done` | — | BUG-0135：HTML 预览改走 `vetta-file://` 恢复目录语义、取消 `opacity-0` 门槛、合并目录事件并按被引用资源刷新；工程验证通过，实现 `1f555175b` 已推送 origin/dev，待真实 Desktop 人工验收；serial，main 主工作区串行。 2026-10-21 用户验收闭合。 |
| `TASK-0341` | `verifying` | — | RESEARCH-0034：浏览器运行时探测缓存（成功约 60s / 失败约 4s）与在途去重，人工重检绕过、安装代次失效、执行失败失效；定向 40 例、impact、根 tsgo、Desktop typecheck、完整 check 通过；实现 `a59e4c0f2`、记录 `70e452421` 已推送 origin/dev 并核对远端；待真实 Desktop 人工验收缓存期内探测子进程为 0；serial，main 主工作区串行。 |
| `TASK-0335` | `done` | PLAN-0014 | mono 主题配色对齐上游 `313be5324` 并补 token 覆盖测试；实现 `b0c2148f0` 已集成 main，定向 2 例、impact 与完整 check 通过；记录 `2fcc7d9e7` 已推送 origin/dev 并核对远端；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0336` | `done` | PLAN-0014 | 已完成消息默认折叠、虚线「已完成」头与展开时间线；实现 `47b51ac8c` 已集成 main，定向 16 例、impact 与完整 check 通过；记录 `2fcc7d9e7` 已推送 origin/dev 并核对远端；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0337` | `done` | PLAN-0014 | 项目详情页去线留白、指令预览/编辑与 CLAUDE.md+AGENTS.md 双读；实现 `39d28557c` 已集成 main，定向 41 例、impact 与完整 check 通过；记录 `2fcc7d9e7` 已推送 origin/dev 并核对远端；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0338` | `done` | PLAN-0014 | 自定义 MCP 连接器弹窗去线留白重构，保留工具清单与 idleTimeout；实现 `b53a6fd98` 已集成 main，定向 14 例、impact 与完整 check 通过；记录 `2fcc7d9e7` 已推送 origin/dev 并核对远端；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0334` | `done` | PLAN-0019 | Requirement Run Phase 1 已实施并本地验证：coverage schema/runner/CLI、19 例定向、116 例 agents、31 例记录检查与完整 check 通过；实现 `54e080673`、记录 `c1b45985d` 已推送 origin/dev 并核对远端；待独立评审与人工验收；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0333` | `done` | PLAN-0019 | 干净副本累计批次 46/46 包、quality 635 例及完整 check 通过；8dcd7a3d2 已 fast-forward 推送 origin/dev 并核对远端；原 temp 保留；serial。 |
| `TASK-0332` | `done` | PLAN-0019 | 图谱调查与当前会话协作已接入 intake；29 例、quick/guards 通过，原生新上下文只读审查已实际派发回收；Claude 端与完整开发流程待使用验收；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0326` | `done` | PLAN-0019 | 角色合同已随 ecfe01f17 集成 main；TASK-0333 组合 46/46 包通过并回填集成元数据，真实模型仍待验收；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0327` | `done` | PLAN-0019 | 有界队列编排已随 94560c460 集成 main；TASK-0333 组合 46/46 包通过并回填集成元数据，真实外部循环仍待验收；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0328` | `done` | PLAN-0019 | UI 接线与合同测试已实现：显式授权、六主题运行证据、独立视觉评审、清理与绑定；真实 UI 验收延期；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0329` | `blocked` | PLAN-0019 | 用户暂无问题来源，外部采集先搁置；不阻塞明确 Task 的开发闭环。 |
| `TASK-0331` | `done` | PLAN-0019 | 单任务失败修复续接与合并重验已接通；WSL2 受控 Git/进程验证，真实模型与 CI/UI 验收延期；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0330` | `done` | PLAN-0019 | WSL2 完整独立副本、Bun 1.3.14 / Node 22.23.3 与 Linux 依赖已准备；107 例通过、software ready，模型/发布关闭，真实隔离未验；serial。 2026-10-21 用户验收闭合。 |
| `TASK-0325` | `done` | PLAN-0019 | 基线与发布时钟修复：制品 14、合同 137、Desktop 29 例通过；已集成 main `80ad98655`，组合 test:changed 46/46 包通过，合并前完整 check exit 0；实际环境与适配差距见 VERIFY-0019。 2026-10-21 用户验收闭合。 |
| `TASK-0324` | `done` | PLAN-0019 | 反馈、三日期经验候选、用量摘要、发布幂等与灰度/清理恢复；已集成 main `80ad98655`，组合 test:changed 46/46 包通过，真实环境仍关闭。 2026-10-21 用户验收闭合。 |
| `TASK-0323` | `done` | PLAN-0019 | 调度、签名人工闸门、最终合并重验与 DESIGN 源审计；已集成 main `80ad98655`，组合 test:changed 46/46 包通过，真实 UI/部署未验收。 2026-10-21 用户验收闭合。 |
| `TASK-0322` | `done` | PLAN-0019 | 自主研发运行合同、租约、进程、评审与可信验证核心；已集成 main `80ad98655`，全量受影响测试历史超时经组合 46/46 包验证；完整范围见 PLAN-0019。 2026-10-21 用户验收闭合。 |
| `TASK-0321` | `verifying` | — | ISSUE-0029：dev push 只跑轻量质量检查，三平台单测与 desktop-packaged 改为 PR/手动触发；名下其他私有仓库 Actions 已停用；serial，main 主工作区串行。 |
| `TASK-0320` | `done` | — | BUG-0131：把插件宿主失效点从 `did-start-navigation` 改为已提交的 `did-navigate`，抽出可测试导航接线；真实拦截导航后工具不再永久 loading；serial，main 主工作区串行。 |
| `TASK-0319` | `verifying` | — | REQ-0018：侧边栏「能力」→「技能与连接器」、「设计」→「原型设计」，同步页面跳转目标名/新手引导入口标题/设置助手路径提示与中英文 catalog；新增入口命名一致性合同测试 2 例，定向 22 文件/132 例、`check:quick` 与完整 `check` 全绿；serial，main 主工作区串行，待人工目验。 |
| `TASK-0318` | `verifying` | — | REQ-0017：桌面端「智能客服」直连 WeKnora（连接层 + 通道层 + 界面层 + 文案）；13 个原子提交在本地 main，feature 测试 16 文件 / 149 例全绿、三个受影响域回归 243 文件 / 1329 例通过；`integration_status: pending`，未推送；serial，main 主工作区串行。 |
| `TASK-0317` | `done` | — | RESEARCH-0032 积压 #16 已实施并入 main（`fb6ed3cd4`，Worker 提交 `a15ee5f82`）：CLI 子进程 userData 迁入 `<vettaHome>/tmp/<openforge-…-cli[-pid]>`（0700 创建即生效 + chmod 收紧），不再落共享 `os.tmpdir()` 可预测路径；新增 cli-user-data 模块 5 例（Windows 跳 2 个位断言）；定向、check:quick、完整 check、impact 全绿；人工验收不适用，待发布。 2026-10-21 用户验收闭合。 |
| `TASK-0315` | `done` | PLAN-0018 | F1/F2 数据层已实施并入 main（`aec55c508`）：插桩升级 `file:line:column`（source-tagger 抽取+登记 ENGINE_FILES）、parseSourceLocator 跨代解析、元素上下文包（outerHTML/样式摘要进 SelectedElementPayload 与 vetd_notes）；附带 design-session 类型谓词修复与 0309/0315 触碰文件声明头补齐（ratchet new=0）；包内 732/732、合并后 754/754 绿、tsc 0 错；待用户实机（画布选元素看列级 locator/上下文包）。 2026-10-21 用户验收闭合。 |
| `TASK-0316` | `done` | PLAN-0018 | F3 前置 AST 写回骨架已实施并入 main（`5fa25533f`，fork 会话执行）：src/inspector/ast-edit 六模块 + 22 例（parse/guards/locate/style/text，magic-string 保格式、动态 className 只读拒绝），新增 @babel/parser、magic-string、tailwind-merge；design-session 类型红双修按约定保留谓词版；合并后 754/754 绿；待用户实机。 2026-10-21 用户验收闭合。 |
| `TASK-0310` | `done` | — | RESEARCH-0032 / GHSA-jfgx（high）：临时扩展缓存迁出共享 `os.tmpdir()` 到 `<agentDir>/tmp/extensions`（0700 创建即生效）已实施；`ensureDirectory` 端口加可选 mode，git-update 测试改用生产路径助手消除真实 tmpdir 污染；定向 103 例 + 完整 check 全绿，impact 红归因存量（见 TASK-0313 汇总）；人工验收不适用，待发布。 2026-10-21 用户验收闭合。 |
| `TASK-0311` | `done` | — | RESEARCH-0032 / GHSA-r95r：`transactional-text-storage` 写入直接带 `mode:0o600`（chmod 兜底保留）、MCP OAuth state 补 `0o600`/目录 `0o700` 已实施；fs 调用合同断言抓创建窗口（终态断言抓不到），POSIX 位断言平台跳过；定向 18 例 + 完整 check 全绿；人工验收不适用，待发布。 2026-10-21 用户验收闭合。 |
| `TASK-0312` | `done` | — | RESEARCH-0032 / GHSA-7v5m：HTML 导出 link/image scheme 白名单（http/https/mailto/tel/ftp + C0 剥离）与 `escapeHtml` 引号转义已实施；测试从资产提取求值纯函数做行为断言；定向 8 例 + 完整 check 全绿；人工验收不适用，待发布。 2026-10-21 用户验收闭合。 |
| `TASK-0313` | `done` | — | RESEARCH-0032 / pi agent 0.75.4+0.84.4：bash spawn `windowsHide`、taskkill System32 绝对路径 + `error` 监听（修未处理 ENOENT 崩溃）已实施；定向 10 例 + 完整 check 全绿；待 Windows 实机人工验收（无黑框闪烁、中止稳定）。 2026-10-21 用户验收闭合。 |
| `TASK-0314` | `done` | — | RESEARCH-0032 / GHSA-mqxh（medium）已实施并入 main（`89827bfb1`，Worker 提交 `a3566d09c`）：域层 `ProjectResourceTrustPort` 三处拦截（resolve/updateSkills/指纹）+ sdk/cli 非交互默认拒绝（trust.json + `OPENFORGE_TRUST_PROJECT=1`）+ desktop 本机首解析弹窗（信任并记住/仅本次/拒绝，按路径记忆；ssh:// 拒绝）；新增 15 例全绿、受影响套件 107 例零回归、完整 check 全绿；待实机对话框目验。 2026-10-21 用户验收闭合。 |
| `TASK-0309` | `done` | PLAN-0018 | P0 安全热修七项已实施并入 main（五原子提交，插件包 711/711 绿，impact 存量红归因 BUG-0107）：zip 越界整包拒绝、安装 `--ignore-scripts`＋导入确认、vite cors:false/fs.strict＋no-cors 探测、iframe sandbox、主窗口 will-navigate、设计写队列+原子写；待用户实机验收（导入确认/画布交互/主窗口/引擎就绪）。 2026-10-21 用户验收闭合。 |
| `TASK-0307` | `verifying` | — | REQ-0016 A1 / RESEARCH-0030：受管工具 `inspect()` 解析记录 + `.version` 标记已实施（已并入 main `ef864b76c`）——resolve 合同不动，纯静态检查，缓存标记免 spawn、存量回退一次探针；定向 24 例、完整 check 全绿；impact 7 红经基线复跑归因存量（PATH 无 rg）。 |
| `TASK-0308` | `verifying` | — | REQ-0016 A2 / RESEARCH-0030：`openforge doctor` 子命令（已并入 main `705fe6857`）+ 诊断包 `managed-tools.json`（`4b2c81e32`，`resolveDesktopCodingToolsDirectory` 单一事实源）已实施；cli-host 11 例、desktop 2 例、完整 check 全绿、integration_status: integrated；待用户实机 doctor/诊断包验收。 |
| `TASK-0306` | `verifying` | — | BUG-0130：模型设置页脚改显运行时真实配置路径（新只读 IPC）；回归 2 例、typecheck 与完整 check 全绿；待用户设置页目验。 |
| `TASK-0267` | `verifying` | PLAN-0014 | RESEARCH-0025：模型拉取参数回填已实施——抽屉化选择 + 参数随勾选写入 + models.dev 目录回填（命名空间剥离）+ 档位拖拽 + 清空模型；数据面与上游 06b834d06 一致、UI 面适配本仓测试连通流；定向 124 例、impact 5073 例、typecheck 与完整 check 全绿；待用户实机验收（设置 → 模型配置 → 从接口拉取）。 |
| `TASK-0304` | `done` | — | BUG-0129：desktop/remote-desktop `electron` 39.8.10→41.10.7（闭合 8 条 high），零源码适配；typecheck 0 错、remote-desktop 7/7、impact desktop 5035 全过（exit 1 归因 BUG-0107 存量红）、check:quick 与完整 check 全绿；经晋升 PR #14 抵达 origin/main 后 Dependabot 重扫转 fixed。用户 dev 冒烟建议保留（Chromium 142→146 未做 UI 走查）。 |
| `TASK-0305` | `done` | — | BUG-0129：vetta-ui-design engine `source-map-js` 1.2.1→1.2.2（lockfile 3 行最小 diff，registry 哈希核对）；check 全绿；#97 经晋升 PR #14 后转 fixed。 |
| `TASK-0303` | `verifying` | — | BUG-0128 归因定案为 DSH（撤销 Codex 推断，证据 `RESEARCH-0028`）并完成仓库根完整性标签全树重置：root-only `(OI)(CI)Medium` 重标 exit 0，根/深层文件实测 Medium、electron dist 显式 Medium 不变；check:quick 与完整 check 通过，无代码改动。 |
| `TASK-0302` | `verifying` | — | BUG-0128 根修：dev 启动前用 `icacls /save /T` 探针识别 Electron dist 的 Low 完整性标签，仅命中 Low 时恢复为 Medium（保留 Chromium 沙箱）；探针/修复失败不阻断，TASK-0301 的 `--no-sandbox` 回退保留兜底；定向 18/18 与真实 `bun run dev` 自愈实测通过，实现 `d8e1b7e45`，待人工验收。 |
| `TASK-0301` | `verifying` | — | dev 启动器 Chromium 沙箱 FATAL 自动回退：识别 code 3 + `GPU process isn't usable` 后追加 `--no-sandbox` 重试一次（保留硬件加速；renderer 同样受 error 18 影响），显式 `VETTA_DESKTOP_DISABLE_GPU=1` 不重试；定向 8/8 绿，`bun run dev` 全链路实测 GPU+renderer 存活且页面 DOM 正常，待人工验收。 |
| `TASK-0300` | `done` | — | 本机 GPU 逃生开关（VETTA_DESKTOP_DISABLE_GPU=1 → --disable-gpu --no-sandbox）；用户终端验证通过（dev 实例成功启动并完成全部 BUG-0127 实测）。 |
| `TASK-0299` | `done` | PLAN-0002 | BUG-0127 路线 5 回归防线（随 BUG-0127 闭合）；2 例 + 行为 52 例 + 完整 check 全绿。 |
| `TASK-0298` | `done` | PLAN-0002 | BUG-0127 验收配套 eventLoop 指标（随 BUG-0127 闭合，实测数据已采集）；33 例 + 完整 check 全绿。 |
| `TASK-0297` | `done` | PLAN-0010 | renderer 构建 emptyOutDir（随 BUG-0127 实测闭环）；完整 check 全绿。 |
| `TASK-0296` | `done` | PLAN-0010 | ISSUE-0021 B-1 主窗口语言拆分（启动 −263 kB，随 BUG-0127 实测闭环）；完整 check 全绿。 |
| `TASK-0295` | `done` | PLAN-0010 | ISSUE-0021 B-0 主进程 catalog 收窄（随 BUG-0127 实测闭环）；bundle −206 kB；完整 check 全绿。 |
| `TASK-0294` | `done` | PLAN-0002 | BUG-0127 路线 6 帧缓存（随 BUG-0127 闭合）；243 例 + 完整 check 全绿。 |
| `TASK-0293` | `done` | PLAN-0002 | BUG-0127 路线 5 聚合守卫（随 BUG-0127 闭合）；157 例 + 完整 check 全绿。 |
| `TASK-0292` | `done` | PLAN-0002 | BUG-0127 路线 5 持久基座（随 BUG-0127 闭合）。 |
| `TASK-0291` | `done` | PLAN-0002 | BUG-0127 路线 5 投影索引化（随 BUG-0127 闭合）。 |
| `TASK-0290` | `done` | PLAN-0002 | BUG-0127 路线 6 发布合并（随 BUG-0127 闭合）。 |
| `TASK-0289` | `done` | PLAN-0002 | BUG-0127 路线 3 命令索引化（随 BUG-0127 闭合）。 |
| `TASK-0288` | `done` | PLAN-0002 | BUG-0127 修复路线 4：团队 `persist()` 指纹缓存——记住最后追加状态条目的协调文档 revision + 序列化串，热路径单次序列化比较并跳过 O(entries) 扫描，revision 变化回退精确双序列化；`remove`/`removeCached` 丢指纹；定向 5/5（红基线先行）、agent-teams 目录 235 例 + cwd 复跑 21 例、完整 check 全绿；serial，main 串行。 |
| `TASK-0283` | `done` | PLAN-0002 | BUG-0127（P0）修复路线 1：`readDocument()` 接入 `ConversationWriteCache`（字节大小失效，命中免全量 JSONL 重读），覆盖 trace ≈50% 采样热点并让每命令协调器读自动降本；回归覆盖命中免读、外部写失效、缓存热损坏仍报 CORRUPT、v1 不缓存；serial，main 串行。 |
| `TASK-0284` | `verifying` | — | BUG-0115（P1）：团队收尾重配对 runtime 未加载的成员会话幂等化——dispose 分支对 SESSION_NOT_FOUND 按「无可清理」继续并落结构化日志，保留与 `Team member runtime not found` 的错误区分；旧实现红回归 + team 套件零回归；serial，main 串行。 |
| `TASK-0285` | `verifying` | — | BUG-0116（P1）：团队会话 send 路径对 runtime 损坏态自愈（按 coordination 文档重载成员 runtime 后重试一次）或归一含恢复指引的可读错误；结构化日志记录 attempted/recovered/failed；serial，main 串行。 |
| `TASK-0286` | `verifying` | — | BUG-0117（P2）：team 链 IPC 错误接入 `describeError` 翻译层——主进程 logger 落盘点改结构化 code/message，渲染端 team 连接器消费 rejection 同层翻译，全链消灭 `[object Object]`；serial，main 串行。 |
| `TASK-0287` | `verifying` | — | BUG-0126（P3）：session-interrupt 健康判据识别「主控等子代理」——判据增加活动子代理信号，该态 idle 超阈不再判 suspected；真中断判定不变；serial，main 串行。 |
| `TASK-0282` | `verifying` | — | BUG-0125：远端资源读取观测（零行为变更，只加测点）——资源访问端口统计远端操作数与累计耗时（暴露只读 `readRemoteStats()`），`reload()` 边界落结构化记录；新增 2 例通过、两包构建与 desktop typecheck 通过、impact 5006 例通过（4 个 BUG-0107 存量红 + 1 例并行假红，单独复跑全绿）、完整 check 全绿；`initial-system-prompt` 落点待后续切片；serial，main 串行。 |
| `TASK-0281` | `verifying` | — | BUG-0124：插件 Hook 派发双侧取证（零行为变更，只加测点）——主进程 `hook dispatch`（身份 + lease 诊断 + 渲染端可用性，新增只读 `readState()` / `readHookLeaseDiagnostics()`）、渲染端 `hook handler miss`（表规模 + 已知键），回复载荷不变；包内 2 文件 4 例、impact 459 例、typecheck 与完整 check 全绿；自愈与重载复位待证据后再切片；serial，main 串行。 |
| `TASK-0280` | `verifying` | — | BUG-0123：重复渲染 key 的结构化诊断（零行为变更，只加测点）——`findDuplicateConversationKeys` 纯函数 + 列表接缝输出键/次数/身份/下标；包内 2 文件 22 例、impact 137 例、typecheck 与完整 check 全绿；去重逻辑待现场诊断后再切片；serial，main 串行。 |
| `TASK-0279` | `verifying` | — | BUG-0122：续跑条忙碌期间不可点——在途点击锁（ref 同步守卫 + 按钮 disabled）、`resume-failure` 分类到忙碌/需恢复专属文案、`resolveInterruptedErrorKind` 增 `hasPendingQueue` 依据队列镜像门控；包内 4 文件 35 例、impact 101 例、完整 check 全绿；serial，main 串行。 |
| `TASK-0273` | `verifying` | — | eform-craft 三版块团队化（REQ-0015 二期）：单 agent 扩为 eform/esign/eaudit 三成员团队（team eform-studio，eform 队长），产物四件套扩六件套（+index.html 列表页 +form.html 表单页，数据级增删查改与 draft→saved→approved 生命周期）、电子签组件（演示验证→canvas 手写→清空重签→审核锁定）、审计组件（auditEnabled 默认 false、五类操作日志、仅查看不可删）；锚点+capabilities 共享契约、合同测试 13/13、五步验证链与完整 check 全绿；团队行为面待实机验收（另立任务）。原编号 TASK-0223/0225，因 dev 侧占号顺延。 |
| `TASK-0272` | `verifying` | — | eform-craft 电子表单还原预置插件（REQ-0014 一期）：纯提示词资产 preset（单 agent + 单技能，权限仅 `agent.skills.control`），识别合同（标记→类型、同义词→固定字段名含空格）+ 四件套产物规范（schema/preview/mock/spec）+ 确认门与修改循环；tenants.json 双 profile 注册、vettapkg 产出并 staging、五步验证链与完整 check 全绿；@eform 行为面待实机验收（另立任务）。原编号 TASK-0222/0226，因 dev 侧占号顺延。 |
| `TASK-0271` | `verifying` | — | allstar-coding 黑盒自测通道失效降级（v0.5.3，包版本 0.3.3）：工具报错≠产品失败（记空不记 ✗、不进 P#）、同工具连续 3 次报错熔断、L3 审批被拒视同失效、核验简报首先点名未自测区间；包内 133 项零回归、完整 check 全绿；技能合同面待实机验收。原编号 TASK-0221，因 dev 侧占号顺延。 |
| `TASK-0263` | `verifying` | PLAN-0014 | RESEARCH-0025：网关流内 `response.failed` 瞬时 code 挂 `retryable: true` 进入自动重试（同步上游 0.5.62）；红 21→绿 67、impact 242 例；提交 `51c939ac1` 已推 dev；fixture 合同面，人工验收不适用。 |
| `TASK-0264` | `verifying` | PLAN-0014 | RESEARCH-0025：流式写完后末尾短语 300ms 静默即恢复全亮（同步上游 22293f956）；红 3→绿 12、impact theme-ui 36 + desktop 12；提交 `b5fdde595` 已推 dev；视觉行为待实机目验。 |
| `TASK-0265` | `verifying` | PLAN-0014 | RESEARCH-0025：插件模型图像输入能力保留——证实同病（写合同缺 `input`）并按上游形状修复：SDK 写入合同、plugin-sdk 类型、读回归一化 + 4 合同测试；提交 `944433ca1` 已推 dev；impact 桌面 5 红归因 BUG-0107 存量与在途测试，相关面全绿。 |
| `TASK-0266` | `verifying` | PLAN-0014 | RESEARCH-0025：Responses/Codex 传输方式设置（SSE/WS/自动 + 安全回退 + 连接复用 + 组合层动态注入 + 桌面设置节）；分支四提交已合并 main（`8c1342e01`/`8dde6d60f`/`f61ca6c52`/`91e1be471`），适配器 72、组合 4、设置面 100+8 例全绿；真实网关回合未授权，以 FakeWebSocket fixture 为准。 |
| `TASK-0268` | `ready` | PLAN-0014 | RESEARCH-0025：自动压缩改为回复内步骤（上游 0.5.64）；defer——`turn-pipeline.ts` 为 TASK-0262 在途改动，depends_on TASK-0262/0264，conflicts 0260–0262。 |
| `TASK-0269` | `ready` | PLAN-0014 | RESEARCH-0025：重进运行中会话排队消息显示——先对照本仓分叉架构证伪/证实（上游 61072cbb3）；defer——conversation 文件为 TASK-0260/0261 在途改动。 |
| `TASK-0260` | `verifying` | — | BUG-0108：删除优先收口——STOP 标记 best-effort、`disposeSession` 增 `releaseOnDisposeFailure`（仅删除路径启用，评审修正 #2）、AggregateError 带扩展 id；定向全绿，诊断出口缺口（评审 #6）登记待切片；serial，main 串行。 |
| `TASK-0261` | `verifying` | — | BUG-0109：续跑条拆开 `sessionPath`（门控）与 `runtimeSessionId`（宿主调用）并补身份守卫（评审修正 #3）；Virtuoso mock 补 Footer 插槽修复夹具；desktop 包内 12 例全绿；拒绝原因透传缺口（评审 #9）登记待切片；serial，main 串行。 |
| `TASK-0262` | `verifying` | — | BUG-0110：压缩提交/会话续接/终态追加统一入 `serializeAppend` 串行链（评审修正 #1/#4/#5：终态不再绕锁、临界区不再跨观察者通知、续接回写版本），乐观提交+类型化冲突重试一次；runtime-core 7 文件 96 例全绿；serial，main 串行。 |
| `TASK-0259` | `verifying` | — | BUG-0106：品牌档位相关测试断言改引用品牌事实源（`DESKTOP_BRAND.displayName`），默认档与 self 档各 4/4 通过；serial，main 串行。 |
| `TASK-0249` | `in_progress` | — | REQ-0013：agent 身份行与 CLI 指引按品牌档位渲染——`BuildSystemPromptOptions` / `SystemPromptSourceDependencies` 增 `productName`，Desktop 注入 `resolveDesktopBrandName`，指引命令名与实际安装的 `openforge` 对齐；回归断言装配后提示词无 Vetta / Vetta Desktop；serial，main 串行。 |
| `TASK-0250` | `verifying` | — | REQ-0013：runtime-node 用户可见报错与 PDF/OCR 工具描述去遗留品牌名（保留 `VETTA_DESKTOP_EXE` 等冻结标识）；包内 84 文件 / 529 例通过；serial，main 串行。 |
| `TASK-0251` | `verifying` | — | REQ-0013：系统插件文案随宿主品牌（宿主侧 i18n 出口归一 + 备注面板硬编码走 key + vetta-actions 用法说明中性化 + 媒体/provider 与保存对话框标签）；vetta-actions 8/8、vetta-ui-design 106 文件/688 例、content-creation 通过；导出 mockup 水印按决策留作已知遗留；serial，main 串行。 |
| `TASK-0252` | `verifying` | — | REQ-0013：Desktop i18n 组合词归一（「Vetta Desktop」不再拆成「小爱ai Desktop」、句末 `Vetta.` 也归一）+ locale×档位×语言渲染门禁（首轮即抓出句末漏项）；品牌层 4 文件 / 26 例通过；depends_on TASK-0249，serial，main 串行。 |
| `TASK-0247` | `done` | — | 产品线版本统一（lockstep 0.1.3）：32 个产品面 manifest 归入 0.1.3、根清单名 `open-vetta`→`open-forge`；版本线门禁新增「统一线须与 Desktop 同版本」判负，`release:desktop:*` 发版同步改写全部统一线 manifest（白名单/必改清单/git add 三处接线），发版不再把门禁跑红；serial，main 串行。 |
| `TASK-0248` | `verifying` | — | BUG-0102：dev:electron 启动前校验 Electron 二进制（path.txt + dist 可执行文件 + dist/version），缺失时复用包内 install.js 自愈、失败给可操作指引；serial，main 串行。 |
| `TASK-0246` | `done` | — | 清除上游版本线残留：docs-site/runtime-knowledge 0.55.3→0.0.1，CI/模板示例版本改 0.1.x；新增 version-lines 门禁（0.5.x/0.55.x 判负）挂 check:guards，红路实测 exit 1；定向 30/30、check 与 test:quality 516/516 全绿；纯内部治理。 |
| `TASK-0245` | `done` | — | 根清单版本归入 0.1.x 商用版本线：0.55.3→0.1.3，release:desktop:* 发版同步改写根清单（白名单/git add/断言三处接线），release-notes --check 新增根↔Desktop 一致性判负；定向 41/41、完整 check 全绿；纯内部治理。 |
| `TASK-0244` | `done` | — | knip 报告可信化（coding-agent entry 死路径重写为 exports 对应源文件、ai 补 scripts 面、删两条失效豁免、补 mobile 条目）+ 删 17 个全仓零引用依赖（canvas 为误报保留）；unused deps 两节清零、hints 15→2、完整 check 全绿；纯内部治理。 |
| `TASK-0242` | `done` | — | 声明头门禁在 main 恒红修复：21 个已入库文件按 A/M 分类补 fork 声明头（16 `Modified` + 5 `Copyright`），基线快照收缩 1 条已修复项；门禁 `new=0`、完整 `bun run check` exit 0；纯内部治理，无用户可见变化。 |
| `TASK-0243` | `done` | — | 清理失效脚本 `scripts/session-transcripts.ts`（引用已退役的 `core/session-manager`，全库无引用方）与根目录两个 0 字节残留日志；纯内部治理。 |
| `TASK-0241` | `verifying` | — | BUG-0101：TeamMemberRoster 测量循环收敛修复（等价保持引用 + measurementKey 稳定依赖）+3 回归与整树稳定性测试；实机崩溃复现→修复→不复现闭环，待人工验收。 |
| `TASK-0240` | `verifying` | — | REQ-0012：SSH 远程项目文件传输——`ssh-transport` 流式 exec 通道原语（drain 写 + wc 校验原子上传 + 流式下载）、Desktop 队列服务与 `vetta:ssh-transfers:*` IPC、文件栏菜单/拖拽/进度面板；serial，main 串行。 |
| `TASK-0235` | `verifying` | — | BUG-0100：会话文件锁协议强化——指数退避预算 1s→≈5.7s、持有期心跳防 stale 抢删、超时带持有者 pid；serial，main 串行。 |
| `TASK-0236` | `verifying` | — | BUG-0092：诊断日志统一 describeError——三处站点（agent-teams IPC/interrupt monitor/browser runtime）不再 [object Object] 或裸 errorName；serial，main 串行。 |
| `TASK-0237` | `verifying` | — | BUG-0088：allstar-coding 补 fs.read/fs.write 权限声明——fence-log 追加与 state.md 兜底恢复可用；serial，main 串行。 |
| `TASK-0238` | `verifying` | — | BUG-0089：Windows CLI shim 目标占用降级——内容等价静默跳过、真差异有界重试后 warn 降级；serial，main 串行。 |
| `TASK-0239` | `verifying` | — | BUG-0090：updater 检查错误分类——app-update.yml 缺失与 feed 404 降为 configurationUnavailable 结论态、一次性 info；serial，main 串行。 |
| `TASK-0232` | `verifying` | — | BUG-0097：assertCapability 区分「无路由认领」与「能力被拒」两类错误文本，delete/rename 同构；serial，main 串行。 |
| `TASK-0233` | `verifying` | — | BUG-0098：代理设置文本提交加有效性门——下一个草稿非法则防抖不落盘，disabled 照常、合法中间态不受阻；serial，main 串行。 |
| `TASK-0234` | `verifying` | — | BUG-0099：内置浏览器导航 API 迁 `navigationHistory`——BrowserViewContents 契约改子对象，四调用点与 fake 同步；serial，main 串行。 |
| `TASK-0230` | `verifying` | — | BUG-0095：transformMessages 二遍循环后尾刷悬挂 tool_calls——冲刷收敛为统一 helper，离开 transform 的消息流不再出现无结果调用；serial，main 串行。 |
| `TASK-0231` | `verifying` | — | BUG-0096：requestContinuation 瞬态拒绝（cancel 清 pending / cancelling / recovery_required）把记录转入 nextTurnContext——不唤起隐形 Turn、记录随下一次 send 送达；closed 保持死信；serial，main 串行。 |
| `TASK-0228` | `verifying` | — | BUG-0093：team 成员 runtime 恢复按成员隔离失败——成功保留、失败留旧条目、自身半成品 dispose，单成员锁竞争不再掀翻整会话加载；serial，main 串行。 |
| `TASK-0229` | `verifying` | — | BUG-0094：内置浏览器 detached view 上限 3 + LRU 驱逐（对齐 TASK-0039 pinned 同型），渲染进程不再随工作区数线性累积；serial，main 串行。 |
| `TASK-0225` | `verifying` | — | BUG-0086：内置浏览器拖拽穿透改由穿透期 `setVisible(false)` 让位（Electron 39 无 per-view ignore-mouse，窗口级会泄漏点击）；contents 契约删伪 API `setIgnoreMouseEvents`；serial，main 串行。 |
| `TASK-0226` | `verifying` | — | BUG-0087：team 会话 coordination 文档读不出时 `deleteSession` 降级清理——sessionState/legacy 索引兜底枚举 runtime，per-path best-effort 删除 + 索引三件套必达，僵尸会话可自助清除；serial，main 串行。 |
| `TASK-0227` | `verifying` | — | BUG-0091：kernel `recovery_required` 存首因 + 异步 admission 经 `pipeline.resumeSession` 原地恢复（悬挂 activeTurn 仍拒，防双管线并发写）；serial，main 串行。 |
| `TASK-0224` | `verifying` | — | 品牌档案默认口径（REQ-0011）：dev 与打包默认切到 distribution（Allstr ai / 小爱ai），显式 `VETTA_BRAND_PROFILE=self` 保留 Open Forge；4 决策点 + 4 辅助脚本对齐；验收反馈切片补齐 dev 态系统图标（任务栏/托盘/Dock/通知/拖拽，`brand-icon-directory` 按档解析）；定向 18+18 例、打包 node 13/13、main 构建端到端、完整 check 两轮全绿；已推 `origin/dev`（`6a249ff3b` 批次），待重启 dev 后复验系统图标与打包产物人工验收。 |
| `TASK-0223` | `verifying` | — | BUG-0085：停滞专用重试上限（最多 2 个看门狗窗口后落终态），消掉死连接的 ~30 分钟假死；红 4→2 次 attempt，ai 包 516 例 / impact 321 例 / check 全绿；已随 `9beebe1e0` 推 `origin/dev`，Worktree 已清理。 |
| `TASK-0222` | `verifying` | — | BUG-0084：受控投影规范判等修复抢键盘 + 覆盖扩展（目录/图片/skill/scene/connector/member、流式重渲染、外部移除、mention 元数据）；定向 68、impact 10、完整 check 全绿；serial，main 工作区串行集成。 |
| `TASK-0221` | `verifying` | — | BUG-0083：移除第一方 `flushSync`（侧栏选择意图）并按 BUG-0048 先例精确过滤 React DEV 噪音；定向 53、impact 271、完整 check 全绿；serial，main 工作区串行集成。 |
| `TASK-0220` | `verifying` | — | 修复 BUG-0082（含残余轮）：黑盒 shell 白名单加引号感知元字符扫描（引号外组合/替换/重定向拦、双引号内 $() 与反引号同样拦、单引号保持字面量、转义引号不开区、未闭合 fail-safe）、读域拒 `..` 与绝对路径；两轮红测先行（3+2 failed）转绿，fence-judge 80 项/包内 133 项/impact 91 项/完整 check 全绿；写域 `..` 等既有面登记 ISSUE-0032。 |
| `TASK-0219` | `verifying` | — | allstar-coding 黑盒环节升级（v0.5.2，包版本 0.3.2）：通道探测→三态分流→文档 v2→可选自测→用户核验；围栏为 blackbox 角色加窄读域（docs/ac/ 前缀、禁目录发现类）与 shell 白名单（仅 agent-browser）；fence-judge 74 项、包内 53 项、impact 127 项与完整 check 全绿；技能合同面待实机验收。白名单/读域两个绕过口由 TASK-0220 修复。 |
| `TASK-0218` | `verifying` | — | Browser 能力/缺页恢复指引 a326a644b，独立 Task Worktree；定向 63、impact 590、Desktop 25、check 通过；main 有其他任务未提交修改，待串行集成与模型验收。 |
| `TASK-0215` | `done` | — | BUG-0079：按实际工具生成终端能力指引，区分 MCP 检索与内置命令；定向、impact、check 通过，Desktop 全量 4909 通过；CLI 首轮 3 启动超时，整文件复跑 14/14。2026-10-10 按 VERIFY-0017 分档口径闭合：模型案例在授权模型 glm-5.3-flash 真实回合成立——网络诊断三命令实测执行、无「没有终端」误判、部分失败如实解释；MCP 字面子场景受限于 profile 未配 MCP 服务器（环境余量）。 |
| `TASK-0207` | `done` | PLAN-0006 | 修复 BUG-0078：`browser_tab` 的 `elementRef` 同时接受 snapshot 打印的编码串与对象，校验前解码为对象 ref，对外 Schema 也公布两种形式；定向 14 项/impact 119 项/desktop 12 项/check 全绿；2026-10-07 隔离实例 + 真实模型实测 snapshot→原样回传编码串 click→返回 `click ok`、页内按钮文案变更与新增节点可见（VERIFY-0017 组一）。 |
| `TASK-0208` | `done` | — | 集成 origin/chenxvhua 的 allstar-coding v0.4（ac-fence 事中拦截层）。2026-10-09 按 VERIFY-0017 分档口径闭合：合并 `8935058fd` + 记录 `c058ca693` 经 `git branch -r --contains` 确认为 `origin/dev` 祖先（门禁与推送早已完成，原「待门禁与推送」是过期副本）；判定器 98 例全绿、block reason 可读性有测试锚点；真实越权会话需真实模型回合，受 ISSUE-0031 客观阻塞。 |
| `TASK-0209` | `done` | PLAN-0016 | 发布状态可判定：日期只在 publish 写入（已写入当天日期），`release-notes.mjs --check` 断言文件名/标题/manifest 版本一致、无 tag 时必须为「待定」、已发布与 tag 逐字一致；政策入 delivery 规则与 release-notes README；test:quality 497 项与完整 check 全绿（提交 53f674121）。 |
| `TASK-0210` | `done` | PLAN-0016 | 清理上游锁步发版残留：删除根 `version:patch/minor/major/set` 四条未受守卫脚本，补断言禁止其回归；`scripts/sync-versions.js` 因受守卫的 `release.mjs` 仍调用而保留；test:quality 498 项与完整 check 全绿（提交 29e429b21）。 |
| `TASK-0211` | `done` | PLAN-0016 | 发版人工门与仓库设置清单成文：实测 desktop-production 无 protection rules、desktop-test 未创建、rulesets 为空、main 未保护，已把人工门位置与待配项写进 runbook，阶段结论回填 PLAN-0016；完整 check 全绿（提交 ed4c31afb）。 |
| `TASK-0212` | `done` | PLAN-0016 | 发布说明碎片化已交付：每任务写 `fragments/v<版本>/<slug>.md`，`--assemble` 汇编、`--check` 校验一致性；无碎片为纯 no-op（实现中实测到一次清空，已恢复并加回归测试）；test:quality 506 项与完整 check 全绿（提交 a70bba348）。 |
| `TASK-0213` | `done` | PLAN-0016 | 仓库侧发布门禁：`v*` tag 的删除与改写 ruleset 已落地（id 24519581，管理员 bypass，不影响打 tag）；`desktop-test` 已创建；两个环境的 required reviewers 被平台以 422 拒绝（计划不支持），故可用人工门为 tag ruleset 加本地 publish。完整 check 全绿（提交 5fc62a929）。 |
| `TASK-0214` | `done` | — | 台账收口：闭合 7 个内部任务（0179/0180/0209–0213，均无用户可观察行为变化且既定标准已实际执行通过），其余 72 个 verifying 保留交用户验收；并记录两处台账缺口（16 个 verifying 不在焦点表、看似内部但缺证据的候选未闭合）。 |
| `TASK-0216` | `done` | — | 分层验收（用户决策）：合同面 17 个按工程证据闭合并注明授权依据（提交 272808ea0）；行为面 53 个整理成 VERIFY-0017 交用户验收；0183/0184 因 CI 受预算阻塞单独标注。 |
| `TASK-0217` | `done` | PLAN-0003 | 复核并解除 TASK-0047/0048 的陈旧阻塞：两条实为尚未实施（交付记录全空），已转 ready 并补进焦点表；实测排除冻结标识后仍有 334 行、84 个文件提到旧品牌（提交 1e6e2ab4c）。 |
| `TASK-0270` | `verifying` | PLAN-0003 | f9a9d7895 已集成本地 main：搜索跨语言 ID 已修复；307 定位为本地 IP 绑定条件并修正探针。HTTP 6/6、包内 35/35、质量合同 102/102、build 与根 check 通过；已接入既有 CI，待用户功能接受。 |
| `TASK-0275` | `verifying` | — | RESEARCH-0027：report-canvas 展示母题 `markdown`→`docs`（BUG-0118）+ 内置预设描述 Schema 合同测试；红 2→绿 2、邻接 14、impact 133；`9ab3a6a79` 已并入 main；能力页目验待用户。原编号 TASK-0271，因 dev 侧占号顺延。 |
| `TASK-0276` | `verifying` | — | RESEARCH-0027：终端 owner 监听与订阅按 owner 成组解绑（BUG-0119）；红 5→绿 14、包内 4977、check 全绿；`91b5faadf` 已并入 main 并补发布说明；实机重开/崩溃恢复待用户。原编号 TASK-0272，因 dev 侧占号顺延。 |
| `TASK-0277` | `verifying` | — | RESEARCH-0027：技能列表消费方不再拿远端绝对路径做本机读取（BUG-0120）——工具视图包装只套模型面向装配 + `isSshProjectUri` 跳过；红 2→绿 3（回环 SSH）；`9e2084c31` 已并入 main；远程项目列表目验待用户。原编号 TASK-0273，因 dev 侧占号顺延。 |
| `TASK-0278` | `verifying` | — | RESEARCH-0027：握手失败销毁 Client 前补终止性 error 监听（BUG-0121），FakeClient 忠实化；基线红 2+3 逃逸→绿 27、连跑 8 次、包内 227、check exit 0；`ae3cda04d` 已并入 main；真实新主机连接待用户自测。原编号 TASK-0274，因 dev 侧占号顺延。 |
| `TASK-0047` | `verifying` | PLAN-0003 | 第八片：中英根入口与文档导航重写，继承宣传/社区入口清理，旧草案与 15 份素材独立归档；35 项站点测试、10 项 impact、113 页构建、6 项 HTTP、299 个引用和完整 check 通过；main 串行本地提交，待用户审阅。 |
| `TASK-0048` | `in_progress` | PLAN-0003 | 公开文档站品牌、正文与 SEO/LLM 发现入口迁移；尚未实施，缺口最大（docs-site 内容为主）。 |
| `TASK-0206` | `done` | PLAN-0014 | feed/attach 第二片：`SessionFacade.attach` 一次同步步骤内订阅 + 运行中回合重放 + 历史快照（`SessionAttachment`），保留本仓 4096 有界回放，不引入上游无界回合缓冲；红绿/定向 10/10/impact 115 项/完整 check 全绿；无直接 UI，消费端随 IPC/desktop 后续片验收。 |
| `TASK-0205` | `done` | PLAN-0014 | feed/attach 底座第一片：快照暴露运行中回合身份（currentTurnId）+ 重放缓冲收录本轮工具事件（保留 4096 有界）；红绿/impact/完整 check 绿；工具状态切回即时可见待实机验收，currentTurnId 消费随 IPC/desktop 后续片。 |
| `TASK-0204` | `done` | PLAN-0014 | 会话事件合同清退死类型（message.final/toolcall.args，查证无生产者）+ 生产者登记表（23 类型 satisfies 穷尽）+ 墓碑守卫入 check:guards；定向/impact/完整 check 全绿，行为零变化；内部治理按完成标准收口。 |
| `TASK-0203` | `done` | — | 同步 cli-host 四个文件的精确工具清单断言到 TASK-0156 目标特性契约（get_goal/create_goal/update_goal 无条件贡献）；定向/完整 cli-host（230 项）/Desktop（4906 项）/impact/完整 check 全绿，零遮蔽；内部修复按完成标准收口（提交 76109c3ed）。 |
| `TASK-0202` | `done` | — | 台账修复：已按 frontmatter 补回 03ce0c378 丢失的八行；check-project-indexes 与完整 check 通过；内部台账修复按完成标准收口。 |
| `TASK-0201` | `done` | — | 修复 BUG-0077：git preset 显式声明 Vitest+jsdom+RTL 测试栈；标准检出包级 62 例全绿（提交 235b33456）；内部修复按完成标准收口。 |
| `TASK-0197` | `in_progress` | PLAN-0015 | Harness 能力吸收批次：有界工具并发（0198）已推 dev（a163b58b1）并合入本地 main（105dca3f2）；停止点复验完成——CLI 启动类失败归因负载（五文件 39/39 转绿）且 Desktop 完整范围 4906 项通过；剩余收口项为慢消费者重同步；WAIVER-0004 至 2026-10-10 到期，阶段 4（慢消费者重同步）未开工且缺前置压力/保真基线，批次暂不能标 done。 |
| `TASK-0198` | `done` | PLAN-0015 | 有界工具并发与独占屏障；实现 e6e05f5a3 已推 dev（a163b58b1）并合入 main（105dca3f2）；跨包 CLI 失败挂 WAIVER-0004（至 2026-10-10），待人工验收。 |
| `TASK-0195` | `blocked` | PLAN-0015 | 保留兼容模型请求前缀的摘要生成；实跑反证前缀假设与既有防注入摘要边界冲突（非产品 Bug），blocked 待重新设计或用户决策。 |
| `TASK-0196` | `done` | PLAN-0014 | 存量 Draft 批次（15 项）已全部逐项验证并推 origin/dev（0356daf39），批末合入本地 main（adeaa5294）；待人工验收。 |
| `TASK-0200` | `done` | PLAN-0014 | 0157/0158 交付审计完成（网络/沙箱/权限面逐字对照上游全数 retain）；两项收尾已实施（af7a9f5a9 重挂修复、501a935da 隔离 e2e 补跑、25467b0d2）并推 origin/dev；2026-10-07 冷启动 null→就绪实测列表容器未卸载重挂、无抖动（VERIFY-0017 组一）。 |
| `TASK-0039` | `done` | PLAN-0002 | webview 剩余口子收口：插件 pinned 页签改为有界 LRU（非活动上限 3、驱逐可逆、不占用 warm 预算）；面板收起卸载核实为已有等价实现（retain + 回归验证）；已推 origin/dev（2de27ed59）。2026-10-08 隔离 Debug 实例上用夹具插件（4 个 pinned 页签 + 随包 content-creation = 5 候选）实测闭合：非活动驻留硬上限 3、被逐出页签以新实例透明重建而驻留者保持实例、逐出跟随激活顺序、收起后面板表面全卸载且 residency 记录保留（重开恢复同一批）。 |
| `TASK-0159` | `done` | PLAN-0014 | Windows 沙盒制品完整性：受控清单钉死、缺失/不一致默认阻断打包（仅显式降级变量放行）。2026-10-10 按 VERIFY-0017 分档口径闭合：阻断路径三证成立（判定结构 block + 抛错分支 + CLI exit=1，test:packaging 125/125）；通过路径无对象（受控 exe 尚未产出，发版时刻形态）；三选一发版政策项显式移交用户。已推 origin/dev（1c1a50b9e）。 |
| `TASK-0042` | `verifying` | PLAN-0002 | suspend/lock-screen 一次性 working-set trim + 前后峰谷观测已落地（7 例定向+impact 绿）；随 TASK-0196 批次推 dev（ca6c9df9d）合入 main；实机峰谷差待用户验收——2026-10-08 用户选择自行实测（不由 Agent 触发真实电源事件），步骤与日志字段清单（`power working-set trim` 的 `reason/trimmed/beforeKb/afterKb/deltaKb`、`power event observed` 的 `workingSetKb`，落点 `<vettaHome>/desktop-app/logs/`）已写入 Task，待回贴读数。 |
| `TASK-0199` | `done` | PLAN-0014 | 会话目录回归隔离初始化；保持原超时与所有断言，TASK-0187 批次交付，已随本轮合入 main。 |
| `TASK-0151` | `done` | PLAN-0014 | 配置读改写统一串行事务并随 TASK-0187 批次合入 main；8 文件/52 定向测试通过；2026-10-07 真实 UI 并发 4 写两轮、2026-10-08 快捷键页同 tick 双字段写（`shortcuts`+`quickPanel`）与 2.8 ms 内 5 连发均无丢失更新与跨字段覆盖；`projects`/`archivedProjects` 经枚举确认渲染端无 `config.set` 写者、其全部写者（ProjectService.commit、batch-task-storage）都走 `updateDesktopConfig` 事务队列，整快照入口生产无调用者 ⇒ 验收子条件全部有客观观测，按「全程自动」授权闭合（VERIFY-0017 组一续测十六）。 |
| `TASK-0187` | `done` | PLAN-0014 | 稳定性首批（0188–0193/0151/0199）已合入本地 main（03ce0c378）并推 origin/dev（e242e5ddf）；changed 的 CLI 失败经合并前后基线比对归属存量环境问题（BUG-0059 面），待人工验收。 |
| `TASK-0188` | `done` | PLAN-0014 | 流式回复用量引用稳定性；TASK-0187 批次交付，已随本轮合入 main；2026-10-07 真实 UI 三态（空闲/流式中/结束后）读取历史回复用量逐字符一致（VERIFY-0017 组一）。 |
| `TASK-0189` | `done` | PLAN-0014 | 工具调用期间回复保持进行中；TASK-0187 批次交付并合入 main；2026-10-06 真实模型回合 UI 实证（VERIFY-0017 组一）。 |
| `TASK-0190` | `done` | PLAN-0014 | 恢复成功的回合清除错误终态；TASK-0187 批次交付，已随本轮合入 main。2026-10-08 VERIFY-0017 组一收口：用户接受「生产不可达的防御分支由单测覆盖」为验收口径——用户可见面已实测（恢复回合不残留错误横幅、最终失败保留正确原因），该分支由 running-changed-reason.test.ts 真实事件序列覆盖，且不可达有构造性证据（`AgentLoopConfig` 唯一构造点为显式字面量无注入面、承载类 `Agent` 生产源码零实例化、生产走 runAgentTurn 且 checkpoint 为宿主回调）。 |
| `TASK-0191` | `done` | PLAN-0014 | 滚动记忆只保存用户停留位置；TASK-0187 批次交付，已随本轮合入 main；2026-10-08 三条子句实测（VERIFY-0017 组一续测十七）：跟随未到底时离开再返回落在尾部并继续跟随（`st=3/max=22` → `st=234/max=234` → `298/298`）、主动浏览 `st=59` 离开再返回恢复 59 且 6 秒稳定；「切换会话再回来」不恢复（`59 → 659`）属读侧既有声明语义（缓存只喂 Virtuoso 初始化输入），不由本切片引入，若期望恢复需另立条目。 |
| `TASK-0192` | `done` | PLAN-0014 | 开发主进程缓存覆盖实际打包输入；TASK-0187 批次交付，已随本轮合入 main；2026-10-07 真实跑 build-dev-processes CLI：基线 0/4，改已打包包 `runtime-storage/dist` 后恰好只重建 main（1/4），改未打包包 `runtime-core/dist` 后仍 0/4，产物 md5 还原（VERIFY-0017 组一）。 |
| `TASK-0193` | `done` | PLAN-0014 | Git 历史特殊路径与重命名正确性；TASK-0187 批次交付，已随本轮合入 main；2026-10-07 用特殊字符/glob 同名邻居/三类重命名的真实仓库夹具在 Git 面板实测，字面路径、前后路径、不按模式误匹配均成立（VERIFY-0017 组一）。 |
| `TASK-0185` | `done` | — | 队列消费用户消息被渲染到回复末尾（BUG-0068/BUG-0021 变体）已修：五处尾部落位改因果锚定；定向 96/全域 956/impact 493/check 全绿；2026-10-07 真实 UI 重开会话后排队用户原文保留在正确因果位（VERIFY-0017 组一）。 |
| `TASK-0186` | `done` | — | Office 按格式加载与 PDF URL 生命周期已验证并合入本地 main（559a8d79d）；2026-10-07 隔离实例冷启动实测：未预览时解析器请求 0 条，xlsx 只加载表格路、pdf 只加载 PDF 路，PDF worker Blob URL 随预览挂载 create/随卸载 revoke（VERIFY-0017 组一）。任务「不做」项已声明不以构建字节数推算 RAM 节省，故未做 RAM 对照。 |
| `TASK-0181` | `done` | — | 本机字体偏好已实现并合入本地 main（75c5ae2df）；定向 30 项、Desktop 全包 4680 项及完整 check 通过；2026-10-07/08 实测（VERIFY-0017 组一）：固定 origin 后 dev 重启偏好保留并启动即重新应用；切明暗/配色不覆盖用户字体，重置恢复默认栈；终端字形响应以 canvas 几何量实测成立（默认 1044×210 ↔ Courier New 1043×208 ↔ 复位 1044×210）；「实例/PTY/输出保留」UI 不可达（进设置即卸载终端），只有宿主测试覆盖；2026-10-08 补证：dev 重启后 origin 级 localStorage 整体失效，向导与产品引导随之重放（丢失面比字体更宽）。2026-10-08 收口：GWT 4/5 在真实 UI 逐子句实测（五种失败态各自给出确切提示、并发去重、卸载放弃、订阅释放判别性对照、隐藏期改输入后重新 fit）；用户接受 PTY 尺寸同步以宿主测试（TerminalSurface.host.test.tsx:167）为准、打包形态观感留发布前抽检，据此闭合。 |
| `TASK-0180` | `done` | — | desktop-packaged 合同 job 补安装+Bun 装配（BUG-0064）；CI 合同 job 已绿（37059120967）。 |
| `TASK-0184` | `verifying` | — | docs-site 构建 Turbopack 报错修复（BUG-0067）；已分型：fumadocs stringifier 丢 attention/peek 致 RangeError（内容含 `**`/`*` 即触发）+ 4 处 HTML 注释在 MDX 非法；本机可复现，待实施；CI 复跑受 ISSUE-0029 阻。 |
| `TASK-0183` | `verifying` | — | packaged E2E CI 连续红修复（BUG-0066）；已分型：`verify:staged-deps --staging` 三平台并集误报本平台 prebuild，E2E 未跑到；待实施；CI 复跑受 ISSUE-0029 阻。 |
| `TASK-0182` | `done` | — | macOS worktree 用例路径比较已修（BUG-0065：/var 符号链接）；CI 复跑待证。 |
| `TASK-0179` | `done` | — | desktop tsc 堆上限经包内脚本提升（BUG-0063）；CI check job 已复跑绿（37059120973）。 |
| `TASK-0178` | `done` | PLAN-0014 | P1 安全：撤销主机密钥必须拒绝；已实施提交 8b63e0d02。2026-10-09 按 VERIFY-0017 分档口径闭合：声明命令 5 文件 77 例全绿（`@revoked` 无条件拒绝与宿主拒绝均有直接断言），真实主机实测属合同第 61 行**明令禁止项**（不得访问真实主机）故无验收对象。 |
| `TASK-0175` | `done` | PLAN-0014 | 原子写入完整字节与失败清理合同；已实施提交 521a1eac9，toolkit 35/35 与批次门禁全绿，待人工验收。 |
| `TASK-0173` | `done` | PLAN-0014 | RPC 超时分阶段诊断已落地（VERIFY-0015 六轮对照未复现，BUG-0059 保持 investigating）；待人工验收。 |
| `TASK-0174` | `done` | PLAN-0014 | ssh-transport 标准测试入口 + 选择器防回退断言已落地；入口/quality/impact 实测绿，三平台 CI 证据待推送后产生。 |
| `TASK-0176` | `done` | — | 三组串行基线与瓶颈证据已交付（VERIFY-0016：desktop 装配型、cli 进程型）；全部候选否决、默认策略不变——分析型任务按完成标准收口。 |
| `TASK-0177` | `done` | PLAN-0014 | SSH README 平台能力/安全边界按现行实现对齐（含 TASK-0174 落地后的真实测试入口）；纯文档任务按完成标准收口。 |
| `TASK-0172` | `done` | PLAN-0014 | 集成后审查：新建 0173～0178 六项、细化 0168/0169、登记三个隔离复现 Bug；只完成规划。 |
| `TASK-0171` | `done` | PLAN-0014 | 主树全部已有改动与七个 Task 分支已提交/集成并推送 origin/dev；最终 41 包、483 质量测试与完整 check 通过，原 Worktree 保留。 |
| `TASK-0170` | `done` | PLAN-0014 | 来源 769f31bc3 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0163` | `done` | PLAN-0014 | 模态过滤往返已在真实应用实测（纯文本模型一轮出站请求零图片 + 一条省略提示，切回图像模型答出图上的字）；工具结果图片分支由 `packages/ai` 单测覆盖。 |
| `TASK-0162` | `done` | PLAN-0014 | 知识加工提示词来源装配（真实工厂+假 Provider）测试级成立：装配守卫漏传必红、兼容可选字段（`knowledge-processing-session.ts:31/:67`）与生产显式注入（`processing-session-factory.ts:34`）均源码可指认；合同明令不访问真实 Provider，模型效果另属评估层。2026-10-09 按 VERIFY-0017 分档口径闭合。 |
| `TASK-0150` | `done` | PLAN-0014 | 来源 222de8813 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0149` | `done` | PLAN-0014 | Anthropic 兼容网关思考块校验：fixture SSE 七类合同层绿（provider-conformance 18+243、AI 全包 488）。2026-10-10 按 VERIFY-0017 分档口径闭合：「经兼容网关」行验收对象在环境中不存在（配置端点均 openai-responses，无 Anthropic 协议端点；先例同 0168 需 CI 环境）；旁证 glm 会话思考块签名链路健康。 |
| `TASK-0148` | `done` | PLAN-0014 | 来源 1020b7c59 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0165` | `verifying` | — | 主树实现已提交 925868a08；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0164` | `done` | PLAN-0004 | 主树实现已提交 a739e62b2；工程复验通过，人工功能验收待完成，批次推送见 TASK-0171。 |
| `TASK-0146` | `done` | — | 修复 plugin-vite 首次导入未收敛便关闭的挂起，保留原超时与断言。 |
| `TASK-0145` | `done` | — | 补齐 plugin-vite 的 React 测试依赖，验证当前批次后推 origin/dev。 |
| `TASK-0143` | `done` | PLAN-0004 | Claude 入口去重，保留专属提交约束并设置体积门禁。 |
| `TASK-0144` | `done` | PLAN-0004 | 113 个术语按领域分册，保留根索引与旧标题锚点。 |
| `TASK-0142` | `done` | PLAN-0004 | 根目录保守清理：废弃脚本、重复 banner、空目录与工作区品牌。 |
| `TASK-0140` | `done` | PLAN-0004 | 根规则拆分，硬边界前置与 8 KiB 常驻预算。 |
| `TASK-0141` | `done` | PLAN-0004 | 移除 Devin 镜像及同步路径，保留单一权威入口。 |
| `TASK-0139` | `done` | PLAN-0004 | 审核修复：交付判据、发布说明、规则去重与集成状态。 |
| `TASK-0138` | `done` | PLAN-0004 | 审核修复：Windows 链接占位、引用与 frontmatter 扫描覆盖。 |
| `TASK-0137` | `done` | PLAN-0004 | 开发 Skills 更名与描述统一为 Open Forge，迁移引用并验证。 |
| `TASK-0136` | `done` | PLAN-0004 | 统一开发入口与双层验收已实现；449 例及完整 check 通过。2026-10-09 用户把 2026-10-01 的「有条件通过」升级为验收闭合：条件承载方 TASK-0138/0139 均已 `done`（且自述不改变用户可观察行为，属工程面），本清单判据「真用过」已在真实 intake 会话中满足；「静态脚本不保证任意模型指令遵循」按分档口径属合同外已知限制（非待办）。未推送。 |
| `TASK-0135` | `done` | — | 会话归档（对标 Cursor agent 对话归档）：侧栏右键归档直接对话与项目会话，设置「已归档」页重组为项目/会话双分节，支持取消归档与永久删除；三批提交已落地并通过归档族 43 例与门禁。 |
| `TASK-0130` | `verifying` | — | 修复 BUG-0046：runtime zip 解压改走内置 safe-zip-extract，不再依赖外部 tar；已集成（`9d6981fac`），定向回归 9/1skip 通过，待人工 dev 冒烟复装 Node runtime。 |
| `TASK-0131` | `done` | — | 修复 BUG-0047：stdout pipe 断开时 console transport 熔断降级，切断 EPIPE 日志风暴；已集成（`66c7ee464`），定向回归 4 例通过；2026-10-07 真实断管实测：首条 EPIPE 后 1 ms 熔断，全程 392 行日志仅 1 条 uncaughtException，熔断后 180 行业务日志照常落文件（VERIFY-0017 组一）。 |
| `TASK-0132` | `done` | — | 修复 BUG-0048：ResizeObserver 噪音过滤放宽 sourceId 限制覆盖 dev 形态（判定下沉 logger/renderer-console-policy.ts）；已集成（`94d07c6df`），定向回归 7 例通过；2026-10-06 dev 拖分屏冒烟实证日志无 ResizeObserver 噪音（VERIFY-0017 组一）。 |
| `TASK-0133` | `done` | — | 修复 BUG-0049：win32 下新增 ssh2 纯 JS 传输实现（多路复用 Client 替代 ControlMaster），含 known_hosts 校验与提示桥接；独立 Worktree。 |
| `TASK-0129` | `done` | — | 数据库问数与分析：内置技能、只读汇总分析脚本与分发/画布合同已落地；临时 SQLite 追问流程、影响包测试及完整门禁通过，未作真实模型评估。 |
| `TASK-0128` | `done` | — | 对话预算审计 + BUG-0045 预压缩缓存修复：历史只追加时复用已完成摘要（isPrefireCacheValid 唯一前缀规则），定向回归、影响包与全量门禁通过；发布说明归入 v0.1.2。 |
| `TASK-0027` | `done` | `PLAN-0001` | Plugin Artifact Renderer 注册表；SDK 合同（TASK-0068）与 Desktop 宿主接线已落地并通过合同/集成测试收口。 |
| `TASK-0025` | `done` | `PLAN-0001` | Work 本地研究纵切落地：显式 root 本地来源扫描（runtime-knowledge）+ `research_scope` 工具与引用清单（coding-agent）+ Work 来源面板「本地研究」入口与产物来源复查（Desktop）。2026-10-10 按 VERIFY-0017 分档口径闭合：glm 真实 Work 回合中逐条引用+原文、缺失来源如实标「资料未覆盖」不编造（判别性夹具）；Artifact 尾条受 ISSUE-0033 阻断（修复后按其回归探针复验），降级落盘的清单块指纹逐字合规。 |
| `TASK-0026` | `done` | `PLAN-0001` | Work 数据分析纵切落地：只读数据集剖析（runtime-node/dataset）+ `dataset_profile` 工具条件注册 + Work 数据集节与 `dataset`/`analysis` 产物来源复查。2026-10-10 按 VERIFY-0017 分档口径闭合：glm 真实 Work 回合中画像精确、清洗剔行正确、三区合计复算无误、盘上 CSV 与预览一致；Artifact 尾条受 ISSUE-0033 阻断（修复后复验）。 |
| `TASK-0050` | `verifying` | `PLAN-0002` | transcript 窗口化第 2 步（`beforeEntry` 游标分页）三阶段全落地：Main 页合同、viewer 增量订阅、renderer 窗口化（上滚翻页/尾页刷新/整窗重置/导出排空）+ 乐观气泡尾对齐；缺真实 Desktop 大历史冒烟。 |
| `TASK-0107` | `verifying` | `PLAN-0010` | 后台进程统一健康记账（ProcessRoleContract + crash/restart/pid 归因入 perf 快照与诊断包）+ unresponsive JS 栈采样已落地并过定向测试；缺真实 Desktop 上 kill sidecar/模拟 unresponsive 的冒烟证据。 |
| `TASK-0072` | `done` | `PLAN-0006` | WebContentsView 迁移三阶段落地：main 宿主+IPC、renderer 占位矩形切换、ADR-0134；遮挡取舍已定型。2026-10-10 按 VERIFY-0017 分档口径闭合：机制面 62 例绿；用户面属观测通道客观限制（guest 为原生 WebContentsView，不在 ctx.pages()/CDP 无读数/截图必超时），用户走查步骤已记录于组三续测一。 |
| `TASK-0045` | `done` | `PLAN-0003` | CLI/IM/MCP/插件外显身份迁移完成（CLI 命令 `openforge` 直接切换、IM 预填名/Signal 设备名/MCP client 名/插件 author/产品 UA、`openforge-serv` 代号）；解锁 `TASK-0049` 复核关闭 → `TASK-0047`/`TASK-0048`。 |
| `TASK-0122` | `done` | `PLAN-0013` | 团队主控「分派后让出回合」提示词引导 + `team_wait_tasks` timeout 载荷瘦身；机制级测试全绿（agent-team 85 例 + 桌面 20 例）。行为量级归 TASK-0125（另立承接、blocked）。2026-10-09 按 VERIFY-0017 分档口径闭合。 |
| `TASK-0123` | `done` | `PLAN-0013` | 成员会话经会话级函数源收窄隐藏 `browser_tab`（无 WebView 后端不再广告必失败工具）；协调会话不变。2026-10-10 按 VERIFY-0017 分档口径闭合：清单行对象为确定性面（收窄/协调不收窄 20 例直接断言）；真实团队会话模型行为面如实记录为余量，ISSUE-0026 B 路径独立跟踪。 |
| `TASK-0124` | `done` | `PLAN-0013` | 团队会话阶段化进度展示；serial，依赖 TASK-0122 回合语义落地后细化设计。 |
| `TASK-0125` | `blocked` | `PLAN-0013` | rebase 上游+阶段 1 后同任务复跑量化对比（Verification 收口）；depends_on TASK-0122，需 commit 887017560 与真实 ~45min 团队会话复跑。 |
| `TASK-0126` | `done` | `PLAN-0013` | 团队会话预算可视化（ISSUE-0028 候选 C：成员/会话级 token·回合·时长只读投影）；serial，复用 TASK-0124 投影面。 |
| `TASK-0127` | `blocked` | — | 修改声明头存量缺失一次性 `--write` sweep（ISSUE-0023 A 阶段收尾）；等无并行代码线的安静窗口，执行后删除 ratchet 基线并关闭 WAIVER-0002。 |

### SSH 专项

| Task | 状态 | Plan | 当前焦点 |
|---|---|---|---|
| `TASK-0153` | `verifying` | PLAN-0014 | 来源 2e41db644 已集成 main；保留验证历史与人工验收边界，推送见 TASK-0171。 |
| `TASK-0169` | `verifying` | PLAN-0014 | P1 生命周期：探测代次+失效处置已实施（BUG-0061 修复），定向 94/94 与批次门禁全绿，待人工验收。 |
| `TASK-0166` | `verifying` | `PLAN-0014` | SSH helper 三态分类+有界恢复+共享探测+分阶段计时已落地（205 例套件、impact 与完整 check 绿）；实机计时与验收待用户。 |
| `TASK-0167` | `done` | `PLAN-0014` | 远端文件名筛选全链（cfeec25d1）；六项行为面测试级成立（`ssh-transport` 205 例 + `capability-sdk` 91 例 + 回环 23 例），Go 行为回归以「交叉编译 + 同构断言」替代（本机无 POSIX 执行环境）；真实主机在任务边界外。2026-10-09 按 VERIFY-0017 分档口径闭合。 |
| `TASK-0168` | `done` | PLAN-0014 | Windows 回环夹具（Git Bash）+ desktop 消费者解锁；五条声明命令本机全绿（59 通过 / 19 显式跳过 / 0 失败），并实测推翻 0169 的「6 例存量红」过期记载。`runtime-ssh` 22 例红归 TASK-0174；`resource-runtime.remote` 挂起根因未定位（随闭合转出为待办）。2026-10-09 按 VERIFY-0017 分档口径闭合。 |

## Task 要求

- 必须关联 `REQ` 或 `BUG` / `ISSUE`；
- 说明 owner、范围、不做什么和依赖；
- 给出可观察的完成标准；
- 指定测试层级和验证命令；
- 完成后记录实际验证结果；
- 不把多个可独立回滚的 concern 塞进一个 Task；
- Task 状态变更时同步本节焦点表，状态必须来自 Task frontmatter，不推测下一项工作。

## 协作与集成

- `depends_on`、`conflicts_with` 和 `write_paths` / `exclusive_paths` 是并发与集成顺序合同；具体 DAG 以对应 Plan/Task 文件为准，不在此重复维护路线细节。
- 并行批次启动前运行 `bun run worktree:check --all`；检查报告 scope 冲突时先缩小范围或登记冲突，再创建 Worktree。
- `bun run worktree:status` 用于确认真实 Git Worktree 状态；若与 Task frontmatter 不一致，先找 Owner 核实，不移动、覆盖或清理可能含有工作的 Worktree。
- Task 与 Project 索引检查会由 `bun run check` 执行；集成前另运行 `bun run worktree:check --task TASK-xxxx`。
