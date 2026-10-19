---
name: mes-kit-analysis
description: "生产工单齐套性离线快照分析（齐套分析师主手册）：判断生产工单所需物料在计划完工日前是否齐套（on_time/late/shortage/no_demand/unknown）。从 MES 数据库按 R1-R7 口径只读提取供需数据装配快照 JSON，交给本地分析引擎（scripts/analyze.py，纯 Python 标准库）做 fail-closed 校验与净池分配，产出报告 JSON 与单文件离线看板。引擎不连数据库；数据不足时阻断并把全部结论判为 unknown，绝不把缺失当零需求。当用户要求分析工单齐套性、物料缺口、齐套看板，或要求查看/解释既有齐套分析产物时加载本技能。"
---
<!-- Copyright The Open Forge contributors. -->

# MES 工单齐套分析（mes-kit-analysis）

## 0. 前置条件（缺一先补齐再开工）

| 依赖 | 要求 | 缺失时 |
| --- | --- | --- |
| MCP 数据库工具 | 会话可用一个**只读** SQL 查询工具（如 dbx，经 `dbx_execute_query` / `dbx_execute_batch` 执行 SELECT） | 停下告知用户先配置 MCP 连接，不猜测库结构 |
| Python | ≥ 3.8（引擎仅标准库，无第三方依赖） | 停下告知用户安装 |
| 产物目录 | 项目内 `docs/kit-analysis/<YYYY-MM-DD>/` | 按日期新建，一次分析一个目录 |

本技能**不随插件分发任何 MCP 配置与凭据**；数据库连接由用户侧配置，本技能只约定取数口径。

## 1. Overview

回答一个问题：**这批生产工单到计划完工日，物料是否齐套？**

分两层，职责严格分离：

- **提取阶段**（本文件 §3 R1–R7 口径 + `references/api_reference.md` 快照契约）：从 MES 库只读取数，装配快照 JSON。连接与 SQL 由使用方执行，引擎本身不连库、不读写任何数据库。
- **分析引擎**（`scripts/analyze.py`）：纯函数式校验与分配。全部需求共享一份净供给台账，按期优先分配；任何数据缺口 → 阻断，全部结论 `unknown`。

技能内文件（以技能根目录为基准）：

| 文件 | 作用 |
| --- | --- |
| `scripts/analyze.py` | 分析引擎（校验 + 净池分配 + 报告 + 看板渲染），仅标准库 |
| `scripts/test_analyze.py` | 引擎行为与文档契约测试；技能资产被改动后须重跑 `python scripts/test_analyze.py` 全绿 |
| `references/api_reference.md` | 快照输入与报告输出的完整字段契约、分配策略与扩展点（**唯一权威源**） |
| `assets/dashboard.html` | 单文件离线看板模板（CSP 禁外联，`__REPORT_JSON__` 占位符由引擎注入） |
| `references/extract-as.sql` | AS 库（mysql，`asd_ai_mes`）参考取数 SQL，2026-10-10 试跑定稿 |
| `references/build-snapshot-as.py` | AS 库参考装配器：把已落地提取结果确定性映射为快照，不连库 |

参考实现针对 AS 库；换其他 MES 库时按 §3 口径重写 SQL，引擎与契约不变。

## 2. 设计原则（fail-closed）

1. **缺失 ≠ 零需求**：用料清单缺失的工单不得当作无需求，必须阻断。
2. **不做隐式单位换算**：同一物料在需求/供给中单位不一致 → 阻断。
3. **不推断历史与未来**：库存 `available_at` 必须等于 `snapshot_at`；过期计划供给必须由提取阶段显式 `excluded_reason` 排除。
4. **coverage 诚实标注**：live 模式下 12 个 coverage 键（`inventory`、`production_demands`、`subcontract_demands`、`sales_demands`、`purchase_supply`、`production_supply`、`subcontract_supply`、`reservations`、`units`、`supply_dedup`、`scope`、`snapshot`）必须全部明确为 `true`，否则阻断；其中 `scope` 与 `snapshot` 两键在 demo 模式下也必须为 `true`。
5. **只读取数**：对数据库只执行 SELECT；不建表、不写入、不 DDL。提取 SQL 逐条记入 `query_log`。

## 3. 提取口径（R1–R7，库无关规则）

| 规则 | 内容 |
| --- | --- |
| R1 | 需求数量 = 用料清单**未领数量**；需求时间 = 工单**计划完工日期**。目标需求 `need_at` 必须严格等于该工单 `due_at`（引擎硬校验，不接受领料日期代替）。 |
| R2 | DATE 型字段按当日 `00:00` 带库时区取时点；`snapshot_at` 以数据库 `NOW()` 为准并实测时区。 |
| R3 | 单位为内部编码时须经单位表映射为可读编码；仍无法解析的物料整体退出快照，`coverage.units=false`，不隐式换算。 |
| R4 | 供给三源：库存 = 即时库存字段（free 净量）；采购在途 = 订单数量 − 已入库 − 入库占用且承诺日期明确；生产在途 = 已审核产出工单（数量 − 已入库）且计划完工日期明确。供给 `source_type` ∈ `stock` / `purchase` / `production` / `subcontract` / `srm` / `inspection`，其中 `purchase`/`production`/`subcontract` 计入在途，`inspection` 计入待检。 |
| R5 | 过期承诺（`available_at < snapshot_at`）的计划供给必须带 `excluded_reason` 排除，不得推为当前可用。 |
| R6 | 竞争需求 = 未删除用料清单中未领数量 > 0 且其工单计划完工日期明确的行；目标需求 `priority=0`，非目标 `priority=10`（目标优先占用净池）。 |
| R7 | 无计划完工日期的工单无法定时：不作为目标工单，其用料行也不进入竞争需求（计入 coverage 降级说明）。 |

每次提取必须记录：`snapshot_at`（数据库时间）、`scope.organizations` / `scope.warehouses`、`query_log`（来源、SQL、行数），无法覆盖的来源在 coverage 中诚实标注 `false`。

工单 `demand_state` 三态：`present`（有用料清单且行已入快照）、`zero_confirmed`（已确认零需求）、`missing`（清单缺失 → 阻断）。**只有 `zero_confirmed` 允许无用料行。**

## 4. 工作流

### 第 1 步：确定范围与窗口

与用户确认：目标工单范围（哪些工单/组织/仓库）、分析窗口（`horizon_end`）。默认窗口 = 最晚目标工单计划完工日；用户指定截止日时以其为准。

### 第 2 步：提取（数据库 → 落地提取结果）

按 §3 R1–R7 经 MCP 工具只读查询。SQL 结构参照 `references/extract-as.sql`（8 组：环境/时区、工单、需求、单位、库存、采购、生产、委外/SRM/待检/占用、组织范围），按目标库表结构适配。查询结果**先落盘**到产物目录（如 `extract.jsonl` / 分组 JSON），保证装配可回溯、可复跑。

### 第 3 步：装配快照

把落地提取结果映射为 `snapshot.json`，字段、类型与校验规则以 `references/api_reference.md` 为准。装配器参照 `references/build-snapshot-as.py`：不连库，常量逐行可回溯到提取结果。装配完成先自查：coverage 12 键逐键给出依据；给不出依据的键如实置 `false`（live 下即预期阻断，见 §6）。

### 第 4 步：分析与看板

```bash
python scripts/analyze.py --input snapshot.json --output report.json --html dashboard.html
```

退出码：`0` = 无阻断，结论可用；`1` = 已输出 unknown 阻断报告（报告与看板仍生成，已知数量仅供审计）；`2` = 输入、模板或输出失败（不写任何文件）。

### 第 5 步：汇报

看板与报告路径告知用户；结论按 §5 口径解读，阻断项如实列为数据缺口待治理，绝不把 unknown 说成"缺料"或"齐套"。

## 5. 结果解读

- 工单状态：`on_time`（按期齐套）/ `late`（有晚到缺口但窗口内可补齐，`ready_at` 给出齐套时点）/ `shortage`（全窗口已知供给不足）/ `no_demand`（已确认无需求）/ `unknown`（阻断，已知数量不得解读为齐套或缺料）。
- 分配策略固定 `allocation_policy = due_fifo_on_time_first`：全部需求共享净供给台账，按 `need_at、priority、id` 排序先做按期分配（`available_at ≤ need_at`），再对剩余缺口补逾期供给。
- `supply_qty`、`transit_qty`、`pending_qty`、`stock_qty` 等是共享净池上下文，不是逐工单保证量，**不得跨工单再求和**；实际分配以 `ledger` 为准。
- `conditional=true` 的供给（计划产出/委外等）只表示条件性可用，上游未验证，不承诺生产按期完工。
- demo 模式仅演示引擎，coverage 缺口降级为警告；真实结论必须 live 且零阻断。

## 6. 边界与异常

- live 阻断（exit 1）不是失败：fail-closed 被真实数据触发时的正确行为。汇报格式 = 阻断清单（coverage 未确认键 + 用料清单缺失工单）+ 每项的数据缺口说明 + 建议治理动作；已知数量标注"仅供审计"。
- 引擎/模板资产被修改（含 SKILL.md 契约描述与 `references/api_reference.md` 不一致）时，以 `python scripts/test_analyze.py` 为准（含文档-代码漂移守卫）；改资产必须连带测试全绿。
- 数据侧扩展（待检来料、定向预留、分仓库存、未审核工单）按 `references/api_reference.md` §10 建模，不自行发明字段。
- 本技能不做：写数据库、修改 MES 数据、替代 ERP 运算、预测供应商交期。
