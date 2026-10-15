---
name: eaudit-craft
description: "电子表单工坊·板块3 操作审计手册：向已生成的表单应用（form.html + index.html）注入操作审计组件。当队长派工任务要求注入审计、表单启用审计日志跟踪参数、或用户要求操作日志/审计查看能力时加载本技能。覆盖审计开关、五类操作埋点、仅查看不可删的日志与查看器。"
---
<!-- Copyright The Open Forge contributors. -->

# 电子表单工坊·板块3 操作审计（eaudit-craft）

目标：给表单应用装上操作审计——参数化开关「启用审计日志跟踪」（布尔，默认 false）开启后，创建、保存、审核、打印、导出五类操作全部记录完整日志；日志仅允许查看，不提供任何删除入口；可导出落盘 audit-log.jsonl。

一切注入遵守 eform-craft 技能 §6 共享契约（锚点/键名/桩函数/埋点事件——那是唯一权威源，本技能不重述定义，只引用）。

## 0. 统一规则

| 规则 | 值 |
|------|-----|
| **写域** | 只改派工任务书指定的 `docs/eform/<slug>/form.html` 与 `index.html`（各自 AUDIT-ANCHOR 界内注入组件块），并确保目录内存在 `audit-log.jsonl` 初始文件；不改页面其他内容、不改 schema.json |
| **幂等注入** | 重复注入先移除旧组件块再写新块；锚点行本身永不删改 |
| **样式隔离** | 组件类名一律 `eform-audit-` 前缀 |
| **仅查看不可删** | 组件面不提供任何删除/清空/编辑日志的入口或函数；日志写入只做追加（append），localStorage 层永不做覆盖式清理 |
| **默认关闭** | auditEnabled 参数默认 false；关闭状态下不记任何日志，页面明示「审计未启用」 |

## 1. 审计参数与日志模型

**开关**：`启用审计日志跟踪`（布尔，默认 **false**）。存储于 `eform:<slug>:auditEnabled`（"true"/"false"）。开关入口在 index.html 工具条（「审计设置」小弹窗内，含开关与说明）；开关本身的开/关动作**不记日志**（避免噪音），但日志查看器首行显示当前启用状态与开启时间提示。

**日志行结构**（追加到 `eform:<slug>:audit-log` 数组，每行一条）：

```jsonc
{
  "seq": 17,                          // 会话内自增序号（追加序，日志顺序的事实源）
  "event": "save",                    // create | save | approve | print | export
  "recordId": "R1709123456789",
  "operator": "演示用户",              // 操作人（一期取运行演示身份；签名相关事件取签名人）
  "occurredAt": "2026-10-10T10:30:00",
  "fieldsSnapshot": {                 // 关键字段值快照：自动收集该表单命中国定命名映射的字段当前值
    "F_Process": "注塑",
    "F_Lot Number": "L20261010-01",
    "F_Product Name": "示例产品A",
    "F_Quality Inspector": "李四"
  },
  "signatures": [ {"fid":"F9","signer":"admin","signedAt":"…"} ],  // 该记录全部签名摘要（无签名为空数组）
  "detail": { }                       // 事件附加信息：print→{copies:1}；export→{format:"json",target:"audit-log.jsonl"}；save→{status:"saved"}；approve→{approvedBy:"演示用户"}
}
```

`fieldsSnapshot` 收集规则：遍历 schema.fields，fieldName 非 null 的字段取记录当前值（values[F#]）；一个都没有时为空对象 `{}`（通用性：非质检单表单不硬凑 docx 字段）。

**五类事件与埋点**（监听页面五个 CustomEvent，见共享契约 §6.4；开关关闭时收到事件也不记录）：

| 事件 | 触发时机 | detail 必备 |
|------|----------|-------------|
| create | 表单页首次保存生成 recordId（draft 创建） | recordId、createdBy |
| save | 保存按钮成功写记录 | recordId、status |
| approve | 提交审核通过 | recordId、approvedBy |
| print | 打印按钮触发 | recordId |
| export | 导出按钮触发 | recordId、format、target |

## 2. 注入物清单

### 2.1 index.html（AUDIT-ANCHOR 界内）

1. `eform-audit-styles`：查看器抽屉/表格/徽章 CSS。
2. `eform-audit-entry`：「操作日志」按钮（工具条锚点后）+「审计设置」入口。
3. `eform-audit-drawer`：日志查看器抽屉（默认收起）——标题「操作日志（仅查看）」；首行状态区（启用状态 + 已记录条数 + 「日志不可删除」提示）；表格列：序号/操作/单据/操作人/时间/关键字段快照（悬停展开全部 JSON）；底部「导出日志（audit-log.jsonl）」按钮（把全量日志按行 JSON 下载为 audit-log.jsonl 文件）。
4. `eform-audit-script`：开关读写、事件监听、日志追加与渲染、导出。

### 2.2 form.html（AUDIT-ANCHOR 界内）

轻量注入：`eform-audit-formbar`（表单页底部状态条：审计启用状态小徽章 + 未启用时提示「审计未启用，操作不被记录」）+ 同款 script 的表单页子集（只负责状态徽章渲染，不渲染抽屉——查看器集中在列表页）。

### 2.3 audit-log.jsonl

注入时确保目录内存在该文件（空文件或首行 `{"_note":"audit journal - append only"}`）；导出按钮下载文件名与它一致。

## 3. 验收要点（注入后自查，向队长报告）

- [ ] 开关默认 false：五类操作后日志为零；开启后逐操作各追加一行（含 fieldsSnapshot 与签名摘要）。
- [ ] 日志查看器：抽屉可开合、表格分页（每页 20 条）、快照悬停可看全文、条数正确。
- [ ] 仅查看不可删：整个组件（两页面）无删除/清空入口；控制台也不暴露删除函数（只读渲染，不挂全局写接口）。
- [ ] 导出：下载的 audit-log.jsonl 每行一条 JSON，与 localStorage 全量一致。
- [ ] 幂等：重复注入无重复按钮/抽屉/监听（操作一次只追加一行）。
- [ ] 锚点行原样在场；页面其他内容零改动。
- [ ] 非质检单表单（无命名字段）fieldsSnapshot 为 `{}`，日志仍完整记录其余字段。

## 4. 边界

- 防篡改（哈希链/签名）→ 终期能力；一期日志完整性与不可删靠「无删除入口 + 仅追加」约束，验收报告如实注明。
- 打印机位置（docx 要求的"打印机位置"字段）→ 一期浏览器无法可靠取得，detail 记 `{printer:"(browser default)"}`，终期接 MES 打印服务补。
- 开关切换本身不记日志（参数变更事件属终期 MES 管理面）。
- 日志时区：occurredAt 用浏览器本地时间的 ISO 格式（含时区偏移），展示按本地格式化。
