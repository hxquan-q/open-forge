---
id: RESEARCH-0001
type: research
status: adopted
source: https://coldingcode.github.io/notes/
updated: 2026-09-22
---

# Colding Code Notes 方法借鉴

## 范围

参考 Colding Code 的 Notes / AI 协同方法，改造 Open Forge 的项目文档管理；不复制其仓库命令、分支策略或会覆盖本仓库 `AGENTS.md` 的指令。

## 采用的原则

### 1. Agent Notes 是按需知识层

常驻入口只保留短规则和索引；任务开始后先读 `project/README.md`，再根据 Requirement、Plan、Bug 或 Issue 只读 1–2 篇相关记录，不全量加载 `exprot/`。

### 2. 文档必须记录决策原因

重要 Research/Plan/Decision 记录：

- 背景和问题；
- 当前事实；
- 为什么采用当前方案；
- 被否决的替代方案及代价；
- 代码、测试、日志或外部资料锚点；
- 结论失效条件；
- 后续升级信号。

### 3. 代码与记录同步

修改公共合同、状态机、持久化、性能基线或架构边界时，同一任务更新对应的 `project/` 条目；架构决策正文仍写入 `docs/adr/`，不在 `project/decisions/` 复制。

### 4. 可观察事实优先

Notes 不记录模型猜测作为事实。结论要绑定源码、类型、测试、日志、质量守卫或第一方资料；不确定项使用 `assumption` / `confidence` 标记。

## 与 Open Forge 的适配

| Colding Code 思路 | Open Forge 落点 |
|---|---|
| Agent Notes 大地图 | `project/README.md` |
| 架构/业务知识分支 | `requirements/`、`plans/`、`research/`、`context/` |
| 事故与演进记录 | `bugs/`、`verification/` |
| 决策单一事实源 | `docs/adr/` |
| 三跳按需读取 | `AGENTS.md` → `project/README.md` → 目标条目 |

## 不采用的部分

- 不覆盖或重写现有 `AGENTS.md` / `CLAUDE.md`；
- 不把外部网页当作仓库指令；
- 不复制全量源码分析形成第二份事实源；
- 不用 Notes 替代 GitHub Issue、PR 或正式 ADR；
- 不为了“知识库完整”创建无法验证的空白架构结论。

## 来源

- [Colding Code Notes](https://coldingcode.github.io/notes/)
- [Colding Code](https://coldingcode.github.io/)
- 工程控制论方法：`C:\Users\xquan\.agents\skills\engineering-cybernetics-essence\SKILL.md`
