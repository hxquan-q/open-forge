// Copyright The Open Forge contributors.

import { pathDirname, pathJoin, pathNormalize, toVettaFileUrl } from "@shared/lib/utils";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { FILE_PROTOCOL_SCHEME } from "@/shared/file-protocol";

/**
 * HTML 预览的文件来源与资源解析。
 *
 * `srcDoc` 继承的是宿主页面地址，HTML 里的相对资源会打到 Renderer 的 dev server 上；
 * 走 `vetta-file://`（ADR-0027）时 pathname 就是文件绝对路径，相对引用天然按真实目录解析。
 * 本模块只做纯计算：能否映射、引用了哪些资源、变化是否命中，便于单测与复用。
 */

const HTML_EXTENSIONS = new Set(["html", "htm", "xhtml"]);

/** 额外监听的资源目录上限：页面引用几百个资源时不能把监听器铺满。 */
export const MAX_PREVIEW_ASSET_DIRECTORIES = 8;

export function isHtmlPreviewExtension(extension: string): boolean {
	return HTML_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * 把预览来源映射成 `vetta-file://` URL。只接受本机绝对路径与 `ssh://` 项目路径；
 * http(s)、data、blob 等内容已经取回，继续用 `srcDoc`。
 */
export function previewFileUrl(sourcePath: string | undefined): string | undefined {
	const path = sourcePath?.trim();
	if (!path) return undefined;
	if (path.startsWith(`${FILE_PROTOCOL_SCHEME}://`)) return undefined;
	if (isSshProjectUri(path)) return toVettaFileUrl(path);
	// Windows 盘符、POSIX 绝对路径与 UNC 路径；相对路径没有可信基准目录，退回 srcDoc。
	if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\")) {
		return toVettaFileUrl(path);
	}
	return undefined;
}

const ATTRIBUTE_REFERENCE = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const CSS_URL_REFERENCE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi;

/**
 * 归一化一条被引用路径：去掉 `?query` 与 `#fragment`，忽略外链、协议相对地址与站内锚点。
 * 单个字母加冒号按 Windows 盘符处理，不当作 URL scheme。
 */
function cleanAssetReference(raw: string | undefined): string | undefined {
	const value = raw?.trim();
	if (!value) return undefined;
	if (value.startsWith("#") || value.startsWith("//")) return undefined;
	if (/^[A-Za-z]:[\\/]/.test(value)) return value;
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return undefined;
	const path = value.replace(/[?#].*$/, "");
	return path.length > 0 ? path : undefined;
}

/** 从 HTML 文本里提取 `src` / `href` 属性与 CSS `url(...)` 引用的路径，去重后返回。 */
export function extractPreviewAssetReferences(html: string): readonly string[] {
	const references = new Set<string>();
	for (const match of html.matchAll(ATTRIBUTE_REFERENCE)) {
		const cleaned = cleanAssetReference(match[1] ?? match[2] ?? match[3]);
		if (cleaned) references.add(cleaned);
	}
	for (const match of html.matchAll(CSS_URL_REFERENCE)) {
		const cleaned = cleanAssetReference(match[1] ?? match[2] ?? match[3]);
		if (cleaned) references.add(cleaned);
	}
	return [...references];
}

function sshOrigin(path: string): string | undefined {
	return /^ssh:\/\/[^/]+/.exec(path)?.[0];
}

function resolveAssetPath(baseDirectory: string, reference: string): string {
	if (/^[A-Za-z]:[\\/]/.test(reference) || reference.startsWith("\\\\")) return pathNormalize(reference);
	if (reference.startsWith("/")) {
		const origin = sshOrigin(baseDirectory);
		if (origin) return pathNormalize(`${origin}${reference}`);
		// 本机根相对路径在 Windows 上落到文件所在盘符的根。
		const drive = /^([A-Za-z]):[\\/]/.exec(baseDirectory);
		return pathNormalize(drive ? `${drive[1]}:${reference}` : reference);
	}
	return pathNormalize(pathJoin(baseDirectory, reference));
}

export interface PreviewAssets {
	/** 被引用资源的绝对路径（已归一化）。 */
	readonly paths: ReadonlySet<string>;
	/** 需要额外监听的资源目录（不含 HTML 自身目录，已去重并有上限）。 */
	readonly directories: readonly string[];
}

const NO_ASSETS: PreviewAssets = { paths: new Set(), directories: [] };

/** 解析 HTML 里被引用的资源，得到变化判定用的路径集合与需要监听的目录。 */
export function collectPreviewAssets(html: string, sourcePath: string | undefined): PreviewAssets {
	if (!html || !sourcePath || !previewFileUrl(sourcePath)) return NO_ASSETS;
	const baseDirectory = pathDirname(pathNormalize(sourcePath));
	const baseKey = pathNormalize(baseDirectory);
	const paths = new Set<string>();
	const directories = new Set<string>();
	for (const reference of extractPreviewAssetReferences(html)) {
		const resolved = resolveAssetPath(baseDirectory, reference);
		paths.add(resolved);
		const directory = pathNormalize(pathDirname(resolved));
		if (directory && directory !== baseKey) directories.add(directory);
	}
	return {
		paths,
		directories: [...directories].slice(0, MAX_PREVIEW_ASSET_DIRECTORIES),
	};
}

/**
 * 一次目录变化是否命中了被引用的资源。
 *
 * 主机能给出文件名时按「目录 + 文件名」精确比对；拿不到文件名（旧主机或远端监听）时，
 * 只对资源子目录保守判定，HTML 自身目录里的无文件名事件不动 iframe。
 */
export function matchesPreviewAssetChange(
	assets: PreviewAssets,
	directory: string,
	fileNames: readonly string[] | undefined,
): boolean {
	const directoryKey = pathNormalize(directory);
	if (fileNames && fileNames.length > 0) {
		return fileNames.some((name) => assets.paths.has(pathNormalize(pathJoin(directoryKey, name))));
	}
	return assets.directories.some((assetDirectory) => pathNormalize(assetDirectory) === directoryKey);
}
