// Copyright The Open Forge contributors.
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { digest } from "./contracts.mjs";
import { assertExecutionBoundary, doctor } from "./doctor.mjs";
import { canonical } from "./schema.mjs";

const roots = [];
const tools = () => Object.fromEntries(["bun", "node", "git"].map((id) => [id, { status: "proven", version: "test" }]));
function context() {
	const root = mkdtempSync(join(tmpdir(), "forge-doctor-"));
	roots.push(root);
	const policy = JSON.parse(readFileSync(new URL("../../project/autonomy-policy.json", import.meta.url)));
	const adapter = (id, family, role) => ({
		id,
		family,
		model: "test",
		provider: "test",
		roles: [role],
		enabled: true,
		command: [process.execPath],
		isolation: "external-sandbox",
	});
	const settings = { adapters: [adapter("writer", "one", "implementer"), adapter("review", "two", "reviewer")] };
	policy.level = 1;
	policy.allowedProviders = ["test"];
	policy.capabilities = ["implement", "review", "verify"];
	return { root, stateDirectory: root, policy, settings, probe: tools, now: 10000 };
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("separates software readiness from real execution and deferred release evidence", () => {
	const result = doctor(context());
	expect(result.readiness.software.ready).toBe(true);
	expect(result.readyForModelExecution).toBe(false);
	expect(result.readiness.execution.checks.find((entry) => entry.id === "isolation").status).toBe("not-run");
	expect(result.readiness.release.ready).toBe(false);
	expect(result.readiness.release.checks.map((entry) => entry.id)).toContain("ci");
});
it("does not trust isolation labels or unsigned proof files", () => {
	const c = context();
	writeFileSync(join(c.root, "execution-proof.json"), JSON.stringify({ payload: { isolated: true } }));
	expect(() => assertExecutionBoundary(c)).toThrow(/execution boundary/i);
});
it("binds trusted signed attestations to configuration, lifetime and repository", () => {
	const c = context();
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	writeFileSync(
		join(c.root, "trusted-execution.json"),
		JSON.stringify({
			version: 1,
			keys: [{ id: "operator", publicKey: publicKey.export({ type: "spki", format: "pem" }) }],
		}),
	);
	const payload = {
		version: 1,
		repository: c.root,
		policy: digest(c.policy),
		adapters: digest(c.settings),
		issuedAt: 9000,
		expiresAt: 20000,
		controllerProtected: true,
		credentialsProtected: true,
		gitProtected: true,
		processTreeCleanup: true,
		workerIdentity: "test-only-attestation",
	};
	const proof = {
		keyId: "operator",
		payload,
		signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64"),
	};
	writeFileSync(join(c.root, "execution-proof.json"), JSON.stringify(proof));
	expect(() => assertExecutionBoundary(c)).not.toThrow();
	expect(doctor(c).readyForModelExecution).toBe(true);
	expect(() => assertExecutionBoundary({ ...c, now: 21000 })).toThrow(/execution boundary/i);
	expect(() => assertExecutionBoundary({ ...c, root: join(c.root, "other") })).toThrow(/execution boundary/i);
	c.settings.adapters[0].model = "changed";
	expect(() => assertExecutionBoundary(c)).toThrow(/execution boundary/i);
});
it("rejects same-family review and keeps missing tools visible", () => {
	const c = context();
	c.settings.adapters[1].family = "one";
	c.probe = () => ({ ...tools(), bun: { status: "unavailable", reason: "not installed" } });
	const result = doctor(c);
	expect(result.readiness.software.ready).toBe(false);
	expect(result.readiness.execution.checks.find((entry) => entry.id === "independent-review").status).toBe("failed");
});
