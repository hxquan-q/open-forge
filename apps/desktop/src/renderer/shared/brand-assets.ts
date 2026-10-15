// Modified by The Open Forge contributors.
// 品牌档案对应的 renderer 图标资产。按构建期档位常量选择，未选中的 import
// 经常量折叠后不进产物（与 desktop-brand.ts 同一套 VETTA_BRAND_PROFILE define）。
// 主进程窗口/托盘/Dock 等系统图标同样按档案解析，见 src/main/brand-icon-directory.ts。
import distributionIcon from "@/shared/brand-assets/distribution/brand-icon.png";
import selfIcon from "@/shared/brand-assets/self/brand-icon.png";
import { DESKTOP_BRAND_PROFILE } from "@/shared/desktop-brand";

/** 当前品牌口径的应用图标 URL：自用 = Open Forge 图标，外部分发 = Allstr ai 图标。 */
export const brandIconUrl = DESKTOP_BRAND_PROFILE === "distribution" ? distributionIcon : selfIcon;
