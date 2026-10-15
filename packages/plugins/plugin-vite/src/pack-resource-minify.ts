// Modified by The Open Forge contributors.
/**
 * `.vettapkg` 内容层优化：打包时对包内 JSON 资源去空白。
 *
 * 对应 VS Code 构建期对内置扩展 JSON/`.code-snippets` 资源的去空白处理
 * （`build/lib/extensions.ts`）。只处理**进入归档的字节**，源文件保持原样；
 * 包格式、安装协议与清单字段语义都不变（`PLUGIN_API_VERSION` 兼容面不变）。
 */

/** 只对 JSON 语义的资源做去空白：清单、能力描述、i18n catalog、代码片段等。 */
const JSON_RESOURCE_EXTENSIONS = [".json", ".code-snippets"];

export function isPackagedJsonResource(archivePath: string): boolean {
	const lower = archivePath.toLowerCase();
	return JSON_RESOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * 去空白失败或收益为负时原样返回：非严格 JSON（注释、尾逗号）与已压缩内容
 * 都不该被改写，宁可多带几个字节也不冒改坏插件的风险。
 */
export function minifyPackagedJsonResource(archivePath: string, data: Buffer): Buffer {
	if (!isPackagedJsonResource(archivePath)) return data;
	let minified: string | undefined;
	try {
		minified = JSON.stringify(JSON.parse(data.toString("utf-8")));
	} catch {
		return data;
	}
	if (minified === undefined) return data;
	const minifiedBytes = Buffer.from(minified, "utf-8");
	return minifiedBytes.length < data.length ? minifiedBytes : data;
}
