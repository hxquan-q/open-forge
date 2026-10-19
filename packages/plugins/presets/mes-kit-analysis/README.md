<!-- Modified by The Open Forge contributors. -->
# mes-kit-analysis（齐套分析师）

预置 agent 插件：`@kitcheck` 齐套分析师。回答生产场景的一个具体问题——**这批生产工单到计划完工日，物料是否齐套？**

## 组成

- `agent/agents/kit-analyst.md` — 齐套分析师系统提示（fail-closed 纪律 + 只读取数 + 分级汇报）
- `agent/skills/mes-kit-analysis/SKILL.md` — 主手册：R1–R7 提取口径、工作流、结果解读
- `agent/skills/mes-kit-analysis/scripts/` — 分析引擎 `analyze.py`（纯 Python 标准库）与契约测试 `test_analyze.py`
- `agent/skills/mes-kit-analysis/references/` — 快照/报告字段契约 `api_reference.md`；AS 库参考实现（`extract-as.sql`、`build-snapshot-as.py`）
- `agent/skills/mes-kit-analysis/assets/dashboard.html` — 单文件离线看板模板（CSP 禁外联）

## 前置条件

| 依赖 | 要求 |
| --- | --- |
| 数据库 MCP 工具 | 用户侧配置的**只读** SQL 查询工具（如 dbx）。本插件**不分发**任何 MCP 配置与凭据 |
| Python | ≥ 3.8，仅标准库，无第三方依赖 |

## 产物约定

一次分析落一个目录：`docs/kit-analysis/<YYYY-MM-DD>/`（提取中间件、`snapshot.json`、`report.json`、`dashboard.html`）。

## 设计原则（fail-closed）

缺失 ≠ 零需求；不做隐式单位换算；不推断历史库存；coverage 12 键诚实标注。数据不足 → 引擎阻断（exit 1）→ 全部结论 `unknown`，已知数量仅供审计。live 阻断不是失败，是契约在保护用户不被"看起来齐套"的假结论误导。

## 验证

```bash
# 契约测试（43 项，含文档-代码漂移守卫）
cd agent/skills/mes-kit-analysis && python scripts/test_analyze.py

# preset manifest 结构测试
bun run test:pkg @vetta/plugin-preset-mes-kit-analysis
```

## Context Boundary

```yaml
purpose: "预置（preset）插件——随 manifest 铺设齐套分析师（kit-analyst persona 与 mes-kit-analysis 技能：R1-R7 只读提取口径、快照契约、fail-closed 分析引擎与离线看板模板），产物落项目 docs/kit-analysis/；数据库连接由用户侧 MCP 配置提供，插件不分发任何 MCP 配置与凭据；运行时无代码贡献，entry 仅为满足 manifest 约定"
provides: []
consumes: []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
```

## 备注

- `icon.png` 暂复用 chart-renderer 图标作占位，后续替换专属图标。
- AS 库（mysql，`asd_ai_mes`）参考实现来自 2026-10-10 端到端试跑：live 12 条阻断（全部为数据缺口）+ demo 分级结论，fail-closed 行为已被真实数据验证过一次。
