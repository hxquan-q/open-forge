---
name: form-field-specification-and-base-data
description: "需求闭环确定字段规格时调用：输出统一基本类型、经目标数据表关系核实的 classXxx 基础资料类型或独立追加的 signature。原件标记仅作证据，不并行输出旧 double/object，不决定前端样式或臆造 API 映射。"
---
<!-- Copyright The Open Forge contributors. -->

# 字段规格与基础资料

AIMES CustomDev 字段需求的唯一规格类型来源。接收附件原始字段或自然语言需求，由 [需求闭环](../requirements-design-to-delivery/SKILL.md) 纳入最终规格。不重新解析附件、不负责实际 DDL/Entity/API 或控件实现。

## 统一类型

### 基本类型

| 规格类型 | 语义与确认项 |
|---|---|
| `string` | 文本、编码、编号；批号默认属字符串，格式/长度/校验另定 |
| `Integer` | 普通整数，先确认范围，超范围需改规格 |
| `BigInt` | ID/较大整数；Java `Long` 是参考，不是 `BigInteger`；传输精度与 DTO 在实现阶段核实 |
| `BigDecimal` | 数量、金额、比例等精确小数；明确精度、舍入、单位，不以浮点误差类型替代 |
| `Boolean` | 是/否，是否允许空值按业务确认 |
| `date` | 仅日期 |
| `datetime` | 日期与时间；时区/精度按业务确认 |
| `time` | 仅时刻 |

集合/结构需明确元素或键值类型：`List<T>` 有序可重复；`Set<T>` 去重无序仅在需求明确时使用；`Array<T>` 只在实际字段/API 合同需要数组时使用；`Map<K,V>` 只用于明确的动态键值对象，不作普通字段默认。明细集合需要行字段、关联与顺序语义，不以旧 entry/subEntry 枚举代替完整规格。

上述体系参考 Workshop 的 Java 类型观察（String、Integer、Long、BigDecimal、Boolean、LocalDate/LocalDateTime/LocalTime、List 等），不是对 CustomDev 全部实现映射的认证；服务端内部使用 Set/Map/数组不代表它们都是表单字段。固定短枚举应记录类型和选项约束，不能与远程基础资料混同。

### 基础资料 `classXxx`

- 引用目标基础资料时使用 `classXxx`，Xxx 按已核实目标实体/表的业务对象用 PascalCase 命名；不预置 class 名称、不从 Workshop/Practice 或原件标签静态猜测。
- 需要证明表及字段关系，不仅是“某张表存在”。优先使用 [项目事实记录](../project-architecture-and-runtime-map/SKILL.md#已核实基础资料关系) 中的证据，并在本次目标/关系变化或证据不足时，经获准只读 Schema/元数据核验补齐；证据不明则待验证，不重复从参考项目猜。
- 选择对象、编码/名称、存储关联 ID 与 API 返回结构分别核实，不能假设通用 `{code,name}`；元数据核验按共享操作合同的环境与只读授权执行，不查无关业务数据。
- 系统维护的创建人/修改人不是用户可编辑的人员选择字段，见 [用户元数据](../user-metadata-and-audit-boundary/SKILL.md)。

### 独立 `signature`

只有需求确认电子签属于表单范围才添加。给已有字段加签时保留原字段和类型，在其后追加独立 `signature` 字段，并记录关联原字段及核对目的，不替换人员/业务字段。纸面签字栏不自动转换为电子签。

仅当最终字段清单包含 `signature` **且**本次需求明确要求新增/修改电子签功能时，开发才进入 [电子签实现](../electronic-signature-field-implementation/SKILL.md)；缺规格先确认，单一条件不触发实现。

## 原件证据转规格

| 标记/证据 | 统一处理 |
|---|---|
| `▇是□否` | Boolean |
| `[文本]` / `[长文本]` | string，长文本的容量/多行另记 |
| `[整数]` | 按范围确认 Integer 或 BigInt，不机械输出旧 int |
| `[小数,N]` | BigDecimal，精度另记 |
| `[日期]` / `[长日期]` / `[时点]` | date / datetime / time |
| `[组织]` / `[部门]` / `[品名]` / `[工序]` / `[人员]` | 经目标表关系证据确认相应 classXxx，否则待验证 |
| `[电子签]` 或明确加签需求 | 先确认范围，保留原业务字段并追加独立 signature |

原件标记是证据；最终规格不并行输出旧 `double` / `object` 类型，不把历史固定字段别名作为新命名合同。

## 字段输出与实现交接

每字段记录标签/原始标记/来源、层级、唯一统一类型、范围/集合/默认/取值来源/联动/公式/空值与校验、基础资料关系证据或签名关联，以及推断/待验证项。

CustomDev 的 `fieldName` 使用实际数据库标准列名，已有列直接沿用。未核实列标为待验证，不猜名字或输出 F_ 别名；新列在实现设计中按目标规范确认。目标列、Entity/API/DTO 映射在实现阶段按实际项目核实，规格不得提前臆造；F# 仅非展示关联，不显示 Fxx 字段名前缀。

不决定前端控件/布局/颜色，前端表现由实现阶段按已核实组件合同决定。数据库与后端工作分别交 [数据库变更](../database-change-control/SKILL.md) 和 [CRUD/API](../backend-crud-and-api-contract/SKILL.md)。

## 来源范围

整编自已审阅同名候选、旧字段目录/识别来源与用户 2026-11-06 统一规格决定。候选来源不等于批准的外部 API 合同；数据库关系证据集中于项目事实 Skill，不再维护另一份类型表。
