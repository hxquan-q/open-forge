/**
 * Canonical JSON fingerprint with identity-key aliasing.
 * `sessionId` / `conversationId` collapse to `__session__` so the same
 * conversation across account copies shares one fingerprint.
 */

const IDENTITY_KEYS = new Set(["sessionId", "conversationId"]);

export function canonicalizeJson(value: unknown): string {
	return serializeCanonical(aliasIdentityKeys(value));
}

export async function fingerprintSessionPayload(value: unknown): Promise<string> {
	const canonical = canonicalizeJson(value);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
	return bytesToHex(new Uint8Array(digest));
}

function aliasIdentityKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(aliasIdentityKeys);
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	const input = value as Record<string, unknown>;
	const output: Record<string, unknown> = {};
	const identity =
		typeof input.sessionId !== "undefined"
			? input.sessionId
			: typeof input.conversationId !== "undefined"
				? input.conversationId
				: undefined;
	if (typeof identity !== "undefined") {
		output.__session__ = identity;
	}
	for (const key of Object.keys(input).sort()) {
		if (IDENTITY_KEYS.has(key)) continue;
		output[key] = aliasIdentityKeys(input[key]);
	}
	return output;
}

function serializeCanonical(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new TypeError("canonical JSON rejects non-finite numbers");
		}
		return JSON.stringify(value);
	}
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map(serializeCanonical).join(",")}]`;
	}
	if (typeof value === "object") {
		const entries = Object.keys(value as Record<string, unknown>)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${serializeCanonical((value as Record<string, unknown>)[key])}`);
		return `{${entries.join(",")}}`;
	}
	throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const byte of bytes) {
		out += byte.toString(16).padStart(2, "0");
	}
	return out;
}
