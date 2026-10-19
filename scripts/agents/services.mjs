// Copyright The Open Forge contributors.
import { createPublicKey, verify } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contract, digest } from "./contracts.mjs";
import { assertSchema, canonical } from "./schema.mjs";

const text = { type: "string", minLength: 1, maxLength: 1000 };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const count = { type: "integer", minimum: 0 };
const platform = { type: "string", enum: ["windows", "macos", "linux"] };
const closed = (properties) => ({
	type: "object",
	additionalProperties: false,
	required: Object.keys(properties),
	properties,
});
const DATA = {
	ci: closed({
		repository: text,
		head: { type: "string", pattern: "^[a-f0-9]{40,64}$" },
		tree: { type: "string", pattern: "^[a-f0-9]{40,64}$" },
		checks: { type: "array", minItems: 1, uniqueItems: true, items: text },
		passed: { const: true },
	}),
	artifact: closed({
		platform,
		version: text,
		sha256: hash,
		size: { type: "integer", minimum: 1 },
		head: { type: "string", pattern: "^[a-f0-9]{40,64}$" },
		signatureVerified: { const: true },
	}),
	publication: closed({
		idempotencyKey: hash,
		operation: { type: "string", enum: ["publish", "query", "advance", "pause", "resume"] },
		status: { type: "string", enum: ["published", "paused", "not-found"] },
		rolloutPercent: { type: "integer", minimum: 0, maximum: 100 },
		remoteId: text,
	}),
	telemetry: closed({
		platform,
		from: count,
		to: count,
		sessions: count,
		crashes: count,
		baselineSessions: count,
		baselineCrashes: count,
	}),
	cleanup: closed({
		resource: { type: "string", enum: ["run", "release"] },
		id: text,
		generation: { type: "integer", minimum: 1 },
		resourceId: text,
		processTreeGone: { const: true },
		mountsRevoked: { const: true },
		credentialsRevoked: { const: true },
	}),
};

export function trustedServices(directory) {
	const path = join(directory, "trusted-services.json");
	if (lstatSync(path).isSymbolicLink()) throw new Error("service trust cannot be a symbolic link");
	const config = JSON.parse(readFileSync(path, "utf8"));
	assertSchema(
		closed({
			version: { const: 1 },
			keys: {
				type: "array",
				minItems: 1,
				maxItems: 32,
				items: closed({
					id: text,
					publicKey: text,
					roles: {
						type: "array",
						minItems: 1,
						uniqueItems: true,
						items: { type: "string", enum: Object.keys(DATA) },
					},
				}),
			},
		}),
		config,
	);
	const keys = new Map();
	for (const key of config.keys) {
		if (keys.has(key.id)) throw new Error("duplicate service key");
		const publicKey = createPublicKey(key.publicKey);
		if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("service proof requires Ed25519 keys");
		keys.set(key.id, { publicKey, roles: key.roles });
	}
	return keys;
}

export function verifyServiceProof(document, { kind, subject, trust, now = Date.now() }) {
	contract("service-proof", document);
	const { payload, signature } = document;
	assertSchema(DATA[payload.kind], payload.data);
	if (payload.kind !== kind || payload.subject !== subject)
		throw new Error("service proof is bound to another subject or kind");
	if (
		!Number.isSafeInteger(now) ||
		now < payload.issuedAt ||
		now >= payload.expiresAt ||
		payload.expiresAt - payload.issuedAt > 86400000
	)
		throw new Error("service proof is expired or outside its clock interval");
	const key = trust.get(payload.keyId);
	if (
		!key?.roles.includes(kind) ||
		!verify(null, Buffer.from(canonical(payload)), key.publicKey, Buffer.from(signature, "base64"))
	)
		throw new Error("service signature or role is not trusted");
	return payload;
}

export function cleanupSubject(state, resource, id) {
	if (!["run", "release"].includes(resource)) throw new Error("invalid cleanup resource");
	const item = resource === "run" ? state.runs[id] : state.releases[id];
	if (
		!item ||
		(!item.cleanupUnknown &&
			!["running", "verifying", "integrating", "preparing", "publishing"].includes(item.status))
	)
		throw new Error("resource does not require cleanup");
	const lease = resource === "run" ? state.leases[item.task] : null;
	if (resource === "run" && lease?.runId !== id) throw new Error("cleanup lease belongs to another run");
	return digest({
		resource,
		id,
		generation: lease?.generation ?? item.generation,
		pid: item.pid ?? null,
		status: item.status,
	});
}

/** Parent ESRCH is insufficient: the external sandbox owner confirms the whole resource was revoked. */
export function recoverCleanup(store, document, now = Date.now()) {
	contract("service-proof", document);
	const { resource, id, generation } = document.payload.data;
	const subject = cleanupSubject(store.read(), resource, id);
	const payload = verifyServiceProof(document, { kind: "cleanup", subject, trust: trustedServices(store.root), now });
	return store.transaction((state) => {
		if (cleanupSubject(state, resource, id) !== subject) throw new Error("cleanup resource changed");
		const item = resource === "run" ? state.runs[id] : state.releases[id];
		const expected = resource === "run" ? state.leases[item.task]?.generation : item.generation;
		if (generation !== expected) throw new Error("cleanup generation does not match");
		item.cleanupUnknown = false;
		item.pid = null;
		item.status = resource === "run" ? "failed" : "publication-unknown";
		if (resource === "release") {
			item.generation++;
			item.operation.status = "unknown";
		} else {
			const lease = state.leases[item.task];
			lease.generation++;
			lease.status = "released";
			lease.expiresAt = now;
		}
		state.control.paused = true;
		item.cleanupProof = document;
		state.audit.push({ event: "cleanup-confirmed", resource, id, keyId: payload.keyId, at: now });
		return { resource, id, status: item.status, paused: state.control.paused };
	});
}
