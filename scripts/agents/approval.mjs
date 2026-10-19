// Copyright The Open Forge contributors.
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contract, digest } from "./contracts.mjs";
import { canonical } from "./schema.mjs";

/** The operator provisions public keys outside every worker mount. No agent-facing signing API. */
export function trustedHumans(root) {
	const value = JSON.parse(readFileSync(join(root, "trusted-humans.json"), "utf8"));
	if (value.version !== 1 || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > 32)
		throw new Error("invalid human trust configuration");
	const keys = new Map();
	for (const key of value.keys) {
		if (!key || !/^[A-Za-z0-9_.-]{1,80}$/u.test(key.id) || typeof key.publicKey !== "string" || keys.has(key.id))
			throw new Error("invalid or duplicate human key");
		const parsed = createPublicKey(key.publicKey);
		if (parsed.asymmetricKeyType !== "ed25519") throw new Error("human approval requires Ed25519 keys");
		keys.set(key.id, parsed);
	}
	return keys;
}

export function verifyApproval(document, binding, trust, now = Date.now()) {
	contract("approval", document);
	const { payload, signature } = document;
	if (
		!Number.isSafeInteger(now) ||
		now < payload.issuedAt ||
		now >= payload.expiresAt ||
		payload.expiresAt - payload.issuedAt > 86400000
	)
		throw new Error("approval is expired or outside its valid clock interval");
	if (digest(payload.binding) !== digest(binding)) throw new Error("approval is bound to a different candidate");
	const key = trust.get(payload.keyId);
	if (!key || !verify(null, Buffer.from(canonical(payload)), key, Buffer.from(signature, "base64")))
		throw new Error("approval signature is not trusted");
	return payload;
}

export function assertApproved(classification, binding, documents = [], trust = new Map(), now = Date.now()) {
	const gates = new Set();
	const unknown = new Set();
	for (const document of documents) {
		const approved = verifyApproval(document, binding, trust, now);
		for (const gate of approved.gates) gates.add(gate);
		for (const path of approved.unknown) unknown.add(path);
	}
	const missing = classification.gates.filter((gate) => !gates.has(gate));
	const uncovered = classification.unknown.filter((path) => !unknown.has(path));
	if (missing.length || uncovered.length)
		throw new Error(`bound human approval required: ${[...missing, ...uncovered].join(", ")}`);
	return true;
}

export function importApproval(store, runId, document, binding, now = Date.now()) {
	const payload = verifyApproval(document, binding, trustedHumans(store.root), now);
	return store.transaction((state) => {
		const run = state.runs[runId];
		if (!run || digest(run.binding) !== digest(binding)) throw new Error("approval run changed");
		const reused = Object.values(state.runs)
			.flatMap((entry) => entry.approvals ?? [])
			.find((entry) => entry.payload.nonce === payload.nonce);
		if (reused && digest(reused) !== digest(document)) throw new Error("approval nonce was reused");
		run.approvals ??= [];
		if (!run.approvals.some((entry) => digest(entry) === digest(document))) {
			run.approvals.push(document);
			state.audit.push({ event: "approval-imported", runId, keyId: payload.keyId, nonce: payload.nonce, at: now });
		}
		return { runId, keyId: payload.keyId, expiresAt: payload.expiresAt };
	});
}
