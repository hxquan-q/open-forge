// Copyright The Open Forge contributors.
import { extname } from "node:path";
import { encodeCanvasWorkspaceBucket } from "../artifacts/canvas-paths.js";

/**
 * Canvas 回环预览的 URL ↔ 磁盘路径合同（纯函数）。
 *
 * 预览页运行在浏览器的语境里，输入完全不可信：这里只按字面合同解析 URL
 * （`/canvas/<workspaceToken>/<artifactId>/index.html`），凡是需要浏览器归一化、
 * 二次解码或跨目录推断的写法一律拒绝，而不是尝试"修好"它。文件系统侧还有一道
 * realpath 包含性校验，见 canvas-preview-server.ts。
 */

export const CANVAS_PREVIEW_ROUTE_PREFIX = "/canvas";

/** 入口别名：始终指向该 artifact 的最新 HTML 版本文件。 */
export const CANVAS_PREVIEW_ENTRY_FILE = "index.html";

/** 预览是本地只读内容，不允许被页面或中间层缓存成"上一版"。 */
export const CANVAS_PREVIEW_CACHE_CONTROL = "no-store";

/**
 * 画布根下的 bucket 名，即 `encodeCanvasWorkspaceBucket` 的 base64url 结果。
 *
 * URL 里放编码后的 bucket 而不是 workspaceId 原文：Windows 的工作空间是
 * `C:\...` 这类绝对路径，塞进路径段必须先转义，而且会把本机目录结构暴露给页面。
 */
const WORKSPACE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
/** 与 `../artifacts/canvas-paths.ts` 的 artifactId 规则一致；此处只做只读校验，不抛异常。 */
const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** 版本文件名（如 `v3.html`）：与 `CanvasStore.versionPath` 写出的名字同形。 */
const VERSION_FILE_PATTERN = /^v(\d+)\.[A-Za-z0-9]+$/;
/** 可以作为入口的扩展名；同一版本出现多个时按这个顺序固定取第一个。 */
const HTML_EXTENSION_RANK: Readonly<Record<string, number>> = { ".html": 0, ".htm": 1, ".xhtml": 2 };

/** 解码后仍带这些字符，说明 URL 想借编码或分隔符跳到别的目录。 */
const UNSAFE_DECODED_CHARS = /[\\/%\u0000-\u001f\u007f]/;

export interface CanvasPreviewRequestTarget {
	readonly workspaceToken: string;
	readonly artifactId: string;
	readonly file: string;
}

/**
 * `outside-route` 表示请求根本不在画布路由下（等同于"没有这个资源"）；
 * `rejected` 表示落在画布路由内但不满足字面合同，按越界处理。
 */
export type CanvasPreviewPathRejection = "outside-route" | "rejected";

export type CanvasPreviewPathResult =
	| { readonly ok: true; readonly target: CanvasPreviewRequestTarget }
	| { readonly ok: false; readonly rejection: CanvasPreviewPathRejection };

export function isCanvasPreviewArtifactId(value: string): boolean {
	return ARTIFACT_ID_PATTERN.test(value) && !value.includes("..");
}

/** 伺服授权键：只有用户显式打开过的 artifact 才允许被这个端口读到。 */
export function previewGrantKey(workspaceToken: string, artifactId: string): string {
	return `${workspaceToken}/${artifactId}`;
}

export function parseCanvasPreviewRequestPath(rawRequestPath: string): CanvasPreviewPathResult {
	const route = (rawRequestPath.split(/[?#]/, 1)[0] ?? "").trim();
	const prefix = `${CANVAS_PREVIEW_ROUTE_PREFIX}/`;
	if (!route.startsWith(prefix)) return { ok: false, rejection: "outside-route" };

	const rawSegments = route.slice(prefix.length).split("/");
	// 目录本身（含尾斜杠）等价于入口别名，浏览器地址栏会自动补上尾斜杠。
	if (rawSegments.at(-1) === "") rawSegments.pop();
	if (rawSegments.length === 2) rawSegments.push(CANVAS_PREVIEW_ENTRY_FILE);
	if (rawSegments.length !== 3) return rejected();

	const decoded = rawSegments.map(decodePathSegment);
	if (decoded.some((segment) => segment === undefined)) return rejected();
	const [workspaceToken, artifactId, file] = decoded as [string, string, string];

	if (!WORKSPACE_TOKEN_PATTERN.test(workspaceToken)) return rejected();
	if (!isCanvasPreviewArtifactId(artifactId)) return rejected();
	if (file !== CANVAS_PREVIEW_ENTRY_FILE && !VERSION_FILE_PATTERN.test(file)) return rejected();

	return { ok: true, target: { workspaceToken, artifactId, file } };
}

/**
 * 单次解码后的段必须是"一个字面段"。解码产生分隔符、控制字符或二次编码残留时，
 * 拼出来的路径就不再等于用户写下的那一段，因此直接拒绝。
 */
function decodePathSegment(raw: string): string | undefined {
	if (raw === "" || raw === "." || raw === "..") return undefined;
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		return undefined;
	}
	if (decoded === "" || decoded.includes("..")) return undefined;
	if (UNSAFE_DECODED_CHARS.test(decoded)) return undefined;
	return decoded;
}

function rejected(): CanvasPreviewPathResult {
	return { ok: false, rejection: "rejected" };
}

export interface CanvasPreviewUrlInput {
	readonly port: number;
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly file?: string;
}

export function canvasPreviewUrl(input: CanvasPreviewUrlInput): string {
	const token = encodeCanvasWorkspaceBucket(input.workspaceId);
	const file = input.file ?? CANVAS_PREVIEW_ENTRY_FILE;
	return `http://127.0.0.1:${input.port}${CANVAS_PREVIEW_ROUTE_PREFIX}/${token}/${input.artifactId}/${file}`;
}

/**
 * 入口文件：目录里版本号最大的 HTML 版本。伺服端每次请求都重新解析，所以 Agent
 * 写出新版本后刷新页面就能看到，不需要重启服务。
 */
export function selectCanvasPreviewEntry(names: readonly string[]): string | undefined {
	let best: { readonly version: number; readonly rank: number; readonly name: string } | undefined;
	for (const name of names) {
		const match = VERSION_FILE_PATTERN.exec(name);
		if (!match) continue;
		const rank = HTML_EXTENSION_RANK[extname(name).toLowerCase()];
		if (rank === undefined) continue;
		const version = Number(match[1]);
		// 同一版本只应有一个文件；真出现多个时按扩展名固定优先，避免结果取决于目录顺序。
		if (!best || version > best.version || (version === best.version && rank < best.rank)) {
			best = { version, rank, name };
		}
	}
	return best?.name;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	css: "text/css; charset=utf-8",
	csv: "text/csv; charset=utf-8",
	gif: "image/gif",
	htm: "text/html; charset=utf-8",
	html: "text/html; charset=utf-8",
	ico: "image/x-icon",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	js: "text/javascript; charset=utf-8",
	json: "application/json; charset=utf-8",
	md: "text/markdown; charset=utf-8",
	mjs: "text/javascript; charset=utf-8",
	png: "image/png",
	svg: "image/svg+xml",
	tsv: "text/tab-separated-values; charset=utf-8",
	txt: "text/plain; charset=utf-8",
	webp: "image/webp",
	woff2: "font/woff2",
	xhtml: "application/xhtml+xml; charset=utf-8",
};

export function contentTypeForCanvasFile(file: string): string {
	const extension = extname(file).replace(/^\./, "").toLowerCase();
	return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/**
 * `target` 是否等于或位于 `root` 之内。两侧都应当是 realpath 的结果，
 * 这样符号链接已经展开，比较的就是真实落点。
 */
export function isPathInside(root: string, target: string): boolean {
	const normalizedRoot = normalizePathForCompare(root);
	const normalizedTarget = normalizePathForCompare(target);
	if (normalizedRoot === "" || normalizedTarget === "") return false;
	if (normalizedTarget === normalizedRoot) return true;
	return normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function normalizePathForCompare(value: string): string {
	const unified = value.trim().replaceAll("\\", "/").replace(/\/+$/, "");
	return process.platform === "win32" ? unified.toLowerCase() : unified;
}
