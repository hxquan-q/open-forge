// Modified by The Open Forge contributors.

import type { AgentMessage } from "@vetta/agent-core";
import type { Message } from "@vetta/ai";
import type { RuntimeMessageEnvelope } from "@vetta/runtime-core";
import type { ModelCallContextTransformationInput } from "@vetta/runtime-core/kernel";
import { convertToLlm, createCustomMessage } from "../../model-context/index.js";
import type { CodingAgentContextRuntimeOptions, CodingAgentPinnedModelContext } from "../../runtime-contracts/index.js";
import {
	estimateContextTokens,
	microcompact,
	reduceContextByPressure,
	selectDecayedThinkingIndices,
} from "../index.js";
import { projectPinnedMessageEnvelopes } from "./pinned-conversation-projection.js";
import { applyPinnedModelContext } from "./pinned-model-context-projection.js";

export interface ProjectedModelCallContext {
	readonly messages: readonly Message[];
	readonly estimatedTokens: number;
}

/** 模型调用投影的衰减尾窗宽度；Turn 冻结剪枝边界的冻结规则必须与之一致。 */
const PROJECTION_DECAY_KEEP_RECENT = 8;

export interface ModelCallContextProjectionOptions {
	readonly pinnedContext?: CodingAgentPinnedModelContext;
	/**
	 * Turn 冻结的衰减剪枝边界：由 Turn 绑定（bindForTurn）创建并传入，使同一 Turn
	 * 的全部模型调用共享同一清除集合；缺省（无 Turn 作用域的直连路径）时退回
	 * 逐调用滑动计数窗。
	 */
	readonly decayBoundary?: ModelCallDecayBoundary;
}

/**
 * Turn 作用域的衰减剪枝边界：计数式、确定性，替代随流滑动的 maxAgeMs=0 行为。
 *
 * Turn 首次投影时按 microcompact 的滑动计数尾窗规则一次性冻结将被清除的 thinking
 * 消息身份集合（`role:timestamp` 键），同一 Turn 的后续投影只复用该集合——投影
 * append-only，已见消息的剪枝决策不随消息追加滑动，保住旧 30s 时间边界
 * "turn 内剪枝集合字节一致"的核心不变量，又不复活墙钟不确定性。跨 Turn 重新
 * 绑定后按 grown 流重算：流只追加，集合单调只增，清除决策不回翻。
 */
export interface ModelCallDecayBoundary {
	/** 以本 Turn 首次投影的消息流冻结清除集合；幂等，重复调用为 no-op。 */
	freeze(messages: readonly AgentMessage[]): void;
	/** 消息是否落在本 Turn 冻结的清除集合内；冻结前恒为 false。 */
	shouldClearThinking(message: AgentMessage): boolean;
}

export function createModelCallDecayBoundary(
	keepRecent: number = PROJECTION_DECAY_KEEP_RECENT,
): ModelCallDecayBoundary {
	let frozenKeys: ReadonlySet<string> | undefined;
	return {
		freeze(messages) {
			if (frozenKeys) return;
			frozenKeys = new Set(
				selectDecayedThinkingIndices(messages, keepRecent).map((index) => messageIdentityKey(messages[index])),
			);
		},
		shouldClearThinking(message) {
			return frozenKeys?.has(messageIdentityKey(message)) ?? false;
		},
	};
}

export async function projectModelCallContext(
	input: ModelCallContextTransformationInput,
	transformAgentContext: CodingAgentContextRuntimeOptions["transformAgentContext"],
	signal: AbortSignal,
	options: ModelCallContextProjectionOptions = {},
): Promise<ProjectedModelCallContext> {
	signal.throwIfAborted();
	const envelopes = projectPinnedMessageEnvelopes(
		input.messageEnvelopes ?? input.messages.map(toMessageEnvelope),
		options.pinnedContext,
	);
	const continuationMessages = new WeakSet<object>();
	for (const envelope of envelopes) {
		if (envelope.kind === "message" && envelope.origin?.kind === "continuation") {
			continuationMessages.add(envelope.message);
		}
	}
	const agentMessages = envelopes.flatMap(toAgentMessages);
	const invisibleIdentities = readInvisibleIdentityCounts(envelopes);
	const extensionMessages = transformAgentContext ? await transformAgentContext(agentMessages, signal) : agentMessages;
	signal.throwIfAborted();
	// 衰减稳定坐标化：maxAgeMs = 0 使 thinking 清理只由计数坐标决定，不吃墙钟
	// （RESEARCH-0007 C 节；30s 墙钟门曾把清理推迟到缓存前缀最长的 Turn 边界）。
	// Turn 绑定提供 decayBoundary 时，清除集合在 Turn 首次投影时按计数尾窗冻结，
	// 同一 Turn 内投影 append-only——已见消息不因窗口随追加滑动而中途翻转；
	// 冻结在 agentMessages（会话真值流）上，与扩展改写后的视图解耦。
	const decayBoundary = options.decayBoundary;
	decayBoundary?.freeze(agentMessages);
	const projectedMessages = microcompact([...extensionMessages], {
		keepRecent: PROJECTION_DECAY_KEEP_RECENT,
		maxAgeMs: 0,
		pruneToolResults: false,
		...(decayBoundary ? { frozenThinkingClear: (message) => decayBoundary.shouldClearThinking(message) } : {}),
	});
	const visibleMessages = projectedMessages.filter((message) => !consumeIdentity(invisibleIdentities, message));
	const messages = applyPinnedModelContext(
		convertToLlm(
			reduceContextByPressure(visibleMessages, {
				contextWindow: input.modelBinding.model.contextWindow,
				estimatedTokens: estimateContextTokens(visibleMessages).tokens,
				isRealUserTurn: (message) => message.role === "user" && !continuationMessages.has(message),
			}),
		),
		options.pinnedContext,
	);
	return { messages, estimatedTokens: estimateContextTokens(messages).tokens };
}

function toAgentMessages(envelope: RuntimeMessageEnvelope): AgentMessage[] {
	if (envelope.kind === "message") return [envelope.message];
	if (envelope.kind === "context") {
		return [
			createCustomMessage(
				envelope.record.type,
				envelope.record.content,
				envelope.record.display ?? false,
				envelope.record.metadata,
				new Date(envelope.timestamp).toISOString(),
			),
		];
	}
	return isAgentMessage(envelope.identity)
		? [envelope.identity]
		: envelope.modelMessage
			? [envelope.modelMessage]
			: [];
}

function toMessageEnvelope(message: Message): RuntimeMessageEnvelope {
	return { kind: "message", message };
}

function readInvisibleIdentityCounts(envelopes: readonly RuntimeMessageEnvelope[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const envelope of envelopes) {
		const invisible =
			(envelope.kind === "context" && !envelope.record.modelVisible) ||
			(envelope.kind === "opaque" && !envelope.modelMessage);
		if (!invisible) continue;
		for (const message of toAgentMessages(envelope)) {
			const key = messageIdentityKey(message);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

function consumeIdentity(counts: Map<string, number>, message: AgentMessage): boolean {
	const key = messageIdentityKey(message);
	const count = counts.get(key) ?? 0;
	if (count === 0) return false;
	if (count === 1) counts.delete(key);
	else counts.set(key, count - 1);
	return true;
}

function messageIdentityKey(message: AgentMessage): string {
	const discriminator = message.role === "custom" ? message.customType : message.role;
	return `${discriminator}:${message.timestamp}`;
}

function isAgentMessage(value: unknown): value is AgentMessage {
	return (
		value !== null &&
		typeof value === "object" &&
		"role" in value &&
		typeof value.role === "string" &&
		AGENT_MESSAGE_ROLES.has(value.role)
	);
}

const AGENT_MESSAGE_ROLES = new Set([
	"user",
	"assistant",
	"toolResult",
	"bashExecution",
	"custom",
	"branchSummary",
	"compactionSummary",
]);
