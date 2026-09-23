// Copyright The Open Forge contributors.
import { selectMcpMediaCandidates } from "@vetta/runtime-mcp/browser";

/**
 * 工具结果媒体的候选投影：渲染端提取与主进程协议解析**共用**本模块，
 * 保证 (sessionId, toolCallId, kind, index) 引用在两侧解析到同一条媒体——
 * 序号对齐是引用化的合同，任何一侧改动顺序/过滤都必须同步。
 */

export type ToolMediaKind = "image" | "audio";

/** 媒体引用上下文：提供时提取结果只存协议引用，不驻留 base64。 */
export interface ToolMediaReference {
	readonly sessionId: string;
	readonly toolCallId: string;
}

export interface ToolMediaCandidate {
	readonly data: string;
	readonly mimeType: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** 图片候选：result.content（或 result 本身为数组）里的 image part，经媒体准入过滤。签名与音频收集器对称。 */
export function collectToolImageCandidates(result: unknown, _details: unknown): ToolMediaCandidate[] {
	const resultRecord = asRecord(result);
	const content = Array.isArray(resultRecord?.content) ? resultRecord.content : Array.isArray(result) ? result : [];
	const images = content.filter((part): part is { type: "image"; data: string; mimeType: string } => {
		const record = asRecord(part);
		return record?.type === "image" && typeof record.data === "string" && typeof record.mimeType === "string";
	});
	return selectMcpMediaCandidates(images);
}

/** 音频候选：content → details.content → details.media 三源顺序拼接，经媒体准入过滤。 */
export function collectToolAudioCandidates(result: unknown, details: unknown): ToolMediaCandidate[] {
	const resultRecord = asRecord(result);
	const detailsRecord = asRecord(details) ?? asRecord(resultRecord?.details);
	const sources = [
		Array.isArray(resultRecord?.content) ? resultRecord.content : [],
		Array.isArray(detailsRecord?.content) ? detailsRecord.content : [],
		Array.isArray(detailsRecord?.media) ? detailsRecord.media : [],
	].flat();
	const candidates = sources.flatMap((part) => {
		const record = asRecord(part);
		return record?.type === "audio" && typeof record.data === "string" && typeof record.mimeType === "string"
			? [{ data: record.data, mimeType: record.mimeType }]
			: [];
	});
	return selectMcpMediaCandidates(candidates.map((candidate) => ({ ...candidate, type: "audio" as const })));
}

export function toolcallMediaUrl(reference: ToolMediaReference, index: number, kind: ToolMediaKind): string {
	return `vetta-media://toolcall/${encodeURIComponent(reference.sessionId)}/${encodeURIComponent(
		reference.toolCallId,
	)}/${index}?kind=${kind}`;
}

export function toolcallInlineDataUrl(candidate: ToolMediaCandidate): string {
	return `data:${candidate.mimeType};base64,${candidate.data}`;
}
