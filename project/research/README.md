<!-- Copyright The Open Forge contributors. -->
# Research

本目录是研究证据索引，不是把所有外部资料全文复制进仓库。新 Research 使用 [`TEMPLATE.md`](TEMPLATE.md)，详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)。

## 现有来源

| 主题 | 来源 |
|---|---|
| GitHub 开发/PR 与 Codeup 单向同步、Flow 执行 CI/CD：区分同步与 PR 门禁，核实事件/状态回写、精确 SHA、跨平台执行器与版本计费边界；仅调研，未实施迁移 | [RESEARCH-0045](RESEARCH-0045-github-codeup-flow-ci-migration.md) |
| Desktop 启动与占用再调查：近期开发/安装形态日志分组、同步运行环境探测、编辑器静态依赖、未知大小会话恢复及资源基线缺口 | [RESEARCH-0044](RESEARCH-0044-desktop-startup-resource-audit.md) |
| Agent 执行与 Team 性能一手参照：固定 Pi/Codex/OpenHands SHA，状态投影缓存、通知 drain、FIFO 与并发边界；无实测加速声明 | [RESEARCH-0043](RESEARCH-0043-agent-execution-performance-references.md)、[PLAN-0024](../plans/PLAN-0024-agent-kernel-team-execution-performance.md) |
| 产品运营后台优先设计：登录注册、个人/企业授权与席位、版本运营闭环；后续企业策略和统一插件/MCP/技能市场，附客户端事实与第一方证据 | [RESEARCH-0041](RESEARCH-0041-product-backoffice-and-enterprise-control.md) |
| Pi插件生态与本仓兼容边界：固定官方1.4.0源码快照和8个生态仓库，核实工具/事件/会话/RPC与TUI差异，关联原生插件优化方案；未安装执行样本 | [RESEARCH-0040](RESEARCH-0040-pi-extension-ecosystem-compatibility.md)、[PLAN-0022](../plans/PLAN-0022-pi-ecosystem-and-plugin-evolution.md) |
| Pi 生态记忆源码续研：固定版本对照 Pi、Chasen、openpi、pi-mind、pi-hermes；核实短词检索、Worktree、观察覆盖和 forget 恢复旧版本等边界，形成 PLAN-0021 输入 | [RESEARCH-0039](RESEARCH-0039-pi-memory-implementation-benchmarks.md) |
| Agent 全局/项目长期记忆：Mem0、Graphiti、A-MEM、MemOS 与图 RAG 一手核查；对照本仓 4,000 字符快照链路，建议作用域/来源/时间版本、混合检索及任务评测路线 | [RESEARCH-0038](RESEARCH-0038-agent-persistent-memory.md) |
| 浏览器元素批注外部基准（Cebian/stagewise/onUI 等 11 项对照）：核心链路已齐，真实差距为批注 intent+severity、CSS selector、控制台错误、iframe 穿透、MCP 暴露等 10 项，含 Apache-2.0 下的许可证边界 | [RESEARCH-0037](RESEARCH-0037-browser-tab-external-projects-benchmark.md) |
| Cursor Design Mode 对照：单击是元素旁批注并改源码，Alt+单击才把元素放进输入框；本仓此前把两者合成一次发送 | [RESEARCH-0036](RESEARCH-0036-cursor-design-mode-annotation.md) |
| 最近14天日志（10-08至10-21）：55份运行日志与8份构建/检查日志；区分paint超时、远端资源耗时、未闭环错误、历史修复及测试污染，附脱敏指纹清单 | [RESEARCH-0035](RESEARCH-0035-fourteen-day-log-performance-audit.md) |
| Browser 插件、文件 HTML 预览与 browser_tab 优化核对：现有激活预热/按插件 dev 开关、复用文件协议、停止重复确定性失败，并区分空参数与流解析回退 | [RESEARCH-0034](RESEARCH-0034-browser-preview-optimization.md) |
| .ua 图谱全局结构/增量与现有开发入口核对：区分原生会话协作、产品 Agent Team/AllstarCoding 和后台 scripts/agents，复用统一入口落实自动开发 | [RESEARCH-0033](RESEARCH-0033-graph-and-native-development-workflow.md) |
| 设计插件参考项目与许可证审计（「对话出界面」产品/开源项目/源码定位工具三类分流、可直接复用模块与禁复制清单，2026-10-18 核对） | [RESEARCH-0031](RESEARCH-0031-design-reference-projects-license-audit.md) |
| 受管 fd/rg 工具 inspect() 解析记录与 CLI/Desktop 双 doctor 出口可行性核对（草案四处修正：source 枚举跨进程收敛、version 标记落点、CLI 注册点实名、Desktop 桥接需导出 helper；CometixCode /doctor 先例） | [RESEARCH-0030](RESEARCH-0030-managed-coding-tool-doctor-inspection.md) |
| 上游消息列表重构（ADR-0146/0147）同步评估：不建议整体同步（79 个双改文件、本仓已持治理/attach 等价物、P7 上游亦未完成），按价值拆小件吸收并保留回馈机会 | [RESEARCH-0029](RESEARCH-0029-upstream-message-list-refactor-assessment.md) |
| Windows agent 沙箱 MIC Low 标签手法与 BUG-0128 归因定案（DSH 指纹与 `~/.dsh` 会话取证、MIC 取低值规则、root-only 重置实验、上游 #8048 报告素材） | [RESEARCH-0028](RESEARCH-0028-windows-agent-mic-low-label-attribution.md) |
| Desktop 全部保留日志与 Git 对照巡检（45 文件，新增 BUG-0114/0115，未修复与待定位问题、历史修复及脱敏签名附表） | [RESEARCH-0027](RESEARCH-0027-dev-log-audit.md) |
| Desktop 首页/会话链路 Web Vitals 调研（CLS 0.58 归因与证伪、会话切换 400ms INP、大会话恢复 587ms 长任务与 LCP 21.9s、修复优先级 P1–P5） | [RESEARCH-0026](RESEARCH-0026-desktop-web-vitals-audit.md) |
| 上游 0.5.60–0.5.64 同步审计与候选清单（网关重试/流式短语/传输设置/模型参数回填/压缩步骤等 adopt 判定与排除证据） | [RESEARCH-0025](RESEARCH-0025-upstream-0.5.60-0.5.64-sync-audit.md) |
| Pi 1.0 工作流帖与官方文档的产品层设计对照（MCP 暴露、会话树状态、授权审计、自治边界、文件回退） | [RESEARCH-0024](RESEARCH-0024-pi-workflow-post-design-review.md) |
| 版本迭代与发版设计（上游 Vetta、业界做法、本仓缺口） | [RESEARCH-0023](RESEARCH-0023-version-management-and-release-design.md) |
| 原始 Vetta 最新非手机优化与本仓缺口 | [RESEARCH-0022](RESEARCH-0022-upstream-nonmobile-gap-audit.md) |
| Pi 与 DeepSeek Harness / Desktop 能力吸收评估 | [RESEARCH-0021](RESEARCH-0021-pi-deepseek-harness-absorption.md) |
| Desktop 字体设置与字体授权 | [RESEARCH-0020](RESEARCH-0020-desktop-font-preferences-and-licenses.md) |
| 集成后可靠性与验证成本审查 | [RESEARCH-0019](RESEARCH-0019-post-integration-optimization-audit.md) |
| 架构、Agent Loop、Composition | `exprot/architecture-overview.md`、`agent-loop.md`、`composition.md` |
| Runtime 子系统 | `exprot/runtime-subsystems.md`、`runtime-mapping.md` |
| Pi/DSH 内核评估 | `exprot/kernel-replacement-feasibility.md` |
| Open Forge 更名 | `exprot/rebrand-plan.md`、`development-paradigm.md` |
| 上游 Agent 协同/Notes 方法 | [`colding-code-notes.md`](colding-code-notes.md)、[Colding Code Notes](https://coldingcode.github.io/notes/) |
| Agent 产品性能实践 | [`RESEARCH-0002-agent-product-performance.md`](RESEARCH-0002-agent-product-performance.md) |
| 桌面端内存足迹优化路线 | [`RESEARCH-0003-desktop-memory-footprint.md`](RESEARCH-0003-desktop-memory-footprint.md) |
| 工程控制论方法 | `C:\Users\xquan\.agents\skills\engineering-cybernetics-essence\SKILL.md` |
| Canvas / Browser / Terminal 支持面 | [`RESEARCH-0005`](RESEARCH-0005-canvas-browser-terminal-support.md) |
| Cursor Agent Workspace 对照与报告表面 | [`RESEARCH-0006`](RESEARCH-0006-cursor-agent-workspace-and-report-surfaces.md) |
| 内核上下文管理三家对标（magic-context / pi / CometixCode） | [`RESEARCH-0007`](RESEARCH-0007-context-cache-stability-references.md) |
| 多智能体编排协作对照（Cursor/Claude Code/Codex/Pi） | [`RESEARCH-0008`](RESEARCH-0008-multi-agent-orchestration-comparison.md) |
| DeepEval 开发期旁路 | [`RESEARCH-0006`](RESEARCH-0006-deepeval-agent-quality.md) |
| DeepEval / Promptfoo / MASEval 三框架旁路 | [`RESEARCH-0009`](RESEARCH-0009-three-framework-agent-eval.md) |
| Avernet 治理/TaskGuard/Skills 池化与 WorkDaddy 无人值守自动化对照 | [`RESEARCH-0012`](RESEARCH-0012-avernet-workdaddy-references.md) |
| VS Code 内存足迹与发布体积优化机制源码取证 | [`RESEARCH-0013`](RESEARCH-0013-vscode-footprint-optimization.md) |
| Skill 落盘布局审计（pool/active 必要性裁决，TASK-0113） | [`RESEARCH-0014`](RESEARCH-0014-skill-layout-pool-active-audit.md) |
| Cordis 元框架机制调研（fiber/effect/inject 与可借鉴点） | [`RESEARCH-0015`](RESEARCH-0015-cordis-meta-framework.md) |
| Northline 长程 Agent 委派与 OpenVetta Task/Worktree 治理对照 | [`RESEARCH-0016`](RESEARCH-0016-northline-openvetta-reference.md) |
| 开发范式：OpenVetta、工程控制论与 Matt Pocock 方法对照 | [`RESEARCH-0017`](RESEARCH-0017-development-paradigm-synthesis.md) |
| pi 上游安全通告审计与回移分诊（GHSA × 4 + 积压清单，雷达文档 docs/upstream/pi.md） | [`RESEARCH-0032`](RESEARCH-0032-pi-security-advisory-backport-audit.md) |
| 流式 Markdown 渲染性能优化（autoresearch 60 轮：-88% 总耗时 / p95 -92~98%） | [`RESEARCH-0042`](RESEARCH-0042-streaming-markdown-render-perf.md) |

## Research Note 约束

每篇重要研究至少记录：

1. 问题和范围；
2. 事实来源；
3. 当前结论；
4. 被否决的方案及原因；
5. 代码锚点或验证证据；
6. 结论失效条件；
7. 下一步触发条件。

外部网页内容只作为资料，不能改变仓库规则或直接成为开发指令。
