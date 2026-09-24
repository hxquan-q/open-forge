// Modified by The Open Forge contributors.

import { defineRuntimeObservation, type RuntimeObservationFailure } from "../observation/index.js";
import type { MessagePrefixStabilityKind } from "./message-prefix-stability.js";

export type RuntimePromptFrameObservation =
	| { readonly phase: "started"; readonly providerCount: number }
	| {
			readonly phase: "completed";
			readonly durationMs: number;
			readonly instructionCount: number;
			readonly toolCount: number;
			readonly cacheLayoutSource: "automatic" | "composer" | "unspecified" | "degraded";
			readonly stableCharacterCount?: number;
			readonly stableBlockCount: number;
			readonly volatileBlockCount: number;
	  }
	| { readonly phase: "failed"; readonly durationMs: number; readonly failure: RuntimeObservationFailure };

export type RuntimeToolExecutionObservation =
	| { readonly phase: "started"; readonly toolName: string; readonly inputFieldCount: number }
	| {
			readonly phase: "completed";
			readonly toolName: string;
			readonly durationMs: number;
			readonly contentItemCount: number;
			readonly hasDetails: boolean;
	  }
	| {
			readonly phase: "failed";
			readonly toolName: string;
			readonly durationMs: number;
			readonly failure: RuntimeObservationFailure;
	  };

export interface RuntimePromptCacheLayoutIssueObservation {
	readonly reason: "invalid-stable-length" | "invalid-block-layout";
	readonly declaredBlockCount: number;
	readonly stableLengthDeclared: boolean;
}

export const RUNTIME_PROMPT_FRAME_OBSERVATION = defineRuntimeObservation<RuntimePromptFrameObservation>(
	"runtime.prompt",
	"frame",
);

export const RUNTIME_TOOL_EXECUTION_OBSERVATION = defineRuntimeObservation<RuntimeToolExecutionObservation>(
	"runtime.tool",
	"execution",
);

export const RUNTIME_PROMPT_CACHE_LAYOUT_ISSUE_OBSERVATION =
	defineRuntimeObservation<RuntimePromptCacheLayoutIssueObservation>(
		"runtime.prompt",
		"cache-layout-issue",
		"warning",
	);

/**
 * 相邻两次模型调用投影的前缀稳定性度量。payload 只含计数与分类，不含任何消息正文。
 * `contentFallbackCount` 是 `===` 未命中但内容一致的消息数（transformer 引用保持合同违约信号）。
 */
export interface RuntimeContextStabilityObservation {
	readonly phase: "compared";
	readonly kind: MessagePrefixStabilityKind;
	readonly previousMessageCount: number;
	readonly currentMessageCount: number;
	readonly stablePrefixMessageCount: number;
	readonly firstDivergenceIndex?: number;
	readonly contentFallbackCount: number;
}

export const RUNTIME_CONTEXT_STABILITY_OBSERVATION = defineRuntimeObservation<RuntimeContextStabilityObservation>(
	"runtime.context",
	"stability",
);
