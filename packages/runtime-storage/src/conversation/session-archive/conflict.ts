import type { SessionArchiveImportConflictInput, SessionArchiveImportConflictResult } from "./types.js";

/**
 * Import conflict policy: fingerprint decides sameness; file mtime is a hint only.
 * Default when fingerprints differ is create a new copy (never overwrite).
 */
export function resolveSessionArchiveImportConflict(
	input: SessionArchiveImportConflictInput,
): SessionArchiveImportConflictResult {
	const mtimeHint = resolveMtimeHint(input.existingMtimeMs, input.incomingMtimeMs);

	if (input.existingFingerprint === input.incomingFingerprint) {
		return {
			action: "skip-idempotent",
			reason: "fingerprint-match",
			mtimeHint,
		};
	}

	if (input.preferOverwrite === true) {
		return {
			action: "overwrite",
			reason: "explicit-overwrite",
			mtimeHint,
		};
	}

	return {
		action: "create-copy",
		reason: "default-create-copy",
		mtimeHint,
	};
}

function resolveMtimeHint(
	existingMtimeMs: number | undefined,
	incomingMtimeMs: number | undefined,
): SessionArchiveImportConflictResult["mtimeHint"] {
	if (typeof existingMtimeMs !== "number" || typeof incomingMtimeMs !== "number") {
		return "unavailable";
	}
	if (incomingMtimeMs > existingMtimeMs) return "incoming-newer";
	if (incomingMtimeMs < existingMtimeMs) return "existing-newer";
	return "equal";
}
