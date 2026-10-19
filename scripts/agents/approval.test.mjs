// Copyright The Open Forge contributors.
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertApproved, verifyApproval } from "./approval.mjs";
import { canonical } from "./schema.mjs";

function fixture() {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const binding = { head: "a".repeat(40), tree: "b".repeat(40), policy: "c".repeat(64), contract: "d".repeat(64) };
	const payload = {
		version: 1,
		keyId: "human",
		nonce: "nonce-for-candidate-1",
		issuedAt: 100,
		expiresAt: 200,
		binding,
		gates: ["security"],
		unknown: ["asset.bin"],
		reason: "reviewed concrete candidate",
	};
	const document = { payload, signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString("base64") };
	return { binding, document, trust: new Map([["human", publicKey]]) };
}
describe("human gates require an external signature on the actual candidate", () => {
	it("accepts a signed decision and rejects missing gate and unknown coverage", () => {
		const { binding, document, trust } = fixture();
		expect(assertApproved({ gates: ["security"], unknown: ["asset.bin"] }, binding, [document], trust, 150)).toBe(
			true,
		);
		expect(() => assertApproved({ gates: ["billing"], unknown: [] }, binding, [document], trust, 150)).toThrow(
			/billing/,
		);
		expect(() => assertApproved({ gates: [], unknown: ["other.bin"] }, binding, [document], trust, 150)).toThrow(
			/other.bin/,
		);
	});
	it("rejects tampering, wrong candidate, expired signatures, and self-declared humans", () => {
		const { binding, document, trust } = fixture();
		const forged = structuredClone(document);
		forged.payload.gates.push("billing");
		expect(() => verifyApproval(forged, binding, trust, 150)).toThrow(/signature/);
		expect(() => verifyApproval(document, { ...binding, head: "f".repeat(40) }, trust, 150)).toThrow(
			/different candidate/,
		);
		expect(() => verifyApproval(document, binding, trust, 200)).toThrow(/expired/);
		expect(() => verifyApproval(document, binding, new Map(), 150)).toThrow(/not trusted/);
	});
});
