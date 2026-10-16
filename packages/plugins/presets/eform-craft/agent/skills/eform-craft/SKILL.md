---
name: eform-craft
description: "电子表单工坊主手册（板块1·表单生成）：把用户上传的图片/PDF/Excel/Word 表单原件还原为可运行的小型表单应用六件套（schema.json + form.html 表单页 + index.html 列表页 + mock-data.json + form-spec.md + audit-log.jsonl 说明）。当用户上传表单类文件要求电子化、要求查看或修改已生成表单、或处于表单确认门时加载本技能。本技能也是三成员团队的共享契约权威源（§6 锚点/参数键/桩函数）。"
---
<!-- Copyright The Open Forge contributors. -->

# 电子表单工坊·板块1 表单生成（eform-craft）

目标：把用户上传的表单原件变成**可运行的小型表单应用**——列表页管数据记录，表单页填数据，数据有生命周期（草稿→已保存→已审核）。产物是六件套，经用户确认门定稿，支持自然语言修改循环。电子签与操作审计是两个独立版块，由队长按 schema 能力参数派工给 @esign / @eaudit 注入（§6 共享契约）。

核心定位：**页面按钮针对的是数据记录的增删查改**（新增/修改/删除数据、保存/提交审核/打印/导出），不是表单模板本身的增删查改；表单结构变更走会话内自然语言修改循环。

## 0. 统一规则（唯一权威源）

| 规则 | 值 |
|------|-----|
| **产物路径** | 一律 `<项目>/docs/eform/<slug>/`：schema.json / form.html / index.html / mock-data.json / form-spec.md / audit-log.jsonl（后两者仅审计启用时生成，见 §6；slug 为表单名的英文短横线式，同一表单修改循环写同一目录） |
| **写域** | 你只写 `docs/eform/**`；不改项目其他任何文件 |
| **确认门协议** | 见 §5（先落盘 → 对话区输出 form-spec.md 全文 → ask_user_question 极简卡；口头同意不算过关） |
| **受众铁律** | form-spec.md 与对话输出只用业务语言；schema.json / form.html / index.html 是实现产物不受此限 |
| **页面标准** | form.html 与 index.html 是一期交付的**实际表单应用**：按可部署的正式表单标准渲染（统一栅格/字号/间距/控件规格、分区层次分明，观感对齐主流企业表单系统），不是潦草原型；mock 只模拟后端取数，不是页面降级的借口 |
| **mock 纪律** | 模拟数据（模拟的是后端/档案数据源的返回值）一律虚构：组织用「示例组织A/B」、人员用「张三/李四」等通用占位名；金额数量用合理量级演示值；敏感字段（证件号等）用打码格式；**绝不使用可能真实的组织名/人名/编号** |
| **修订标记** | 门打回后的修改处标 `【修订 <日期>】`，schema.form.revision +1 |
| **F# 三体一致** | schema `fields[].id` ↔ form.html `data-fid` ↔ form-spec.md 字段清单行，同一编号处处同义 |
| **数据隔离** | 页面运行数据按 slug 隔离存 localStorage（键见 §6.3），互不串扰；页面页脚明示「演示数据存储于本机浏览器」 |

## 1. 识别合同与固定命名（从原件定型；字段语义见 `eform-fields-catalog` 技能）

字段类型的**完整定义**（值结构 / 存储形状 / 渲染控件 / 识别要点）以 `eform-fields-catalog` 技能为**唯一权威**，本节只定义**从原件识别类型**的标记，以及固定命名映射。活动文本按原件标记识别；无标记的活动区域默认 `string`。

**识别标记 → fieldType**：

| 标记 | fieldType | 说明 |
|------|-----------|------|
| `▇是 □否` | boolean | 是非二值 |
| `[文本]` | string | 自由文本 |
| `[长文本]` | string（多行） | 多行大段文本（备注/说明）；建议加此标记（终期登记进本表） |
| `[整数]` | int | 整数值 |
| `[小数,2]` | double（小数位类推 double/3…） | 带固定小数位的数值 |
| `[日期]` | date | 日期（yyyy-mm-dd） |
| `[长日期]` | datetime | 日期时间（yyyy-mm-dd 时分秒） |
| `[时点]` | time | 仅时刻（HH:mm）；建议加此标记（终期登记进本表） |
| `[组织]`/`[部门]`/`[品名]`/`[工序]`/`[人员]` | object | 基础资料（主数据引用，编码+名称）；原 org/dept/product/process/person-select 统一归此类 |
| `[电子签]` | signature | 签名框（由 @esign 版块实现，见 §6） |
| （有文本、无标记） | static-label | 固定标题文本（不可编辑） |

> 单据体（`entry`）/ 子单据体（`subEntry`）/ 下拉列表（`select`，固定短枚举）无文本标记，靠**结构识别**——判定规则见 `eform-fields-catalog` 技能 §2.2 / §3。

**固定命名映射**（label 命中左列任一同义词 → fieldName 严格取右列，空格原样保留）：

| label 同义词 | fieldName |
|--------------|-----------|
| 工序 / 生产工序 | F_Process |
| 批号 / 批次号 / 生产批号 | F_Lot Number |
| 品名 / 产品名称 | F_Product Name |
| 操作人 / 制单人 | F_Operator |
| 复核人 / 审核人 | F_Reviewer |
| 检验人员 / 检验员 / 质检人 | F_Quality Inspector |

未命中映射 → fieldName 为 null（终期由后端建模补）。

**固定标题 vs 活动区域**：原件中有文本且无类型标记的位置 = 固定标题文本；标题后面或下部的空白 = 该标题的活动字段区。

## 2. 阶段一：导入与识别

### 2.1 通道矩阵（按格式分流；工具以当前会话 available tools 为准）

| 原件格式 | 主通道 | 辅助 | 降级 |
|----------|--------|------|------|
| 图片 | read（视觉直读） | extract_text_from_img（文字密集时核对） | 无视觉能力 → 请用户改传 PDF |
| PDF | extract_text_from_pdf | render_pdf_page 后 read（视觉核对布局） | 扫描件无文本层 → 全走渲染视觉通道 |
| Word | doc_to_pdf 转 PDF 后走 PDF 通道 | — | 工具缺失 → 请用户导出 PDF 或截图 |
| Excel（.xlsx/.xlsm） | dataset_profile（结构画像） | — | .xls 或失败 → 请用户另存 .xlsx/.csv |
| csv/tsv | read | dataset_profile（大文件） | — |

### 2.2 识别作业要点

难以判定字段该落在哪一层（单据头 / 单据体 / 子单据体，还是单表流水）时，先现读 `eform-structure-templates`，对照其原样 JSON 范本确定结构原型与每个字段的层级归属（取分层思维，不照搬内容），并把结构判定写入 `form.layoutHint`；不要自创层级。

1. **先整体后局部**：先看清整页布局（表格网格 / 行式 / 分区流式），再逐格提取字段。
2. 表格类逐单元格过一遍；合并单元格（跨行/跨列）在 position 如实记录。
3. 拿不准的格位（字迹模糊、语义两可）→ 标 `【推断】`，确认门时请用户注意；完全无法辨认 → 停下问用户，**不猜**。
4. 每个可指认位置分配连续 F#（含 static-label，mock 为 none）。

## 3. 阶段二：生成六件套

### 3.1 schema.json（结构事实源，eform-schema-v2）

- 顶层 `form` + `fields[]`。
- `form`：slug / title / source{fileName,importedAt,channel} / revision / layoutHint / notes / **capabilities{signature,audit}** / **statusFlow**。
- `form.capabilities`（v2 新增，队长派工依据）：
  - `signature`：布尔，原件含 `[电子签]` 字段 → true（隐含）；用户明确要求加签 → true。
  - `audit`：布尔，默认 **false**；用户明确要求启用审计跟踪 → true。
- `form.statusFlow`：固定 `["draft","saved","approved"]`（数据记录生命周期，见 §3.2）。
- 每 field：id(F#) / section / label / fieldName / fieldType / required / span / position{row,col} / mock{mode,…} / remark。
- mock.mode：none | fixed | list（options） | formula（expr 引用其他 F#，如 "F3 - F4"） | sequence（格式模板如 "QJyyyyMMdd###"）。

### 3.2 数据记录模型与生命周期（页面的数据语义，写进 form.html/index.html）

**数据记录**（一条业务数据，如一张质检单的填写实例）：

```jsonc
{
  "recordId": "R1709123456789",        // R+时间戳，创建时生成，永不复用
  "status": "draft",                    // draft → saved → approved（单向）
  "createdAt": "2026-10-10T10:00:00",
  "createdBy": "演示用户",
  "savedAt": null, "approvedAt": null, "approvedBy": null,
  "values": { "F1": "注塑", "F2": 128.5 },   // 按 F# 存活动字段值
  "signatures": { }                     // 签名数据（@esign 版块写入，结构见 esign-craft 技能）
}
```

**生命周期规则**（页面上必须机械执行）：

| 状态 | 进入方式 | 允许的操作 |
|------|----------|-----------|
| （无）→ draft | 列表页「新增」或表单页首次保存 | 填写、编辑、删除 |
| draft → saved | 表单页「保存」 | 编辑、保存、提交审核、打印、导出、删除 |
| saved → approved | 表单页「提交审核」通过 | **只读**：打印、导出、查看；字段与签名全部锁定，无删除 |

- approved 是终态：页面拒绝一切编辑与签名操作，提示「已审核锁定」。
- 每条记录独立走生命周期；删除仅 draft/saved 可用。
- 状态迁移只能由对应按钮触发（保存/提交审核），页面不得隐式变更状态。

### 3.3 form.html（表单页，一期交付的实际表单页面）

1. **单文件自包含**：内联 CSS/JS，无外部依赖，双击即开。
2. **按正式表单页面标准渲染**：统一栅格与字号体系、分区层次分明、控件规格对齐主流企业表单系统（Vue + Element/AntD 风格的观感）；mock 只替代后端取数，页面质量不因数据是模拟的而降级。
3. **参照原件布局还原**：网格用 table（含合并单元格），行式用表单流；布局结构以原件为准，视觉规格按正式页面标准执行。
4. 活动字段按 `eform-fields-catalog` 技能规定的控件范式渲染；每控件带 `data-fid="F#"` 与紧邻灰字「类型:取值方式」标注（placeholder 或旁注；placeholder 被填充顶掉时写入 title）。
5. mock 层内嵌文件尾部单一全局变量（与 mock-data.json 完全一致；模拟的是后端/档案数据源的返回值）：

   ```html
   <!-- MOCK-DATA-SOURCE: mock-data.json（终期替换为 API/MCP 取数，只动此层） -->
   <script>window.__EFORM_MOCK__ = { … };</script>
   ```

6. **数据生命周期按钮条**（表单底部固定操作区）：`保存` `提交审核` `打印` `导出`，按 §3.2 状态机启用/禁用；URL 带 `?recordId=` 时载入对应记录，无参时开新草稿。
7. formula 字段做 JS 实时联动（改被引用字段即重算）；sequence 字段按格式模板生成演示单号。
8. signature 字段渲染为签名占位框（`data-fid` 照带）；capabilities.signature=true 时由 @esign 在锚点注入签名组件替换占位（§6.2），注入前占位框文案「电子签（待签名组件注入）」。
9. **组件注入锚点**（form.html 生成时必须写入，@esign/@eaudit 依此注入）：

   ```html
   <!-- ESIGN-ANCHOR: signature components inject here (do not remove) -->
   <!-- AUDIT-ANCHOR: audit components inject here (do not remove) -->
   ```

   两个锚点注释放在 `</body>` 前的独立行；**无论 capabilities 开关与否，锚点一律写**（未启用的能力锚点保留占位，启用时才注入）。
10. 桌面表单默认 1200px 宽；移动表单 viewport 适配。页脚一行小字：「演示应用：数据存储于本机浏览器（localStorage），清除浏览器数据将丢失。」

### 3.4 index.html（列表页，数据记录管理）

1. **单文件自包含**，与 form.html 同一套视觉规格（栅格/字号/控件/配色）。
2. **顶部工具条**：表单标题 + 「新增」按钮（打开 form.html 无参新草稿）+ 返回说明。
3. **数据列表**（每行一条记录）：单号（sequence 首字段值或 recordId）、创建时间、创建人、状态徽章（草稿/已保存/已审核，三色区分）、操作列（`修改` 打开 form.html?recordId=…、`删除` draft/saved 可用、`查看` approved 只读打开）。
4. **状态筛选**（全部/草稿/已保存/已审核）+ 简单分页（每页 10 条）；数据来自同一 localStorage 存储（§6.3 键规范），与 form.html 实时同源。
5. 列表为空时展示空态引导（「尚无数据，点新增开始填写」）。
6. **审计入口**：capabilities.audit=true 且已注入审计组件时，工具条出现「操作日志」按钮（@eaudit 注入，见 eaudit-craft 技能）；未启用时不渲染该按钮。

### 3.5 mock-data.json

按 F# 键组织，与 form.html 内嵌层完全一致（终期换数层的对照基准）。

### 3.6 form-spec.md（用户核对文档，业务语言）

节结构：1 来源与还原说明 / 2 字段清单（F# 表：所属区、标签、类型、控件、字段名、取值方式(演示)、依据）/ 3 数据生命周期与页面功能（列表页按钮、表单页按钮、状态规则，业务语言）/ 4 版块能力（电子签、操作审计是否启用及入口）/ 5 验收标准（A#）/ 6 范围外（本期不做真实鉴权/真实存储/MES 部署/真实取数）/ 修订记录。状态行：草案 → 待确认 → 已批准（<日期>，ask_user_question）。推断标【推断】。

## 4. 派工判定（队长执行；注入细则在各专员技能）

| 条件 | 动作 |
|------|------|
| capabilities.signature=true | 队长确认门通过后，派工 @esign：在 form.html 的 ESIGN-ANCHOR 注入签名组件（含 signature 字段占位替换） |
| capabilities.audit=true | 队长确认门通过后，派工 @eaudit：在 form.html 与 index.html 的 AUDIT-ANCHOR 注入审计组件，并生成 audit-log.jsonl 初始文件 |
| 修改循环重生成 form.html/index.html | 队长重写页面（锚点照写）→ 按 capabilities 重新派工两位专员重新注入（注入是幂等的：以锚点为界整体替换组件块） |
| capabilities 均为 false | 不派工；锚点保留；signature 字段保持占位框文案「电子签（未启用）」 |

派工使用 team_delegate_task，objective 必须自包含：表单目录绝对/项目相对路径、slug、schema 路径、目标页面路径、注入锚点名、本次注入范围。专员完成报告后队长验收（锚点完整、无结构破坏、合同测试要点）。

## 5. 阶段三：用户确认门（必经）

1. 六件套（或未启用审计时五件套）落盘（form-spec.md 状态 `待确认`）。
2. 对话区完整输出 form-spec.md 全文 + 告知 index.html / form.html 路径（用户双击核对：列表页开新草稿、填写、保存、提交审核全链路）。
3. ask_user_question 弹极简卡：问题一句话；选项 `批准` / `需要修改（F# 指认修改点）`；detail 三行（产物路径 / 字段数一句 / 待决项含电子签与审计启用状态）。
4. 需要修改 → 按指认改 schema（revision+1）→ 重新生成页面 → 修订处标【修订】→ 重新输出 + 再弹卡。
5. 批准 → form-spec.md 状态 `已批准`；capabilities 有 true 项时按 §4 派工注入，专员完成后汇报产物清单收尾。
6. 批准后的实质变更（影响字段清单/生命周期/版块能力）重新过门。

## 6. 共享契约（三成员唯一权威源；esign-craft / eaudit-craft 技能引用本节，不得重述或擅改）

### 6.1 锚点

| 锚点（HTML 注释，独立一行） | 所在文件 | 用途 |
|------------------------------|----------|------|
| `<!-- ESIGN-ANCHOR: signature components inject here (do not remove) -->` | form.html（`</body>` 前） | @esign 注入签名组件（CSS+JS+弹窗模板），以锚点注释为界整体替换 |

form.html 的 AUDIT-ANCHOR 与 index.html 的注入位约定：index.html 由 @eaudit 在工具条「审计入口」位置之后与 `</body>` 前注入（index.html 生成时在工具条末尾写 `<!-- AUDIT-ANCHOR: audit components inject here (do not remove) -->` 一行）；form.html 的 AUDIT-ANCHOR 同 ESIGN-ANCHOR 放法。注入一律幂等（重复注入先移除旧块再写新块），不改动锚点行本身与页面其他内容。

### 6.2 签名占位与替换（form.html 生成方与 @esign 的交接）

- form.html 生成时：每个 signature 字段渲染 `<div class="eform-sig-slot" data-fid="F#" data-sig="empty">…占位文案…</div>`。
- @esign 注入后：占位 div 获得 click 行为与签名状态渲染（empty→pending→signed），data-sig 属性同步状态；组件样式类名前缀 `eform-esign-`。
- 未注入（capability=false）：占位 div 保持静态文案，不响应点击。

### 6.3 运行数据键规范（localStorage，全部前缀 `eform:<slug>:`）

| 键 | 内容 | 写者 |
|----|------|------|
| `eform:<slug>:records` | 数据记录数组（§3.2 结构） | form.html / index.html（记录 CRUD）；@esign 仅写 records[].signatures |
| `eform:<slug>:auditEnabled` | `"true"` / `"false"`（字符串），缺省 false | @eaudit（参数开关，页面开关切换写回） |
| `eform:<slug>:audit-log` | 审计日志行数组（结构见 eaudit-craft 技能） | 仅 @eaudit（追加，不删） |

### 6.4 页面桩函数（form.html/index.html 生成时必须内置；专员组件只调用不得重定义）

```js
window.EFORM = {
  slug,                              // 当前表单 slug
  schema,                            // 解析后的 schema.json 对象
  getRecord(recordId) => record|null,
  saveRecord(record) => void,        // 整记录写回 records 数组
  listRecords() => record[],
  recordStatus(recordId) => "draft"|"saved"|"approved"|null,
  lockIfApproved(recordId) => boolean, // approved 时禁用编辑并返回 true
};
```

审计埋点约定：专员组件通过监听页面事件而非改写按钮逻辑实现（@eaudit 技能定义事件名 `eform:audit:create` `eform:audit:save` `eform:audit:approve` `eform:audit:print` `eform:audit:export`，detail 携带 recordId）；**form.html/index.html 生成时必须在对应按钮处理器内 dispatch 这五个 CustomEvent**（audit 未启用时事件照发，无监听即无副作用）。

### 6.5 audit-log.jsonl（落盘文件）

capabilities.audit=true 时目录内存在 `audit-log.jsonl`：初始内容为空文件（或首行注释 `{"_note":"audit journal - append only"}`）。它是运行期 localStorage 日志的**导出落点**（@eaudit 组件提供「导出日志」把 localStorage 全量日志下载为该文件名），不是页面直写文件；会话中用户要求同步落盘时由队长/专员读取 localStorage 内容写入。

## 7. 阶段四：自然语言修改循环

用户在会话中以自然语言提出修改（改字段类型、增删字段、调布局、换演示数据、启停版块能力）：定位到 schema 对应 field 或 form.capabilities → 修改 → revision+1 → 重新生成 form.html/index.html/mock-data.json/form-spec.md → 若 capabilities 有 true 项按 §4 重新派工注入 → 差异摘要（只列改动行）→ 再过门。**schema 是唯一结构事实源，永不出现 schema 与页面各改各的**。

## 8. 边界与异常

- 识别质量不足（歪斜/裁切/模糊）→ 停下说明，请用户补件，不猜。
- 多页表单：同一表单的多页进同一 slug 目录，form.html 按 section 分区块（每页一 section）。
- 用户要求真实鉴权/真实存储/MES 部署/MCP 取数 → 明确告知为终期能力：签名验证是演示账号本地比对（页面明示「演示验证」），数据存本机浏览器 localStorage；终期整体替换为 MES 鉴权与后端存储，结构层不动。
- 上传件与「表单」无关（如照片、合同全文）→ 说明本技能边界，问用户是否仍要强行还原。

## 9. 演进注记（终期映射，本期只留钩子不实现）

- fieldType 枚举（含 `entry`/`subEntry`/`object`/`time` 等，权威定义见 `eform-fields-catalog` 技能）即 Vue 控件选型单；schema.json 是将来 Vue 代码生成器的输入；`eform-structure-templates` 的结构范本 JSON 即生成器的结构输入。
- fieldName（F_Process 等）是 Java 后端字段名。
- `window.__EFORM_MOCK__` 层终期整体替换为 API/MCP 取数；localStorage 层终期替换为后端存储；签名验证终期替换为 MES 鉴权——三处都只动数据层，结构层不动。
- docs/eform/<slug>/ 一表单一目录，即一份可独立打包的静态资源单元。
