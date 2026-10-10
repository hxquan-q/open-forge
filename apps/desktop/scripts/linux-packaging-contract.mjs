// Modified by The Open Forge contributors.
import { createRequire } from "node:module";

// 品牌档案与主链同开关（VETTA_BRAND_PROFILE）：默认外部分发档，显式 self 回 Open Forge。
const desktopBrand = createRequire(import.meta.url)(
	process.env.VETTA_BRAND_PROFILE === "self"
		? "../src/shared/desktop-brand.json"
		: "../src/shared/desktop-brand.distribution.json",
);

export const LINUX_RELEASE_TARGETS = Object.freeze(["AppImage", "deb", "rpm"]);

export const LINUX_RELEASE_EXTENSIONS = Object.freeze([".AppImage", ".deb", ".rpm"]);

export const LINUX_PACKAGE_METADATA = Object.freeze({
	author: Object.freeze({
		name: desktopBrand.displayName,
		email: "hxquan-q@users.noreply.github.com",
	}),
	homepage: "https://github.com/hxquan-q/open-forge",
	license: "Apache-2.0",
	maintainer: `${desktopBrand.displayName} <hxquan-q@users.noreply.github.com>`,
	vendor: desktopBrand.displayName,
});
