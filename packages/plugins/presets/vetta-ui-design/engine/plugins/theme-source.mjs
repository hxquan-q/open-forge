// Copyright The Open Forge contributors.

/** Only the root canvas manifest is bookkeeping; nested JSON may be design data. */
export function isDesignManifest(relativePath) {
	const path = relativePath.replaceAll("\\", "/");
	return path === "design.json" || path.startsWith("design.json.tmp-");
}

/** Keep source discovery shared by the materialized engine and its HMR fixture. */
export function vetdThemeSource(designRootPosix) {
	return {
		name: "vetd-theme-source",
		enforce: "pre",
		transform(code, id) {
			if (!id.replaceAll("\\", "/").endsWith("src/styles.css")) return null;
			// Layout/viewport persistence is not design source and must not trigger HMR.
			return code.replace(
				"/*__VETD_SOURCE__*/",
				`@source "${designRootPosix}";\n@source not "${designRootPosix}/design.json";\n@source not "${designRootPosix}/design.json.tmp-*";`,
			);
		},
	};
}
