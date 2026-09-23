// Modified by The Open Forge contributors.
import { createRequire } from "node:module";

const desktopBrand = createRequire(import.meta.url)("../src/shared/desktop-brand.json");

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
