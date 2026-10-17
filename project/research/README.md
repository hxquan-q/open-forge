<!-- Copyright The Open Forge contributors. -->
# Research

本目录是研究证据索引，不是把所有外部资料全文复制进仓库。新 Research 使用 [`TEMPLATE.md`](TEMPLATE.md)，详细规则见 [`../CONVENTIONS.md`](../CONVENTIONS.md)。

## 现有来源

| 主题 | 来源 |
|---|---|
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
