// Modified by The Open Forge contributors.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { getVettaHomePath } from "@vetta/action-rpc";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { type CustomScheme, protocol } from "electron";
import {
	type ResolvedToolcallMedia,
	resolveToolcallMedia,
	type ToolcallMediaRequest,
} from "./conversations/toolcall-media-resolver.js";
import { assertPathReadableForPreview } from "./filesystem/filesystem-service.js";
import { openRemoteMediaSource } from "./filesystem/remote-filesystem.js";
import { createEphemeralMediaToken, resolveEphemeralMediaToken } from "./media-token-store.js";

/**
 * 媒体流协议（ADR-0021）：把校验过的本地媒体路径映射为支持 Range 的流式 URL，
 * 供 <audio>（未来含 <video>）直接作 src。与既有 readFile IPC + base64 全量
 * 加载并存——无损音频可达百 MB，全量 IPC 会阻塞且内存翻倍，故走流式。
 *
 * URL 形态：既有媒体使用 `?path=`；需要跨越不可信插件边界的临时输入使用
 * `?token=`。令牌只在主进程内映射到路径并短时过期，避免把绝对路径暴露给插件。
 */
export const MEDIA_PROTOCOL_SCHEME = "vetta-media";

/** Creates a short-lived opaque media URL for a host-controlled file. */
export function createEphemeralMediaUrl(path: string, mimeType: string, ttlMs = 10 * 60_000): string {
	const token = createEphemeralMediaToken(path, mimeType, ttlMs);
	return `${MEDIA_PROTOCOL_SCHEME}://local/stream?token=${token}`;
}

const MEDIA_MIME: Record<string, string> = {
	mp3: "audio/mpeg",
	wav: "audio/wav",
	ogg: "audio/ogg",
	opus: "audio/ogg",
	flac: "audio/flac",
	m4a: "audio/mp4",
	aac: "audio/aac",
	webm: "audio/webm",
	mp4: "video/mp4",
	m4v: "video/x-m4v",
	mov: "video/quicktime",
	ogv: "video/ogg",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	ico: "image/x-icon",
	pdf: "application/pdf",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
	xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
	ods: "application/vnd.oasis.opendocument.spreadsheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const PLUGIN_DATA_ROOT = resolve(join(getVettaHomePath(), "plugin-data"));

function isPluginDataPath(path: string): boolean {
	const relation = relative(PLUGIN_DATA_ROOT, resolve(path));
	return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/**
 * 特权声明须在 app ready 之前随其他自定义 scheme 由 main.ts 合并注册
 * （registerSchemesAsPrivileged 只能调用一次）。stream 标记是媒体播放的关键；
 * corsEnabled + 响应上的 ACAO 头让 Web Audio AnalyserNode（频谱可视化）
 * 能读到真实采样而非零数据。
 */
export const MEDIA_PROTOCOL_PRIVILEGE: CustomScheme = {
	scheme: MEDIA_PROTOCOL_SCHEME,
	privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
};

/** 解析 "bytes=start-end" / "bytes=start-"。多段 Range 不支持，返回 null 走整文件。 */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, startStr, endStr] = match;
	if (startStr === "" && endStr === "") return null;
	if (startStr === "") {
		// 后缀范围：最后 N 字节
		const suffix = Number(endStr);
		if (suffix <= 0) return null;
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(startStr);
	const end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
	if (start > end || start >= size) return null;
	return { start, end };
}

/** 解析工具媒体引用 URL；host 不是 toolcall 或段格式非法返回 null（交回常规分支）。 */
function parseToolcallMediaUrl(rawUrl: string): ToolcallMediaRequest | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (url.host !== "toolcall") return null;
	const kind = url.searchParams.get("kind");
	if (kind !== "image" && kind !== "audio") return null;
	const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
	if (segments.length !== 3) return null;
	const sessionId = decodeURIComponent(segments[0] ?? "");
	const toolCallId = decodeURIComponent(segments[1] ?? "");
	const index = Number(segments[2]);
	if (!sessionId || !toolCallId || !Number.isInteger(index) || index < 0) return null;
	return { sessionId, toolCallId, index, kind };
}

async function handleToolcallMediaRequest(request: Request, toolcall: ToolcallMediaRequest): Promise<Response> {
	let media: ResolvedToolcallMedia | null;
	try {
		media = await resolveToolcallMedia(toolcall);
	} catch {
		return new Response("Tool media lookup failed", { status: 500 });
	}
	if (!media) return new Response("Tool media not found", { status: 404 });
	const body = new Uint8Array(media.data);
	const baseHeaders: Record<string, string> = {
		"Content-Type": media.mimeType,
		"Accept-Ranges": "bytes",
		"Access-Control-Allow-Origin": "*",
		// 内容按 (sessionId, toolCallId, index) 不可变：允许 Chromium 永久缓存，
		// 视口滚出后 bitmap 由缓存淘汰，而不是常驻渲染进程内存。
		"Cache-Control": "public, max-age=31536000, immutable",
	};
	const range = parseRange(request.headers.get("Range"), body.byteLength);
	if (range) {
		return new Response(body.subarray(range.start, range.end + 1), {
			status: 206,
			headers: {
				...baseHeaders,
				"Content-Length": String(range.end - range.start + 1),
				"Content-Range": `bytes ${range.start}-${range.end}/${body.byteLength}`,
			},
		});
	}
	return new Response(body, {
		status: 200,
		headers: { ...baseHeaders, "Content-Length": String(body.byteLength) },
	});
}

interface MediaSource {
	readonly path: string;
	readonly size: number;
	stream(start: number, end: number): ReadableStream;
	/** 调用方声明的 MIME 只对插件数据目录生效，远端文件不适用。 */
	readonly allowsDeclaredMimeType: boolean;
}

/**
 * 打开一份媒体的字节来源。授权失败抛出，路径不存在或不是文件返回 null。
 *
 * 远程项目的路径是 `ssh://` URI，绝不能先 `resolve()`：那会把它变成本机进程 cwd 之下的
 * 路径，再去过本机的授权检查——开发态下恰好能通过，读到的却是本机文件。
 */
async function openMediaSource(rawPath: string): Promise<MediaSource | null> {
	if (isSshProjectUri(rawPath)) {
		const remote = await openRemoteMediaSource(rawPath);
		return remote ? { ...remote, allowsDeclaredMimeType: false } : null;
	}
	const filePath = resolve(rawPath);
	// 与 fs IPC 预览读取同一道沙箱边界：防止渲染进程借本协议任意读取磁盘文件
	assertPathReadableForPreview(filePath);
	let size: number;
	try {
		const stats = await stat(filePath);
		if (!stats.isFile()) return null;
		size = stats.size;
	} catch {
		return null;
	}
	return {
		path: filePath,
		size,
		stream: (start, end) => Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
		allowsDeclaredMimeType: isPluginDataPath(filePath),
	};
}

/** 协议处理的主体，与 Electron 的注册解耦以便测试。 */
export async function handleMediaRequest(request: Request): Promise<Response> {
	// 工具结果媒体引用分支（P0-3）：`vetta-media://toolcall/<sessionId>/<toolCallId>/<index>?kind=`。
	// 媒体按 (sessionId, toolCallId, index) 不可变，用 immutable 缓存头让 Chromium
	// 缓存接管 bitmap 生命周期——这正是渲染端不再驻留 base64 的前提。
	const toolcall = parseToolcallMediaUrl(request.url);
	if (toolcall) {
		return handleToolcallMediaRequest(request, toolcall);
	}
	let source: MediaSource | null;
	let mediaKind: string | null = null;
	let requestedMimeType: string | null | undefined;
	try {
		const url = new URL(request.url);
		const token = url.searchParams.get("token");
		const ephemeral = token ? resolveEphemeralMediaToken(token) : undefined;
		if (token && !ephemeral && !url.searchParams.get("path")) {
			return new Response("Expired media token", { status: 410 });
		}
		const rawPath = ephemeral?.path ?? url.searchParams.get("path");
		if (!rawPath) return new Response("Missing path", { status: 400 });
		mediaKind = url.searchParams.get("kind");
		requestedMimeType = ephemeral?.mimeType ?? url.searchParams.get("mime");
		source = await openMediaSource(rawPath);
	} catch {
		return new Response("Forbidden", { status: 403 });
	}
	if (!source) return new Response("Not found", { status: 404 });

	const declaredMimeType =
		requestedMimeType && source.allowsDeclaredMimeType && MIME_TYPE_PATTERN.test(requestedMimeType)
			? requestedMimeType
			: null;
	const ext = extname(source.path).slice(1).toLowerCase();
	const contentType =
		declaredMimeType ??
		(ext === "webm" && mediaKind === "video" ? "video/webm" : (MEDIA_MIME[ext] ?? "application/octet-stream"));
	const baseHeaders: Record<string, string> = {
		"Content-Type": contentType,
		"Accept-Ranges": "bytes",
		"Access-Control-Allow-Origin": "*",
	};

	const range = parseRange(request.headers.get("Range"), source.size);
	if (range) {
		return new Response(source.stream(range.start, range.end), {
			status: 206,
			headers: {
				...baseHeaders,
				"Content-Length": String(range.end - range.start + 1),
				"Content-Range": `bytes ${range.start}-${range.end}/${source.size}`,
			},
		});
	}
	return new Response(source.size === 0 ? null : source.stream(0, source.size - 1), {
		status: 200,
		headers: { ...baseHeaders, "Content-Length": String(source.size) },
	});
}

export function registerMediaProtocolHandler(): void {
	protocol.handle(MEDIA_PROTOCOL_SCHEME, handleMediaRequest);
}
