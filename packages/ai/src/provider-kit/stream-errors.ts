// Modified by The Open Forge contributors.
import { AI_ERROR_CODES, AIError, type AIErrorOptions, AIStreamProtocolError } from "../protocol/index.js";

export class EmptyProviderStreamError extends AIStreamProtocolError {
	constructor(options: AIErrorOptions = {}) {
		super("Stream ended without provider events", {
			...options,
			retryable: true,
			metadata: { ...options.metadata, reason: "empty_provider_stream" },
		});
		this.name = "EmptyProviderStreamError";
	}
}

export function isSdkEmptyStreamError(error: unknown): boolean {
	return error instanceof Error && /without sending any chunks/i.test(error.message);
}

/**
 * Terminal classification for a completed model turn that produced nothing the
 * user can see — no visible text and no tool call — even after one silent
 * rerun. Distinct from `EmptyProviderStreamError`, which marks a stream that
 * delivered no events at all; this marks a well-formed stream whose content
 * stayed empty. Retriable so the host can offer an explicit continue action.
 */
export class EmptyModelResponseError extends AIError {
	constructor(options: AIErrorOptions = {}) {
		super(AI_ERROR_CODES.EMPTY_MODEL_RESPONSE, "The model ended its turn without producing any output", {
			...options,
			retryable: true,
		});
		this.name = "EmptyModelResponseError";
	}
}
