---
id: REQ-0011
type: requirement
status: ready
priority: P1
owner: release/desktop
source: user-request（2026-10-10：dev 启动与打包统一换成小爱ai / Allstr ai）
related_plan: []
related_tasks: [TASK-0224]
created: 2026-10-10
updated: 2026-10-10
---
<!-- Copyright The Open Forge contributors. -->

# 品牌档案默认口径（dev 与打包 = 外部分发）

## 用户问题

仓库已有两套品牌档案（构建期开关 `VETTA_BRAND_PROFILE`）：`self`（Open Forge，`desktop-brand.json`）与 `distribution`（英文 Allstr ai / 中文界面小爱ai，`desktop-brand.distribution.json`）。此前默认为 `self`，dev 启动与打包要呈现小爱ai / Allstr ai 必须显式设置开关。用户要求 dev 启动与打包统一换成小爱ai / Allstr ai。

## 用户结果

不设置任何环境变量时，dev 启动与打包（含产品名、窗口标题、界面文案、页面图标、打包图标与安装器身份）默认呈现小爱ai / Allstr ai；需要 Open Forge 口径时显式 `VETTA_BRAND_PROFILE=self` 回到原默认行为。两档继续共用冻结的兼容标识（可执行名 / appId / bundleId / 数据目录 / 协议 / 升级 AppId），切换口径零迁移。

## 范围

- 翻转默认档解析：未设置 `VETTA_BRAND_PROFILE` 时按 `distribution` 处理；选择机制保留，`self` 成为显式可选项。
- 全链对齐同一开关：renderer / main 构建期 define、运行时共享品牌层（`desktop-brand.ts`）、打包（产品名、安装器身份、图标覆盖）、dev 辅助脚本（appshot helper、UI 验证窗口匹配）与打包辅助元数据（插件包文件关联、Linux 包元数据）都随档位选源。
- 六个 renderer 静态 HTML 标题更新为默认（distribution）口径；运行时标题继续按档案与界面语言生成。

## 不做什么

- 不改两档品牌文案与图标资产本身（`desktop-brand*.json`、`brand-assets/`、`build/brand/distribution/` 与 `gen-brand-icons` 生成链保持原样）。
- 不改任何兼容标识（executableName / appId / bundleId / 数据目录 / 协议 / `.vettapkg`）与更新通道配置。
- 不改 i18n post-processor 归一语义，不新增或删除环境变量。
- 不执行打包发版、发布与上传；docs-site / mobile 的三花猫品牌资产不在范围。

## Given / When / Then

1. Given 未设置 `VETTA_BRAND_PROFILE`，When dev 启动或打包，Then 应用名、界面文案、窗口标题、页面图标与打包产品名、安装包文件名、安装器身份呈现 Allstr ai（中文界面小爱ai）。
2. Given 显式 `VETTA_BRAND_PROFILE=self`，When dev 启动或打包，Then 回到 Open Forge 品牌与图标，与切换前默认行为一致。
3. Given 任一档位，When 检查兼容标识与用户数据，Then 可执行名、appId、bundleId、数据目录、协议、升级 AppId 不变，不需要迁移。

## 必须保持

- 两档归一规则（Open Vetta / Vetta / Open Forge → 当前档展示名）与 i18n post-processor 语义不变。
- 打包图标覆盖只作用于暂存 `build/`，四个文件名不变。
- `gen-brand-icons` 的字节级复现合同与品牌资产入库可复现性。
- 静态标题与运行时标题分工：静态只覆盖默认口径，运行时按档案与语言覆盖。

## 验收标准

由 TASK-0224 验证：单元用例（未设置 = distribution、显式 self = Open Forge、显式 distribution）、打包辅助脚本 node 测试（文件关联 / Linux 元数据随档）、图标复现合同、质量门禁与完整 `bun run check`；真实 dev 界面与打包产物的用户验收另行反馈。

## 风险与失效条件

默认档翻转改变本仓默认构建的对外身份：打包产物文件名（如 `Allstr ai-<版本>-win-x64.exe`）与更新元数据中的文件名随之变化，已发布 Open Forge 安装的更新检查将以新文件名为准；如需维持 Open Forge 发布口径，应显式 `VETTA_BRAND_PROFILE=self` 或翻转回默认。非 Desktop 品牌面（docs-site、mobile）不随本需求变化。
