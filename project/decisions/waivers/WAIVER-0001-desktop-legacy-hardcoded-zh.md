---
id: WAIVER-0001
rule: apps/desktop/AGENTS.md §7 i18n「面向用户的文案一律不硬编码」
status: active
owner: apps/desktop
reason: 历史域（chat、file-explorer、pet 等）存在存量硬编码中文，全量抽离是大面积文档级改动，按 AGENTS.md 既有增量策略推进而非一次性重写
risk: 存量文案在 zh/en 外的新语言下不可译；拖延越久抽离成本越高
compensation: 任何新增或修改到的用户可见文案必须走 i18n；改到含硬编码文案的文件时顺手抽离该文件；不得新增模块级中文常量
created: 2026-09-24
expires: 2026-12-31
---
<!-- Copyright The Open Forge contributors. -->

# 桌面端存量硬编码中文文案豁免

## 适用范围

`apps/desktop/src/renderer/**` 中在豁免登记前已存在的硬编码中文文案。**新增**文案与**新文件**不在豁免范围。

## 复审

到期前由 `apps/desktop` owner 评估剩余量：已抽离完毕→置 `resolved`；仍需延期→新建 waiver 并附剩余规模证据。
