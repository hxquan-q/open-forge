<!-- Copyright The Open Forge contributors. -->
# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

> 与 [`project/requirements/PRODUCT.md`](project/requirements/PRODUCT.md) 的 `## Platform` 保持一致，
> 权威值以该文件为准。工具读不到本节会判定 platform 未知，并跳过对应的原生平台指引。

## 产品定义入口

产品定义的**权威正文**是 [`project/requirements/PRODUCT.md`](project/requirements/PRODUCT.md)：
Users、Product Purpose、Positioning、Operating Context、Capabilities and Constraints、
Brand Commitments、Evidence on Hand、Product Principles、Accessibility & Inclusion 全部在该文件。

本文件是根目录**发现入口**（约定见 `project/CONVENTIONS.md` 第 27 行），不承载独立的产品事实；
新增或修改产品需求一律编辑上述权威文件，避免出现第二份权威。

## 工具读取提示

Impeccable 的 `context` 只解析 `PROJECT_ROOT/PRODUCT.md`，且不支持自定义产品路径
（`.impeccable/config.json` 只接受 `buildPath`）。因此在 `apps/desktop` 等子应用里工作时，
本入口只能提供 `## Platform`，**产品正文不会被加载**：需要产品上下文的 Agent 必须显式读取
`project/requirements/PRODUCT.md`。

桌面端视觉权威为 `apps/desktop/DESIGN.md` 与 `apps/desktop/.impeccable/surfaces/`。
