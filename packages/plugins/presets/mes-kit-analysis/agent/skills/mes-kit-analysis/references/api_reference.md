<!-- Copyright The Open Forge contributors. -->
# 快照与报告契约（mes-kit-analysis API 参考）

`scripts/analyze.py` 的输入快照与输出报告的完整字段契约。引擎只做校验与分配，不连库、不推断。违反"必须"规则的后果标注为【阻断】（exit 1，全部结论 `unknown`）、【警告】（降级但继续）或【输入失败】（exit 2，不写文件）。

## 1. 输入快照（顶层）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `meta` | object | 缺失或非对象【阻断】，见 §2 |
| `orders` | array\<object\> | 必须是完整列表【阻断】，目标工单，见 §3 |
| `demands` | array\<object\> | 必须是完整列表【阻断】，目标 + 竞争需求，见 §4 |
| `supplies` | array\<object\> | 必须是完整列表【阻断】，全部供给 lot，见 §5 |
| `alternatives` | array | **必须为空数组**；非空或无效【阻断】——引擎不支持替代料，禁止静默忽略 |
| `audit` | object | 提取阶段的 `blockers` / `warnings` / `query_log`，原样并入报告 |

JSON 解析层即拒绝：对象键重复、`NaN`/`Infinity` 常量【输入失败】。

## 2. meta

| 字段 | 取值 | 规则 |
| --- | --- | --- |
| `mode` | `"live"` \| `"demo"` | 其它值【阻断】；demo 时 coverage 缺口降级为【警告】 |
| `snapshot_at` | ISO8601 带时区 | 以数据库 `NOW()` 为准；缺失或裸时间（无时区）【阻断】 |
| `horizon_end` | ISO8601 带时区 | 早于 `snapshot_at`【阻断】（快照窗口无效） |
| `allocation_policy` | `"due_fifo_on_time_first"` | 唯一支持值【阻断】 |
| `scope.organizations` | 非空 string 数组 | 空数组不视为全范围【阻断】 |
| `scope.warehouses` | 非空 string 数组 | 同上【阻断】 |
| `coverage` | object | 12 键全为 `true`（live）【否则阻断】 |
| `warnings` | array\<string\> | 提取口径说明，并入报告警告 |

`coverage` 12 键：`inventory`、`production_demands`、`subcontract_demands`、`sales_demands`、`purchase_supply`、`production_supply`、`subcontract_supply`、`reservations`、`units`、`supply_dedup`、`scope`、`snapshot`。其中 `scope` 与 `snapshot` 两键在 demo 模式下也必须为 `true`【否则阻断】。

## 3. orders[]（目标工单）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` | string | 非空且唯一【重复阻断】 |
| `no` / `product_name` | string | 展示透传 |
| `planned_qty` | Decimal 字符串 | 非负有限，见 §7 数量规则【阻断】 |
| `due_at` | ISO8601 带时区 | 晚于 `horizon_end`【阻断：窗口不足以作出结论】 |
| `approved` | 必须为 `true` | 未审核【阻断】 |
| `demand_state` | `"present"` \| `"zero_confirmed"` \| `"missing"` | `present` 必须至少有一条用料行【无用料行阻断】；`zero_confirmed` 的用料行必须全为零【非零阻断】；`missing` 即【阻断：缺失不得视为零需求】 |

## 4. demands[]（目标需求 + 竞争需求）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` / `order_id` / `material_id` / `unit` | string | 非空【阻断】；`id` 全表唯一【重复阻断】 |
| `qty` | Decimal 字符串 | 非负有限【阻断】 |
| `need_at` | ISO8601 带时区 | `target=true` 时必须与该工单 `due_at` 为**同一时点**【阻断，不接受领料日期】；晚于 `horizon_end`【警告】且不占用本窗口供给 |
| `priority` | int | 目标 `0`、竞争 `10`；布尔或小数【阻断】 |
| `target` | bool | 必须与"`order_id` 存在于 orders"一致【阻断】 |
| `order_no` / `material_code` / `name` / `spec` | string | 展示透传 |

同一 `material_id` 在全部 demands 与 supplies 中的 `unit` 必须一致【不一致阻断：不进行隐式单位换算】。

## 5. supplies[]（供给 lot）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` / `resource_key` / `material_id` / `unit` | string | 非空【阻断】；`id` 与 `resource_key` 各自全表唯一【重复阻断】 |
| `qty` | Decimal 字符串 | 非负有限【阻断】；`stock` 型为 **free 净量** |
| `source_type` | `"stock"` \| `"purchase"` \| `"production"` \| `"subcontract"` \| `"srm"` \| `"inspection"` | 其它值【阻断】 |
| `available_at` | ISO8601 带时区 | `stock` 必须等于 `snapshot_at`【否则阻断：禁止推断历史库存】；非 `stock` 早于 `snapshot_at` 必须带 `excluded_reason`【否则阻断：过期计划供给不得推为当前可用】；晚于 `horizon_end`【警告】并排除 |
| `conditional` | bool | 非布尔【阻断】；`production` / `subcontract` 无论取值都强制视为 conditional【警告：上游未验证】 |
| `source_order_id` | string \| null | 等于需求方工单时构成自产自用，该供给对该需求不参与分配 |
| `reserved_to_demand` | string \| null | 仅 `stock` 支持【其它类型阻断】；锁定给指定需求 id，不进入自由池；目标需求不在快照中仍保持锁定【警告】 |
| `excluded_reason` | string \| null | 非空即排除出分配【警告】，原样回显于报告 |
| `stock_qty` / `reserved_qty` | Decimal 字符串 | 仅 `stock` 可携带【其它类型阻断】；两字段同时携带且非定向预留 lot 时强校验 `qty = stock_qty − reserved_qty`，且 `qty ≤ stock_qty`【违反阻断】 |
| `source_doc` | string | 展示透传（单号） |

库存物理量不得在 free lot 与定向预留 lot 之间重复携带：`reserved_to_demand` lot 的 `qty` 独立于自由池，不再从 free 扣减也不自动释放。

## 6. 数量与时间规则

- 数量一律为字符串编码的非负有限 Decimal（`"108"`、`"0.5"` 合法；`"1,000"`、`" 1"`、`"NaN"`、数值型、超万位或超指数范围均【阻断】）。引擎按输入数据动态设定精度上下文，不受调用方全局 Decimal 上下文影响。
- 时间一律为带时区 ISO8601（`Z` 或 `±HH:MM`）；比较按时点语义，与字符串时区写法无关。

## 7. 分配策略（due_fifo_on_time_first）

1. 合格需求按 `(need_at, priority, id)` 升序，全量需求共享一份净供给台账。
2. 第一遍（按期）：只取 `available_at ≤ need_at` 的供给；第二遍（补逾期）：对剩余缺口取晚到供给。
3. 候选供给排序：自身定向预留 lot 优先，再按 `(available_at, id)` 稳定分配。
4. 每笔分配写入 `allocations`：`supply_id`、`source_type`、`source_doc`、`qty`、`available_at`、`reserved`、`conditional`。

守恒保证（有测试约束）：`demand_qty = on_time_qty + late_qty + uncovered_qty`；每条供给累计分配 ≤ 其 `qty`；输入快照不被修改。

## 8. 输出报告

顶层：`meta`（回显）、`orders`、`materials`、`ledger`、`supplies`（回显输入）、`audit`（`blockers` / `warnings` / `query_log`）。

### orders[]

`id`、`no`、`product_name`、`planned_qty`、`due_at`、`status`、`ready_at`、`reason`、`materials[]`。

`status` ∈ `on_time` / `late` / `shortage` / `no_demand` / `unknown`：有阻断一律 `unknown`；否则任一物料 `shortage` → `shortage`，任一 `late` → `late`，`zero_confirmed` → `no_demand`，其余 `on_time`。`ready_at` = 各用料 `ready_at` 的最大时点，仅在 `on_time`/`late` 时给出。

### orders[].materials[]（逐工单逐物料）

`demand_id`、`material_id`、`material_code`、`name`、`spec`、`unit`、`demand_qty`、`supply_qty`、`transit_qty`、`pending_qty`、`stock_qty`、`reserved_qty`、`available_stock_qty`、`shortage_qty`（= `demand_qty − on_time_qty`）、`inventory_rate`（=`stock_qty/demand_qty`）、`available_inventory_rate`（=按期库存分配量/`demand_qty`）、`total_rate`（=`on_time_qty/demand_qty`）、`on_time_qty`、`late_qty`、`uncovered_qty`、`ready_at`、`status`、`reason`、`allocations`。

率为百分比字符串（ROUND_HALF_UP 两位小数）；零需求分母按 `100.00` 展示。`supply_qty`/`transit_qty`/`pending_qty`/`stock_qty` 为该物料共享净池上下文，**不得跨工单再求和**。

### materials[]（目标需求按物料汇总）

`material_id`、`material_code`、`name`、`spec`、`unit`、`demand_qty`、`on_time_qty`、`late_qty`、`uncovered_qty`、`order_count`（涉及的目标工单数）。

### ledger[]（逐需求分配台账）

`demand_id`、`order_id`、`order_no`、`target`、`material_code`、`unit`、`need_at`、`demand_qty`、`on_time_qty`、`late_qty`、`uncovered_qty`、`status`、`reason`、`allocations`。

### audit

`blockers` 非空 → exit 1 且全部 `status=unknown`（已知数量仅供审计，不得解读为确定齐套或缺料）；`warnings` 收录分配策略、判定边界、coverage 降级与条件性供给说明；`query_log` 透传提取记录。

## 9. CLI 与文件契约

```
python scripts/analyze.py --input S --output R --html D
```

退出码：`0` = 无阻断；`1` = 已输出 unknown 阻断报告；`2` = 输入、模板或输出失败（不写任何文件）。输入/模板/输出四个路径必须互不相同，输出父目录须已存在。模板须恰好包含一个 `__REPORT_JSON__` 标记且不得引用任何外部或本地资源（`src`/`href` 等仅允许 `#`、`data:`）；产出 HTML 注入 CSP（`default-src 'none'; connect-src 'none'` 等），完全离线打开。

## 10. 已知未建模来源与扩展点

提取阶段引入新来源时必须保持契约不变量：

- 待检来料 → `inspection` 型供给，`available_at` 取预计放行时点（计入 `pending_qty`）。
- 定向占用（如拣货单登记）→ `stock` 型独立 lot + `reserved_to_demand`，与 free 库存分开携带。
- 分仓库存 → 每仓独立 lot，以 `resource_key` 区分。
- 未审核工单默认不得进入（`approved` 必须为 `true`）；如需纳入，由提取阶段显式决策并在 `meta.warnings` 记录口径，同时相应 coverage 键置 `false`。
