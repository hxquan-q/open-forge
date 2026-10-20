// Copyright The Open Forge contributors.
// Synthetic test attestation only. This helper never belongs to a production deployment path.
import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./contracts.mjs";
import { executionRepository } from "./doctor.mjs";
import { canonical } from "./schema.mjs";

export function testExecutionProof({ root, store, policy, settings }) {
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	const now = Date.now();
	const payload = {
		version: 1,
		repository: executionRepository(root),
		policy: digest(policy),
		adapters: digest(settings),
		issuedAt: now - 1000,
		expiresAt: now + 600000,
		controllerProtected: true,
		credentialsProtected: true,
		gitProtected: true,
		processTreeCleanup: true,
		workerIdentity: "synthetic-test-fixture-not-real-isolation",
	};
	writeFileSync(
		join(store.root, "trusted-execution.json"),
		JSON.stringify({
			version: 1,
			keys: [{ id: "fixture", publicKey: publicKey.export({ type: "spki", format: "pem" }) }],
		}),
	);
	writeFileSync(
		join(store.root, "execution-proof.json"),
		JSON.stringify({
			keyId: "fixture",
			payload,
			signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64"),
		}),
	);
}
