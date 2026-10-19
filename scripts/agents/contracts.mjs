// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertSchema, canonical } from "./schema.mjs";

export const digest = (value) =>
	createHash("sha256")
		.update(typeof value === "string" ? value : canonical(value))
		.digest("hex");

export function contract(name, value) {
	if (!/^[a-z-]+$/u.test(name)) throw new Error("invalid schema name");
	const schemaPath = fileURLToPath(new URL(`../../schemas/agents/${name}.schema.json`, import.meta.url));
	return assertSchema(JSON.parse(readFileSync(schemaPath, "utf8")), value);
}

export function validatePolicy(value) {
	contract("policy", value);
	if (value.level > value.targetLevel) throw new Error("current autonomy level exceeds its target");
	if (value.limits.heartbeatMs * 2 >= value.limits.leaseMs) throw new Error("heartbeat must leave lease renewal room");
	if (value.limits.stallMs > value.limits.wallTimeMs) throw new Error("stall timeout exceeds wall time");
	if (!value.requiredChecks.includes("tests") || !value.requiredChecks.includes("check"))
		throw new Error("tests and full check are mandatory");
	const steps = value.rollout.steps;
	if (steps.at(-1) !== 100 || steps.some((step, index) => index > 0 && step <= steps[index - 1])) {
		throw new Error("rollout steps must increase and end at 100");
	}
	return value;
}

export function validateAdapters(value) {
	contract("adapters", value);
	if (new Set(value.adapters.map((adapter) => adapter.id)).size !== value.adapters.length)
		throw new Error("duplicate adapter id");
	for (const adapter of value.adapters) {
		if (adapter.enabled && ["unconfigured", "unknown", "human"].includes(adapter.family))
			throw new Error("unknown adapter family");
		if (adapter.enabled && adapter.model === "unconfigured") throw new Error("adapter model is not configured");
	}
	return value;
}

export function requireCapability(policy, capability) {
	validatePolicy(policy);
	if (policy.paused || policy.level === 0) throw new Error("autonomy is paused");
	if (!policy.capabilities.includes(capability)) throw new Error(`capability is not authorized: ${capability}`);
	const minimum = {
		implement: 1,
		review: 1,
		verify: 1,
		"verify-ui": 1,
		"verify-packaged": 1,
		"integrate-dev": 2,
		"promote-main": 3,
		"publish-test": 3,
		"publish-stable": 4,
	}[capability];
	if (minimum === undefined || policy.level < minimum)
		throw new Error(`insufficient autonomy level for ${capability}`);
}
