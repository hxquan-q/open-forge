---
id: TASK-0144
type: task
status: done
priority: P2
owner: project/agent-workflow
requirement: REQ-0004
plan: PLAN-0004
source: user-request
related_requirement: [REQ-0004]
related_plan: [PLAN-0004]
related_tasks: [TASK-0140, TASK-0142]
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: dff23dbc3
read_paths: [CLAUDE.md, CONTEXT.md, AGENTS.md, docs/dev, project, scripts/quality]
write_paths: [.agents/skills/grill-with-docs/SKILL.md, CLAUDE.md, CONTEXT.md, docs/dev, docs/glossary, project, scripts/quality, package.json, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/quality/check-agent-guide.mjs, scripts/quality/check-guards.mjs, project/tasks/README.md]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# 领域术语分册与根检索入口

## 目标与范围

Open-Forge-only。继续治理根目录大文档，两个关注点串行、分开提交；保留已有授权、术语和用户代码改动，不推送。

- CLAUDE：重复架构/命令/发布政策回指现有权威，独有提交纪律与报告格式下沉，根保留发现入口与即时边界。
- CONTEXT：以分册降低按需读取成本，原词条正文不作事实或产品语义改写；根保留所有词条标题与导航，保留旧锚点。
- 不做：修改运行时、确认所有旧术语仍符合当前代码、重构产品领域、读取用户状态或自动运行真实模型。

## 验证合同

- Given 新入口，When 按任务读取，Then 能定位适用规则或词条正文，不需默认加载全部内容。
- Given 文件超限、导航丢失或重复词条，When 对应守卫运行，Then 报错，不降低门禁。
- 对旧文档做分段保留核对；新增检查先写失败用例，使用质量套件和完整 check；静态检查不冒充模型行为验证。

## 分册与迁移证据

- `session.md`：会话、消息与工具调用，15 个词条。
- `memory-im.md`：记忆与 IM 会话，14 个词条。
- `runtime.md`：托管运行时与环境，4 个词条。
- `interaction.md`：交互、通知与模型展示，19 个词条。
- `personalization.md`：个性化与 Provider 配置，6 个词条。
- `skills.md`：Skills、能力分发与授权，11 个词条。
- `plugins.md`：插件与扩展，13 个词条。
- `media.md`：图像、音频与媒体，10 个词条。
- `cards.md`：结果卡片，6 个词条。
- `workflow.md`：产品工作流与派遣，6 个词条。
- `design.md`：设计文件与画框，4 个词条。
- `service-boundary.md`：外部服务与商业边界，5 个词条。
- 原根正文 SHA-256：`500d7fc05eefbd5e0446a24a52b30de7d645581227158432d766c9981c5efa68`；113 个词条逐段原文核对，每个只在一个分册出现，根标题集合完全相同。
- 根索引保留原标题锚点与同名查找入口；没有现存 Markdown 指向 CONTEXT 的词条片段链接需要重写，源码注释中的按名称引用仍可检索。
- 修正本地 grill-with-docs 的写入位置指引，避免它继续把完整定义写回根索引；不改动全局安装的 Skills。

## 实测记录

- 根 CONTEXT 从 88,304 降为 9,547 字节；12 册、113 个词条正文与旧 Git 版本逐段比对完整保留，旧三级标题集合不变。
- 旧根在新守卫上因超预算/缺少分册失败；迁移后 10 个回归用例通过，覆盖查找、漏项、重复、错误分册、索引混入定义、体积、断链和目录越界。
- test:impact 运行质量套件 36 文件 / 476 例通过；Skill frontmatter 53 个文件通过。
- 未逐条审定旧术语是否仍符合当前实现；没有因目录分类而新增、删除或改变产品行为。真实模型读取效果不在本轮静态验证结论内。
- 按内部文档治理合同验收：结构、保留映射、索引与适用门禁通过；真实模型遵循和旧术语时效不在本轮完成声明内。
- 完整 `bun run check` 退出码 0，未修改无关文件或降低基线；发布说明已更新，未推送。
