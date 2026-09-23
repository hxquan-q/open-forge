// Copyright The Open Forge contributors.
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
	collectToolAudioCandidates,
	collectToolImageCandidates,
	type ToolMediaCandidate,
	type ToolMediaKind,
} from "../../shared/conversation/tool-media-projection";
import {
	DEFAULT_CONVERSATION_SESSION_DIR,
	DEFAULT_IM_CONVERSATION_SESSION_DIR,
	KB_PROCESSING_SESSION_DIR,
	readConfigSync,
} from "../config/desktop-config-store.js";
import { getAppLogger } from "../logger.js";
import { peekSharedRuntime } from "../runtime.js";

const log = getAppLogger("toolcall-media");

/**
 * 工具结果媒体解析（P0-3 引用化的主进程侧）：把
 * `vetta-media://toolcall/<sessionId>/<toolCallId>/<index>` 解析回具体字节。
 * 候选投影与渲染端共用 shared/conversation/tool-media-projection，保证 index
 * 对齐；媒体本体按 (sessionId, toolCallId, index) 不可变，靠响应的 immutable
 * 缓存头交给 Chromium 缓存管理，这里只做小容量 LRU 兜底。
 */

/** 与 runtime-node conversation-file-codec 的 encodeConversationSessionId 同式。 */
function encodeConversationSessionId(sessionId: string): string {
	return Buffer.from(sessionId, "utf8").toString("base64url");
}

export interface ToolcallMediaRequest {
	readonly sessionId: string;
	readonly toolCallId: string;
	readonly index: number;
	readonly kind: ToolMediaKind;
}

export interface ResolvedToolcallMedia {
	readonly data: Buffer;
	readonly mimeType: string;
}

const MAX_CACHED_MEDIA_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_MEDIA_ENTRIES = 256;
const STREAMING_RETRY_DELAY_MS = 50;

const cache = new Map<string, ResolvedToolcallMedia>();
let cachedBytes = 0;

function cacheKey(request: ToolcallMediaRequest): string {
	return `${request.sessionId}|${request.toolCallId}|${request.kind}|${request.index}`;
}

function readCache(request: ToolcallMediaRequest): ResolvedToolcallMedia | undefined {
	const hit = cache.get(cacheKey(request));
	if (!hit) return undefined;
	// 刷新 LRU 新近度。
	cache.delete(cacheKey(request));
	cache.set(cacheKey(request), hit);
	return hit;
}

function writeCache(request: ToolcallMediaRequest, media: ResolvedToolcallMedia): void {
	const key = cacheKey(request);
	const previous = cache.get(key);
	if (previous) cachedBytes -= previous.data.byteLength;
	cache.set(key, media);
	cachedBytes += media.data.byteLength;
	while ((cachedBytes > MAX_CACHED_MEDIA_BYTES || cache.size > MAX_CACHED_MEDIA_ENTRIES) && cache.size > 1) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey === undefined) break;
		const oldest = cache.get(oldestKey);
		cache.delete(oldestKey);
		if (oldest) cachedBytes -= oldest.data.byteLength;
	}
}

interface ToolResultLike {
	readonly role: string;
	readonly toolCallId?: unknown;
	readonly content: unknown;
	readonly details?: unknown;
}

function findToolResultMessage(history: readonly unknown[], toolCallId: string): ToolResultLike | undefined {
	for (const entry of history) {
		if (typeof entry !== "object" || entry === null) continue;
		const message = (entry as { message?: unknown }).message;
		if (typeof message !== "object" || message === null) continue;
		const candidate = message as ToolResultLike;
		if (candidate.role === "toolResult" && String(candidate.toolCallId) === toolCallId) return candidate;
	}
	return undefined;
}

function collectCandidates(message: ToolResultLike, kind: ToolMediaKind): ToolMediaCandidate[] {
	return kind === "image"
		? collectToolImageCandidates(message.content, message.details)
		: collectToolAudioCandidates(message.content, message.details);
}

function readFromRuntime(sessionId: string): readonly unknown[] | undefined {
	const runtime = peekSharedRuntime();
	if (!runtime) return undefined;
	try {
		return runtime.getFullHistory(sessionId);
	} catch {
		// 会话未加载/未知：走文件回退。
		return undefined;
	}
}

async function locateSessionFile(sessionId: string): Promise<string | undefined> {
	const runtime = peekSharedRuntime();
	const knownPath = runtime?.getSessionPath(sessionId);
	if (knownPath) return knownPath;
	const fileName = `${encodeConversationSessionId(sessionId)}.conversation.jsonl`;
	const candidateDirs = new Set<string>([
		DEFAULT_CONVERSATION_SESSION_DIR,
		DEFAULT_IM_CONVERSATION_SESSION_DIR,
		KB_PROCESSING_SESSION_DIR,
	]);
	try {
		for (const project of readConfigSync().projects) {
			candidateDirs.add(join(project.path, ".vetta", "sessions"));
		}
	} catch {
		// 配置不可读时只用内置根目录。
	}
	for (const directory of candidateDirs) {
		const candidate = join(directory, fileName);
		try {
			if ((await stat(candidate)).isFile()) return candidate;
		} catch {
			// 不存在就试下一个。
		}
	}
	return undefined;
}

async function readFromFile(sessionId: string): Promise<readonly unknown[] | undefined> {
	const path = await locateSessionFile(sessionId);
	if (!path) return undefined;
	const runtime = peekSharedRuntime();
	if (!runtime) return undefined;
	try {
		return runtime.readSessionHistoryFromFile(path).history;
	} catch (error) {
		log.warn("toolcall media session file read failed", { sessionId, path, error });
		return undefined;
	}
}

function isSessionStreaming(sessionId: string): boolean {
	const runtime = peekSharedRuntime();
	if (!runtime) return false;
	try {
		return runtime.getState(sessionId).isStreaming;
	} catch {
		return false;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 清空解析缓存（测试隔离用；进程内缓存随内容不可变语义无需主动失效）。 */
export function clearToolcallMediaCache(): void {
	cache.clear();
	cachedBytes = 0;
}

/**
 * 解析一条工具媒体。找不到（会话/工具调用/序号不存在）返回 null，由协议层
 * 映射 404；不做重抛——媒体缺失不应影响调用方。
 */
export async function resolveToolcallMedia(request: ToolcallMediaRequest): Promise<ResolvedToolcallMedia | null> {
	if (!request.sessionId || !request.toolCallId || !Number.isInteger(request.index) || request.index < 0) {
		return null;
	}
	const cached = readCache(request);
	if (cached) return cached;

	let message = findToolResultMessage(readFromRuntime(request.sessionId) ?? [], request.toolCallId);
	if (!message && isSessionStreaming(request.sessionId)) {
		// tool.end 与消息入库同批，但 <img> 首次请求可能抢在前面：等一拍再读一次。
		await delay(STREAMING_RETRY_DELAY_MS);
		message = findToolResultMessage(readFromRuntime(request.sessionId) ?? [], request.toolCallId);
	}
	if (!message) {
		message = findToolResultMessage((await readFromFile(request.sessionId)) ?? [], request.toolCallId);
	}
	if (!message) return null;

	const candidate = collectCandidates(message, request.kind)[request.index];
	if (!candidate) return null;
	const media: ResolvedToolcallMedia = {
		data: Buffer.from(candidate.data, "base64"),
		mimeType: candidate.mimeType,
	};
	writeCache(request, media);
	return media;
}
