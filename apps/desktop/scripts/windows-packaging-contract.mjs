// Modified by The Open Forge contributors.
import { createRequire } from "node:module";

const desktopBrand = createRequire(import.meta.url)(
	process.env.VETTA_BRAND_PROFILE === "self"
		? "../src/shared/desktop-brand.json"
		: "../src/shared/desktop-brand.distribution.json",
);
// 构建后统一把产物名空格规范为连字符（run-electron-builder），契约必须用同一 slug。
const ARTIFACT_BRAND = desktopBrand.displayName.replaceAll(" ", "-");

export const WINDOWS_RELEASE_TARGETS = Object.freeze(["inno", "msi", "zip"]);

export const WINDOWS_SUPPLEMENTAL_EXTENSIONS = Object.freeze([".msi", ".zip"]);

export function windowsSupplementalArtifactNames(version) {
	return WINDOWS_SUPPLEMENTAL_EXTENSIONS.map((extension) => `${ARTIFACT_BRAND}-${version}-win-x64${extension}`);
}
