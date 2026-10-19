---
name: eform-structure-templates
description: "电子表单工坊·常见表单结构模板（层级范本）：内联一份真实业务单据的完整结构 JSON（billformSchema.json）作为通用骨架范本，供 eform 在识别与生成阶段预确定字段的层级归属（单据头/单据体/子单据体）与块角色；字段类型映射参见 eform-fields-catalog 技能。"
---
<!-- Copyright The Open Forge contributors. -->

# 常见表单结构模板（层级范本）

> 本 skill 内联一份真实业务单据的完整结构 JSON（billformSchema.json）。  
> 它是所有 ERP 类表单的通用骨架——开发任何表单时，请参考此json预确定字段的层级归属，以及通过eform-fields-catalog skill来参考决定各字段的对应类型。

---

## 怎么读这份 JSON（用金蝶的视角）

这份 JSON 是一张标准业务单据（以"账单/入库单"为实例）的示例结构。它的最主要价值在于层级区分的逻辑方向，所以，参考时主要取用这一层级区分的逻辑即可，而非各层级包含的内容（表单与表单的内容各不相同，唯有层级区分的思维趋向一致）

JSON 是一条 `Block[]` 数组，每个 block 有 4 个属性：

- `name`：字段名
- `type`：块类型（含义见下表，**它决定这个块是"哪一层级 / 什么角色"，不是值类型**）
- `description`：说明
- `subFields`：子字段（容器才有；叶子字段为 `""`）

| type       | 角色       | 落到哪一层        | 值类型去哪查              |
| ---------- | -------- | ------------ | ------------------- |
| `div/span` | 分区容器     | 工具栏 / 内容区    | —                   |
| `button`   | 动作按钮     | 只在工具栏        | —                   |
| `string`   | 叶子文本字段   | 头 / 体 / 子体均可 | `text`（命中固定命名→`F_`） |
| `int`      | 叶子整数字段   | 同上           | `integer`           |
| `double`   | 叶子小数字段   | 同上           | `decimal-2`         |
| `date`     | 叶子日期字段   | 同上           | `date`              |
| `datetime` | 叶子日期时间字段 | 同上           | `长时间`               |
| `object`   | 基础资料引用   | 同上           | `basic-data`        |
| `entry`    | **单据体**  | 嵌在内容区下       | `entry-list`        |
| `subEntry` | **子单据体** | 嵌在单据体行内，允许自嵌套 | `sub-entry-list`    |

---

## 层级定义（核心：分层思想，而非固定层数）

**1. 工具栏（Toolbar）** —— 最外层，生命周期按钮。  
本范本含 8 个：新增 / 保存 / 提交 / 审核 / 撤销提交 / 反审核 / 取消 / 删除。

> ⚠️ `撤销提交`、`反审核` 是**反向流转**按钮。eform-craft §3.2 当前是单向终态，一期默认不实现；是否支持由确认门决定，标【推断】。

**2. 单据头（Header）** —— `内容` 容器下、单据体之外的所有字段，承载单据的全局信息：单据编号、单据日期、单据状态、往来基础资料（品名 / 工序 / 批号等）。一张单据通常只有一个头；偶尔情况下整张单**可以只有单据头**（没有单据体 / 子单据体）。

**3. 单据体（Entry）** —— `entry` 块。明细行，**可多行**，每行是一笔业务明细（序号 / 物料 / 数量 / 单位）。**一个单据可以有多张单据体**（例如头下并列"明细""费用""备注"多张表）。

**4. 子单据体（SubEntry）** —— `subEntry` 块，嵌在**单据体某一行内**的二级分录，描述该明细行的执行 / 子过程（已执行工序：序号 / 工序 / 数量 / 单位 / 执行人 / 执行时间）。**允许自嵌套**——子单据体里可以再带子单据体；**一个单据体行内也可有多张子单据体**。并非每张单都有，没有就留空。

> 层级形态是**灵活的**，不限于"三/两层"或"1 头 + 1 体 + 1 子体"：
> - 工具栏 ⊃ 单据头（唯一）
> - 单据头下：0~N 张单据体
> - 每张单据体行内：0~N 张子单据体
> - 子单据体：可自嵌套

---

## 使用规则（开发表单时强制执行）

1. 接到表单需求，先把它拆成三类清单：
   - **单据头字段**：（本单的头字段有哪些）
   - **单据体字段**：（明细行字段有哪些）
   - **子单据体字段**：（没有就写"无"）
2. 三类字段的**层级归属**参考本 JSON 的层级逻辑来确定（头 / 体 / 子体分别落在哪一层）；但本单实际是几层、有几个单据体 / 子单据体，**由你按业务自行决定**——示例只是最常见形态（1 头 + 1 体 + 1 子体），不是强制模板。
   - 头字段 → 放在 `内容` 容器下、单据体之前
   - 单据体字段 → 放在对应 `entry.subFields`
   - 子单据体字段 → 放在对应 `subEntry.subFields`（子单据体可继续嵌套子单据体）
3. 每个叶子字段的**值类型**（文本 / 小数 / 基础资料 / 日期 / 长时间…）查 `eform-fields-catalog` skill 取对应 fieldType。
4. 字段的**识别标记**（`[电子签]` / `[长日期]` / `[时间]`…）查 eform-craft §1 识别合同。
5. 工具栏按钮按需取舍，但层级位置不变。

---

## 为什么泛用（以及为什么别照抄内容）

这份 JSON 之所以泛用，不是因为它列了"账单"该有哪些字段，而是因为它示范了**一套分层思维**：任何业务单据，先想清楚"哪些是头、哪些是体、哪些要进子体"，再往里填内容。

- 入库单：头（供应商 / 仓） + 体（物料 / 数量）
- 销售订单：头（客户 / 日期） + 体（品名 / 单价 / 数量） + 子体（发货计划）
- 质检单：头（批号） + 体（检验项） + 子体（不合格明细）
- 一张极简单：只有头（如简单的申请 / 登记卡）

示例里的"1 头 + 1 体 + 1 子体"只是最常见形态，**不是唯一答案**：可以是多单据体、多子单据体、子单据体自嵌套，甚至只有单据头。正所谓"尽信书不如无书"——**取它的分层逻辑，不必照搬它的具体结构；实际几层、几个分录，由你按业务判断。**

---

## 边界

- 反向流转（撤销提交 / 反审核）一期不实现，识别期标【推断】交确认门。
- **子单据体允许自嵌套**（子体里再套子体），不做层数上限约束；具体嵌套深度由业务决定。
- 本示例 JSON 仅代表最常见形态（单据头 + 1 单据体 + 1 子单据体），**不代表结构唯一**；多单据体 / 多子单据体 / 仅单据头 / 子体自嵌套均合法，由你按业务自选。
- 本 skill 只管**分层逻辑**；值类型 / 标记 / 渲染交给对应 skill 与 §6 共享契约。

---

## 范本 JSON（原样，层级以它为锚）

```json
[
    {
        "name": "工具栏",
        "type": "div/span",
        "description": "功能按钮的一般性容器",
        "subFields": [
            {
                "name": "新增",
                "type": "button",
                "description": "新增按钮",
                "subFields": ""
            },
            {
                "name": "保存",
                "type": "button",
                "description": "保存按钮",
                "subFields": ""
            },
            {
                "name": "提交",
                "type": "button",
                "description": "提交按钮",
                "subFields": ""
            },
            {
                "name": "审核",
                "type": "button",
                "description": "审核按钮",
                "subFields": ""
            },
            {
                "name": "撤销提交",
                "type": "button",
                "description": "撤销提交按钮",
                "subFields": ""
            },
            {
                "name": "反审核",
                "type": "button",
                "description": "反审核按钮",
                "subFields": ""
            },
            {
                "name": "取消",
                "type": "button",
                "description": "取消按钮",
                "subFields": ""
            },
            {
                "name": "删除",
                "type": "button",
                "description": "删除按钮",
                "subFields": ""
            }
        ]
    },
    {
        "name": "标题",
        "type": "string",
        "description": "表单标题",
        "subFields": ""
    },
    {
        "name": "内容",
        "type": "div/span",
        "description": " 表单主体容器",
        "subFields": [
            {
                "name": "单据编号",
                "type": "string",
                "description": "单据所属编号",
                "subFields": ""
            },
            {
                "name": "单据日期",
                "type": "date",
                "description": "单据所属日期",
                "subFields": ""
            },
            {
                "name": "单据状态",
                "type": "string",
                "description": "单据所属状态",
                "subFields": ""
            },
            {
                "name": "品名",
                "type": "object",
                "description": "品名",
                "subFields": ""
            },
            {
                "name": "工序",
                "type": "object",
                "description": "工序",
                "subFields": ""
            },
            {
                "name": "批号",
                "type": "string",
                "description": "批号",
                "subFields": ""
            },
            {
                "name": "单据体",
                "type": "entry",
                "description": "单据体",
                "subFields": [
                    {
                        "name": "序号",
                        "type": "int",
                        "description": "序号",
                        "subFields": ""
                    },
                    {
                        "name": "物料",
                        "type": "object",
                        "description": "物料",
                        "subFields": ""
                    },
                    {
                        "name": "数量",
                        "type": "double",
                        "description": "数量",
                        "subFields": ""
                    },
                    {
                        "name": "单位",
                        "type": "object",
                        "description": "单位",
                        "subFields": ""
                    },
                    {
                        "name": "已执行工序",
                        "type": "subEntry",
                        "description": "子单据体，用于记录已执行工序",
                        "subFields": [
                            {
                                "name": "序号",
                                "type": "int",
                                "description": "序号",
                                "subFields": ""
                            },
                            {
                                "name": "工序",
                                "type": "object",
                                "description": "工序",
                                "subFields": ""
                            },
                            {
                                "name": "数量",
                                "type": "double",
                                "description": "数量",
                                "subFields": ""
                            },
                            {
                                "name": "单位",
                                "type": "object",
                                "description": "单位",
                                "subFields": ""
                            },
                            {
                                "name": "执行人",
                                "type": "object",
                                "description": "执行人",
                                "subFields": ""
                            },
                            {
                                "name": "执行时间",
                                "type": "datetime",
                                "description": "执行时间",
                                "subFields": ""
                            }
                        ]
                    }
                ]
            }
        ]
    }
]
```
