import { type AIErrorOptions, AIStreamProtocolError } from "../protocol/index.js";

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
