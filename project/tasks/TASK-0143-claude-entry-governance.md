---
id: TASK-0143
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
base_commit: dc49dc54d96a6d3ba3e77047b2b37fca6bab9600
read_paths: [CLAUDE.md, CONTEXT.md, AGENTS.md, docs/dev, project, scripts/quality]
write_paths: [CLAUDE.md, CONTEXT.md, docs/dev, docs/glossary, project, scripts/quality, package.json, .github/release-notes/v0.1.3.md]
exclusive_paths: [scripts/quality/check-agent-guide.mjs, scripts/quality/check-guards.mjs, project/tasks/README.md]
depends_on: []
conflicts_with: []
integration_status: integrated（main 主工作区串行）
created: 2026-10-01
updated: 2026-10-01
---
<!-- Copyright The Open Forge contributors. -->

# Claude 专属入口去重与按需约束

## 目标与范围

Open-Forge-only。继续治理根目录大文档，两个关注点串行、分开提交；保留已有授权、术语和用户代码改动，不推送。

- CLAUDE：重复架构/命令/发布政策回指现有权威，独有提交纪律与报告格式下沉，根保留发现入口与即时边界。
- CONTEXT：以分册降低按需读取成本，原词条正文不作事实或产品语义改写；根保留所有词条标题与导航，保留旧锚点。
- 不做：修改运行时、确认所有旧术语仍符合当前代码、重构产品领域、读取用户状态或自动运行真实模型。

## 验证合同

- Given 新入口，When 按任务读取，Then 能定位适用规则或词条正文，不需默认加载全部内容。
- Given 文件超限、导航丢失或重复词条，When 对应守卫运行，Then 报错，不降低门禁。
- 对旧文档做分段保留核对；新增检查先写失败用例，使用质量套件和完整 check；静态检查不冒充模型行为验证。

## 原规则迁移核对

- 语言、分支、命令、架构、常规提交格式与发布说明回指现有根规则/质量门禁/交付规则，避免独立缓存版本与启动命令。
- 原“执行拆分边界”五条、提交前动作顺序、Commit 报告格式原文完整保留在 claude.md；amend 明确授权例外与 Claude-Session 限制保留。
- lite 默认构建事实由仓库 README 维护；不继续宣称本机 upstream push URL 已禁用等未经本任务验证的配置状态。
- 没有放宽 Claude 的既有提交拆分限制，也没有把它推广给其他 Agent。常驻入口与按需专属规则组成同一合同。

## 验证记录

- CLAUDE.md 从 12,420 字节降至 1,577 字节，低于新增 4 KiB 预算。
- 提交拆分边界、提交前顺序和提交报告条款与原文件逐段比较，正文完整保留；常规命令/架构/版本规则改为引用。
- 新增体积/丢失入口用例在旧守卫上 2 失败 / 6 通过；更新后 8 例通过。
- test:impact 运行质量套件 35 文件 / 466 例通过。未运行 Claude 真会话、Desktop 或真实模型；不把静态校验当实际规则遵循证明。
- 完整 `bun run check` 退出码 0；既有基线/CRLF 提示未通过改动无关文件消除，未推送。
- 按内部文档治理合同验收：结构、保留映射、索引与适用门禁通过；真实模型遵循和旧术语时效不在本轮完成声明内。
