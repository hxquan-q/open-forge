import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { selectMcpMediaCandidates } from "@vetta/runtime-mcp/browser";
import type {
	CodingToolResultContext,
	CodingToolResultPolicy,
	RuntimeToolResultArtifact,
	RuntimeToolResultArtifactStore,
} from "@vetta/runtime-tools";

export const DEFAULT_CODING_AGENT_MAX_INLINE_TOOL_RESULT_BYTES = 50 * 1024;
/** details 不进模型，预算只约束 JSONL/内存驻留；远大于既有 UI 字段（diff/卡片/媒体元信息）的常规体量。 */
export const DEFAULT_CODING_AGENT_MAX_INLINE_DETAILS_BYTES = 64 * 1024;
/** 投影后保留的插件卡片（details.cards）子集预算，守住 extractToolCards 的 UI 契约。 */
const MAX_INLINE_CARDS_BYTES = 16 * 1024;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

export interface CodingAgentCodingToolResultPolicyOptions {
	readonly artifactStore: RuntimeToolResultArtifactStore;
	readonly maxInlineResultBytes?: number;
	readonly maxInlineDetailsBytes?: number;
}

export function createCodingAgentCodingToolResultPolicy(
	options: CodingAgentCodingToolResultPolicyOptions,
): CodingToolResultPolicy {
	const maxInlineResultBytes = positiveInteger(
		options.maxInlineResultBytes,
		DEFAULT_CODING_AGENT_MAX_INLINE_TOOL_RESULT_BYTES,
	);
	const maxInlineDetailsBytes = positiveInteger(
		options.maxInlineDetailsBytes,
		DEFAULT_CODING_AGENT_MAX_INLINE_DETAILS_BYTES,
	);
	return {
		async project(result, context) {
			return projectLargeResult(result, context, options.artifactStore, maxInlineResultBytes, maxInlineDetailsBytes);
		},
	};
}

async function projectLargeResult(
	result: RuntimeToolResult,
	context: CodingToolResultContext,
	artifactStore: RuntimeToolResultArtifactStore,
	maxInlineResultBytes: number,
	maxInlineDetailsBytes: number,
): Promise<RuntimeToolResult> {
	const text = result.content
		.filter((item): item is Extract<(typeof result.content)[number], { type: "text" }> => item.type === "text")
		.map((item) => item.text)
		.join("\n\n");
	const textBytes = utf8ByteLength(text);
	const inlinePayloadBytes = measureInlinePayload(result);
	if (inlinePayloadBytes <= maxInlineResultBytes) return result;
	let serializedResult: string;
	try {
		serializedResult = JSON.stringify({
			content: result.content,
			...(result.details === undefined ? {} : { details: result.details }),
		});
	} catch {
		return result;
	}
	const resultBytes = utf8ByteLength(serializedResult);

	let artifact: RuntimeToolResultArtifact;
	try {
		artifact = await artifactStore.write({
			...context,
			mediaType: "application/json",
			data: serializedResult,
			byteLength: resultBytes,
		});
	} catch {
		// 写盘失败时绝不投影：唯一副本留在内联结果里。
		return result;
	}

	const notice = `[Tool result exceeds inline budget (${inlinePayloadBytes} bytes). Full result: ${artifact.reference}]`;
	const textTruncated = textBytes > maxInlineResultBytes;
	const projectedText = projectText(text, textBytes, maxInlineResultBytes, notice);
	// 图片沿用 MCP 媒体准入（16 项/单项 8MB/总量 24MB）：准入内一律保留内联——
	// 桌面端的 vetta-media://toolcall 引用链从持久化 content 取候选，图片必须在场；
	// 超准入的图片以与 MCP 相同口径的省略文案替换。
	const images = result.content.filter(
		(item): item is Extract<(typeof result.content)[number], { type: "image" }> => item.type === "image",
	);
	const admitted = new Set(selectMcpMediaCandidates(images));
	const content: RuntimeToolResult["content"] = [{ type: "text", text: projectedText }];
	for (const item of images) {
		if (admitted.has(item)) content.push(item);
		else {
			content.push({
				type: "text",
				text: "[image omitted: invalid encoding, unsafe MIME type, or host size limit]",
			});
		}
	}
	return {
		content,
		details: projectDetails(result.details, artifact, textTruncated, maxInlineDetailsBytes),
		...(result.isError === undefined ? {} : { isError: result.isError }),
	};
}

/**
 * 超预算 details 的有界投影。优先只摘要插件形状的 `result` 键（插件完整返回值），
 * 其余 UI 字段原样保留；仍超限时整份摘要为与 MCP `McpToolResultOffloadDetails`
 * 同词汇的标记，并尽量保留 cards 子集（插件卡片 UI 契约）。
 */
function projectDetails(
	details: RuntimeToolResult["details"],
	artifact: RuntimeToolResultArtifact,
	textTruncated: boolean,
	maxInlineDetailsBytes: number,
): RuntimeToolResult["details"] {
	if (details === undefined) return undefined;
	if (jsonBytes(details) <= maxInlineDetailsBytes) return details;
	if (isRecord(details) && "result" in details) {
		const trimmed = { ...details, result: offloadMarker(artifact) };
		if (jsonBytes(trimmed) <= maxInlineDetailsBytes) return trimmed;
	}
	const cards = isRecord(details) && Array.isArray(details.cards) ? boundedCards(details.cards) : undefined;
	return {
		offloaded: true,
		textTruncated,
		artifact: {
			reference: artifact.reference,
			mediaType: "application/json" as const,
			byteLength: artifact.byteLength,
		},
		detailsOffloaded: true,
		...(cards !== undefined ? { cards } : {}),
	};
}

function offloadMarker(artifact: RuntimeToolResultArtifact): Record<string, unknown> {
	return {
		offloaded: true,
		artifact: {
			reference: artifact.reference,
			mediaType: "application/json" as const,
			byteLength: artifact.byteLength,
		},
	};
}

/** 累计 JSON 体积不超过卡片预算的最长前缀；放不下任何一张时置空，由调用方标记截断。 */
function boundedCards(cards: readonly unknown[]): unknown[] | undefined {
	const kept: unknown[] = [];
	let bytes = 2;
	for (const card of cards) {
		const cardBytes = jsonBytes(card);
		if (cardBytes === undefined || bytes + cardBytes > MAX_INLINE_CARDS_BYTES) break;
		kept.push(card);
		bytes += cardBytes + 1;
	}
	return kept;
}

function jsonBytes(value: unknown): number {
	try {
		return utf8ByteLength(JSON.stringify(value));
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

function measureInlinePayload(result: RuntimeToolResult): number {
	const contentBytes = result.content.reduce((total, item) => {
		if (item.type === "text") return total + utf8ByteLength(item.text);
		if (item.type === "image") return total + decodedBase64Bytes(item.data);
		return total;
	}, 0);
	if (result.details === undefined) return contentBytes;
	return contentBytes + jsonBytes(result.details);
}

/**
 * 解码字节数的估算（预算触发用，不承担编码校验——canonicality 由媒体准入负责）。
 * 不用正则：分组量词在百万级字符串上会爆栈。
 */
function decodedBase64Bytes(data: string): number {
	if (data.length === 0 || data.length % 4 !== 0) return data.length;
	const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
	return (data.length / 4) * 3 - padding;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectText(text: string, textBytes: number, maxBytes: number, notice: string): string {
	if (textBytes <= maxBytes) return text.length > 0 ? `${text}\n\n${notice}` : notice;
	return `${sliceUtf8Start(text, Math.floor(maxBytes * 0.6))}\n\n${notice}\n\n${sliceUtf8End(
		text,
		Math.floor(maxBytes * 0.2),
	)}`;
}

function sliceUtf8Start(value: string, maxBytes: number): string {
	const bytes = utf8Encoder.encode(value);
	if (bytes.length <= maxBytes) return value;
	let end = maxBytes;
	while (end > 0 && isUtf8ContinuationByte(bytes[end])) end -= 1;
	return utf8Decoder.decode(bytes.subarray(0, end));
}

function sliceUtf8End(value: string, maxBytes: number): string {
	const bytes = utf8Encoder.encode(value);
	if (bytes.length <= maxBytes) return value;
	let start = bytes.length - maxBytes;
	while (start < bytes.length && isUtf8ContinuationByte(bytes[start])) start += 1;
	return utf8Decoder.decode(bytes.subarray(start));
}

function utf8ByteLength(value: string): number {
	return utf8Encoder.encode(value).length;
}

function isUtf8ContinuationByte(value: number | undefined): boolean {
	return value !== undefined && (value & 0xc0) === 0x80;
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}
