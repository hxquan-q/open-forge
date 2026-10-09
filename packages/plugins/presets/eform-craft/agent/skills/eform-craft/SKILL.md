---
name: eform-craft
description: "电子表单工坊主手册：把用户上传的图片/PDF/Excel/Word 表单原件还原为可交互电子表单（schema.json + preview.html + mock-data.json + form-spec.md 四件套）。当用户上传表单类文件要求电子化、要求查看或修改已生成表单、或处于表单确认门时加载本技能。"
---
<!-- Copyright The Open Forge contributors. -->

# 电子表单工坊（eform-craft）

目标：把用户上传的表单原件变成「结构 schema + 可交互 HTML 预览 + mock 演示数据 + 字段规格文档」四件套，经用户确认门定稿，支持自然语言修改循环。一期不做真实签名、审计、MES 部署与真实数据接入——这些只在产物里留钩子。

## 0. 统一规则（唯一权威源）

| 规则 | 值 |
|------|-----|
| **产物路径** | 一律 `<项目>/docs/eform/<slug>/`：schema.json / preview.html / mock-data.json / form-spec.md（slug 为表单名的英文短横线式，同一表单修改循环写同一目录） |
| **写域** | 你只写 `docs/eform/**`；不改项目其他任何文件 |
| **确认门协议** | 见 §4（先落盘 → 对话区输出 form-spec.md 全文 → ask_user_question 极简卡；口头同意不算过关） |
| **受众铁律** | form-spec.md 与对话输出只用业务语言；schema.json / preview.html 是实现产物不受此限 |
| **mock 纪律** | 演示数据一律虚构：组织用「示例组织A/B」、人员用「张三/李四」等通用占位名；金额数量用合理量级演示值；敏感字段（证件号等）用打码格式；**绝不使用可能真实的组织名/人名/编号** |
| **修订标记** | 门打回后的修改处标 `【修订 <日期>】`，schema.form.revision +1 |
| **F# 三体一致** | schema `fields[].id` ↔ preview.html `data-fid` ↔ form-spec.md 字段清单行，同一编号处处同义 |

## 1. 类型系统与固定命名（识别合同）

**类型标记 → 字段类型**（活动文本按原件标记识别；无标记的活动区域默认 text）：

| 标记 | fieldType | 控件 |
|------|-----------|------|
| `▇是 □否` | boolean-radio | 是/否两个单选框 |
| `[文本]` | text | 文本输入（容量不少于 256） |
| `[日期]` | date | 日期（yyyy-mm-dd） |
| `[长日期]` | datetime | 日期时间（yyyy-mm-dd 时分秒） |
| `[整数]` | integer | 整数输入 |
| `[小数,2]` | decimal-2（小数位类推 decimal-3…） | 小数输入（对应位数） |
| `[组织]` | org-select | 下拉（组织） |
| `[部门]` | dept-select | 下拉（部门） |
| `[品名]` | product-select | 下拉（品名） |
| `[工序]` | process-select | 下拉（工序） |
| `[人员]` | person-select | 下拉（人员） |
| `[电子签]` | signature | 签名占位框（终期能力，本期占位） |
| （有文本、无标记） | static-label | 固定标题文本（不可编辑） |

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

1. **先整体后局部**：先看清整页布局（表格网格 / 行式 / 分区流式），再逐格提取字段。
2. 表格类逐单元格过一遍；合并单元格（跨行/跨列）在 position 如实记录。
3. 拿不准的格位（字迹模糊、语义两可）→ 标 `【推断】`，确认门时请用户注意；完全无法辨认 → 停下问用户，**不猜**。
4. 每个可指认位置分配连续 F#（含 static-label，mock 为 none）。

## 3. 阶段二：生成四件套

### 3.1 schema.json（结构事实源，eform-schema-v1）

- 顶层 `form`（slug/title/source/revision/layoutHint/notes）+ `fields[]`。
- 每 field：id(F#) / section / label / fieldName / fieldType / required / span / position{row,col} / mock{mode,…} / remark。
- mock.mode：none | fixed | list（options） | formula（expr 引用其他 F#，如 "F3 - F4"） | sequence（格式模板如 "QJyyyyMMdd###"）。

### 3.2 preview.html（可交互还原预览）

1. **单文件自包含**：内联 CSS/JS，无外部依赖，双击即开。
2. **参照原件布局还原**：网格用 table（含合并单元格），行式用表单流；结构正确优先于美观。
3. 活动字段渲染为 §1 控件；每控件带 `data-fid="F#"` 与紧邻灰字「类型:取值方式」标注（placeholder 或旁注；placeholder 被填充顶掉时写入 title）。
4. mock 层内嵌文件尾部单一全局变量（与 mock-data.json 完全一致）：

   ```html
   <!-- MOCK-DATA-SOURCE: mock-data.json（终期替换为 API/MCP 取数，只动此层） -->
   <script>window.__EFORM_MOCK__ = { … };</script>
   ```

5. 顶部工具条：「填充演示数据」「重置」两按钮。
6. formula 字段做 JS 实时联动（改被引用字段即重算）；sequence 字段按格式模板生成演示单号。
7. signature 渲染为虚线占位框，文案「电子签（终期能力，本期占位）」。
8. 桌面表单默认 1200px 宽；移动表单 viewport 适配。

### 3.3 mock-data.json

按 F# 键组织，与 preview.html 内嵌层完全一致（终期换数层的对照基准）。

### 3.4 form-spec.md（用户核对文档，业务语言）

节结构：1 来源与还原说明 / 2 字段清单（F# 表：所属区、标签、类型、控件、字段名、取值方式(演示)、依据）/ 3 验收标准（A#）/ 4 范围外（本期不做真签名、审计、MES 部署、真实数据）/ 修订记录。状态行：草案 → 待确认 → 已批准（<日期>，ask_user_question）。推断标【推断】。

## 4. 阶段三：用户确认门（必经）

1. 四件套落盘（form-spec.md 状态 `待确认`）。
2. 对话区完整输出 form-spec.md 全文 + 告知 preview.html 路径（用户双击核对交互）。
3. ask_user_question 弹极简卡：问题一句话；选项 `批准` / `需要修改（F# 指认修改点）`；detail 三行（产物路径 / 字段数一句 / 待决项）。
4. 需要修改 → 按指认改 schema（revision+1）→ 重新生成三件 → 修订处标【修订】→ 重新输出 + 再弹卡。
5. 批准 → form-spec.md 状态 `已批准`，汇报产物清单收尾。
6. 批准后的实质变更（影响字段清单/验收标准）重新过门。

## 5. 阶段四：自然语言修改循环

用户在会话中以自然语言提出修改（改字段类型、增删字段、调布局、换演示数据）：定位到 schema 对应 field → 修改 → revision+1 → 重新生成 preview/mock/spec → 差异摘要（只列改动行）→ 再过门。**schema 是唯一结构事实源，永不出现 schema 与 preview 各改各的**。

## 6. 边界与异常

- 识别质量不足（歪斜/裁切/模糊）→ 停下说明，请用户补件，不猜。
- 多页表单：同一表单的多页进同一 slug 目录，preview.html 按 section 分区块（每页一 section）。
- 用户要求真签名/审计/部署/MCP 取数 → 明确告知为终期能力，本期只留钩子（fieldName 映射、mock 层隔离），不做任何实现。
- 上传件与「表单」无关（如照片、合同全文）→ 说明本技能边界，问用户是否仍要强行还原。

## 7. 演进注记（终期映射，本期只留钩子不实现）

- fieldType 枚举即 Vue 控件选型单；schema.json 是将来 Vue 代码生成器的输入。
- fieldName（F_Process 等）是 Java 后端字段名。
- preview.html 的 `window.__EFORM_MOCK__` 层终期整体替换为 API/MCP 取数，结构层不动。
- docs/eform/<slug>/ 一表单一目录，即一份可独立打包的静态资源单元。
