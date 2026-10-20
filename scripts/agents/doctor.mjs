// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { digest } from "./contracts.mjs";
import { git } from "./git.mjs";
import { assertSchema, canonical } from "./schema.mjs";

const flag = { const: true };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const payloadProperties = {
	version: { const: 1 },
	repository: { type: "string", minLength: 1 },
	policy: hash,
	adapters: hash,
	issuedAt: { type: "integer", minimum: 0 },
	expiresAt: { type: "integer", minimum: 0 },
	controllerProtected: flag,
	credentialsProtected: flag,
	gitProtected: flag,
	processTreeCleanup: flag,
	workerIdentity: { type: "string", minLength: 1, maxLength: 200 },
};
const proofSchema = {
	type: "object",
	additionalProperties: false,
	required: ["keyId", "payload", "signature"],
	properties: {
		keyId: { type: "string", minLength: 1 },
		signature: { type: "string", minLength: 1 },
		payload: {
			type: "object",
			additionalProperties: false,
			required: Object.keys(payloadProperties),
			properties: payloadProperties,
		},
	},
};
export function executionRepository(root) {
	try {
		return realpathSync(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
	} catch {
		return resolve(root);
	}
}

/** A trusted external resource owner attests deployment facts; the worker cannot self-attest. */
export function assertExecutionBoundary({ root, stateDirectory, policy, settings, now = Date.now() }) {
	try {
		if (!stateDirectory) throw new Error("no controller state directory");
		const trusted = JSON.parse(readFileSync(join(stateDirectory, "trusted-execution.json"), "utf8"));
		const proof = assertSchema(
			proofSchema,
			JSON.parse(readFileSync(join(stateDirectory, "execution-proof.json"), "utf8")),
		);
		if (trusted.version !== 1 || !Array.isArray(trusted.keys) || trusted.keys.length > 32)
			throw new Error("invalid trusted keys");
		const keys = trusted.keys.filter((entry) => entry.id === proof.keyId);
		if (keys.length !== 1) throw new Error("unknown or duplicate attestor");
		const key = createPublicKey(keys[0].publicKey);
		if (
			key.asymmetricKeyType !== "ed25519" ||
			!verify(null, Buffer.from(canonical(proof.payload)), key, Buffer.from(proof.signature, "base64"))
		)
			throw new Error("invalid signature");
		const p = proof.payload;
		if (p.repository !== executionRepository(root) || p.policy !== digest(policy) || p.adapters !== digest(settings))
			throw new Error("stale configuration or repository");
		if (p.issuedAt > now || p.expiresAt <= now || p.expiresAt <= p.issuedAt || p.expiresAt - p.issuedAt > 900000)
			throw new Error("expired or invalid attestation lifetime");
		return {
			status: "proven",
			reason:
				"Trusted resource owner attested OS identities, controller/credential/Git protection and process-tree cleanup.",
		};
	} catch {
		throw new Error(
			"Execution boundary is unproven: provide a fresh trusted signed attestation outside the worker; WSL/isolation labels are insufficient.",
		);
	}
}

export function probeTools(root) {
	return Object.fromEntries(
		["bun", "node", "git"].map((id) => {
			try {
				const version = execFileSync(id, ["--version"], {
					cwd: root,
					encoding: "utf8",
					timeout: 3000,
					maxBuffer: 16384,
					windowsHide: true,
					shell: false,
					stdio: ["ignore", "pipe", "ignore"],
				}).trim();
				if (id === "node" && Number(version.match(/^v?(\d+)/u)?.[1] ?? 0) < 20) throw new Error("unsupported Node");
				return [id, { status: "proven", version: version.slice(0, 100) }];
			} catch {
				return [id, { status: "unavailable", reason: `${id} --version failed or runtime is unsupported` }];
			}
		}),
	);
}

export function doctor({ root, policy, settings, stateDirectory, now = Date.now(), probe = probeTools }) {
	const software = Object.entries(probe(root)).map(([id, value]) => ({ id, ...value }));
	const enabled = settings.adapters.filter((a) => a.enabled && policy.allowedProviders.includes(a.provider));
	const runnable = enabled.filter(
		(a) => isAbsolute(a.command[0]) && existsSync(a.command[0]) && a.isolation !== "none",
	);
	const writers = runnable.filter((a) => a.roles.includes("implementer"));
	const reviewers = runnable.filter((a) => a.roles.includes("reviewer"));
	const pair = writers.some((a) =>
		reviewers.some((b) => a.id !== b.id && (!policy.differentReviewerFamily || a.family !== b.family)),
	);
	let isolation;
	try {
		isolation = assertExecutionBoundary({ root, policy, settings, stateDirectory, now });
	} catch (error) {
		isolation = { status: "not-run", reason: error.message };
	}
	const execution = [
		{
			id: "authorization",
			status:
				policy.level > 0 &&
				!policy.paused &&
				["implement", "review", "verify"].every((c) => policy.capabilities.includes(c))
					? "proven"
					: "unavailable",
			reason: "Requires enabled policy and explicitly authorized capabilities/providers.",
		},
		{
			id: "independent-review",
			status: pair ? "proven" : "failed",
			reason:
				"Requires distinct configured executables/identities and the mandated model-family independence; configuration does not prove model quality.",
		},
		{ id: "isolation", ...isolation },
		{
			id: "model-quality",
			status: "not-run",
			reason: "doctor never calls models; quality requires a separately authorized real-task evaluation.",
		},
	];
	const group = (checks) => ({ ready: checks.every((c) => c.status === "proven"), checks });
	const readiness = {
		software: group(software),
		execution: group(execution.filter((c) => c.id !== "model-quality")),
		release: group(
			["ci", "ui", "signing", "publication", "telemetry"].map((id) => ({
				id,
				status: "not-run",
				reason: "Requires fresh candidate-bound runtime/service evidence; local doctor does not establish this.",
			})),
		),
		modelQuality: execution.find((c) => c.id === "model-quality"),
	};
	return {
		contractValid: true,
		targetLevel: policy.targetLevel,
		level: policy.level,
		paused: policy.paused,
		publisherConfigured: settings.publisher?.enabled ?? false,
		readyForModelExecution: readiness.software.ready && readiness.execution.ready,
		readiness,
		adapters: settings.adapters.map(({ id, enabled: on, family, model, isolation: boundary }) => ({
			id,
			enabled: on,
			family,
			model,
			isolation: boundary,
		})),
		note: "Read-only probes and trusted deployment attestations do not prove model quality, CI/UI acceptance or L4.",
	};
}
