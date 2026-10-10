// Copyright The Open Forge contributors.
import { join } from "node:path";
import { DESKTOP_BRAND_PROFILE, type DesktopBrandProfile } from "../shared/desktop-brand.js";

/**
 * 主进程窗口 / 托盘 / Dock / 通知图标的源目录。
 *
 * 打包态沿用暂存目录（prepare-pack 已按品牌档案覆盖 `build/icon.*`，目录恒定）；
 * dev 态没有覆盖步骤，按品牌档案解析：默认外部分发档取
 * `build/brand/distribution/`，显式 `VETTA_BRAND_PROFILE=self` 取 `build/`。
 */
export function resolveBrandIconDirectory(options: {
	isPackaged: boolean;
	packagedDirectory: string;
	appRoot: string;
	profile?: DesktopBrandProfile;
}): string {
	const { isPackaged, packagedDirectory, appRoot, profile = DESKTOP_BRAND_PROFILE } = options;
	if (isPackaged) return packagedDirectory;
	return profile === "distribution" ? join(appRoot, "build", "brand", "distribution") : join(appRoot, "build");
}
