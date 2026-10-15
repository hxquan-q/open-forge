import { describe, expect, it } from "vitest";
import {
	canonicalizeJson,
	decodeSessionArchive,
	encodeSessionArchive,
	fingerprintSessionPayload,
	resolveSessionArchiveImportConflict,
	SESSION_ARCHIVE_ERROR_CODES,
	SessionArchiveError,
	safePath,
} from "../../src/conversation/session-archive/index.js";

function fixedRandom(seed: number): (size: number) => Uint8Array {
	let state = seed >>> 0;
	return (size) => {
		const out = new Uint8Array(size);
		for (let i = 0; i < size; i++) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			out[i] = state & 0xff;
		}
		return out;
	};
}

describe("session archive format", () => {
	it("Given a session with records and a binary attachment, When exported then imported, Then payload round-trips without stringifying attachment bytes", async () => {
		const attachmentBytes = new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x7f]);
		const archive = await encodeSessionArchive({
			appVersion: "0.1.1",
			passphrase: "test-pass",
			randomBytes: fixedRandom(42),
			sessions: [
				{
					sessionId: "sess-a",
					conversationId: "conv-a",
					name: "Demo",
					fingerprintSource: {
						sessionId: "sess-a",
						entries: [{ role: "user", text: "hello" }],
					},
					records: [
						{ type: "message", id: "m1", text: "hello" },
						{ type: "message", id: "m2", text: "world" },
					],
					attachments: [
						{
							id: "att-1",
							relativePath: "media/shot.png",
							mimeType: "image/png",
							bytes: attachmentBytes,
						},
					],
				},
			],
		});

		const decoded = await decodeSessionArchive(archive, "test-pass");

		expect(decoded.metadata.format).toBe("openforge-session-archive");
		expect(decoded.metadata.formatVersion).toBe(1);
		expect(decoded.metadata.cipher).toBe("aes-256-gcm");
		expect(decoded.metadata.kdf).toBe("scrypt");
		expect(decoded.metadata.sessionCount).toBe(1);
		expect(decoded.sessions).toHaveLength(1);
		expect(decoded.sessions[0]?.records).toEqual([
			{ type: "message", id: "m1", text: "hello" },
			{ type: "message", id: "m2", text: "world" },
		]);
		expect(decoded.sessions[0]?.attachments).toHaveLength(1);
		expect(decoded.sessions[0]?.attachments[0]?.bytes).toEqual(attachmentBytes);
		expect(decoded.sessions[0]?.attachments[0]?.bytes).toBeInstanceOf(Uint8Array);
	});

	it("Given an exported archive, When any ciphertext byte is flipped, Then authentication fails and import is rejected", async () => {
		const archive = await encodeSessionArchive({
			appVersion: "0.1.1",
			passphrase: "secret",
			randomBytes: fixedRandom(7),
			sessions: [
				{
					sessionId: "s1",
					fingerprintSource: { sessionId: "s1", body: "x" },
					records: [{ type: "message", id: "1" }],
				},
			],
		});

		const tampered = new Uint8Array(archive);
		tampered[tampered.byteLength - 3] ^= 0x01;

		await expect(decodeSessionArchive(tampered, "secret")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.AUTH_FAILED,
			name: "SessionArchiveError",
		});
	});

	it("Given archive relative paths, When safePath sees .. or a symlink component, Then the path is rejected", () => {
		expect(() => safePath("../etc/passwd")).toThrow(SessionArchiveError);
		expect(() => safePath("foo/../../bar")).toThrow(SessionArchiveError);
		expect(() => safePath("/abs/path")).toThrow(SessionArchiveError);
		expect(() => safePath("C:/windows")).toThrow(SessionArchiveError);
		expect(safePath("media/a.png")).toBe("media/a.png");
		expect(safePath("media\\nested\\file.bin")).toBe("media/nested/file.bin");

		expect(() =>
			safePath("ok/link/file", {
				isSymbolicLink: (joined) => joined === "ok/link",
			}),
		).toThrowError(/Symlink escape/);
	});

	it("Given two session copies with different ids but same content, When fingerprints are compared, Then identity keys alias and import is idempotent", async () => {
		const left = await fingerprintSessionPayload({
			sessionId: "account-a-id",
			entries: [{ text: "same" }],
			meta: { title: "t" },
		});
		const right = await fingerprintSessionPayload({
			conversationId: "account-b-id",
			entries: [{ text: "same" }],
			meta: { title: "t" },
		});
		// Different identity values → different fingerprints
		expect(left).not.toBe(right);

		const sameIdentityAlias = await fingerprintSessionPayload({
			sessionId: "shared",
			entries: [{ text: "same" }],
		});
		const aliasedFromConversation = await fingerprintSessionPayload({
			conversationId: "shared",
			entries: [{ text: "same" }],
		});
		expect(sameIdentityAlias).toBe(aliasedFromConversation);
		expect(canonicalizeJson({ sessionId: "x", z: 1, a: 2 })).toBe(
			canonicalizeJson({ conversationId: "x", a: 2, z: 1 }),
		);

		const conflict = resolveSessionArchiveImportConflict({
			existingFingerprint: sameIdentityAlias,
			incomingFingerprint: aliasedFromConversation,
			existingMtimeMs: 100,
			incomingMtimeMs: 999,
		});
		expect(conflict).toEqual({
			action: "skip-idempotent",
			reason: "fingerprint-match",
			mtimeHint: "incoming-newer",
		});

		const createCopy = resolveSessionArchiveImportConflict({
			existingFingerprint: "aaa",
			incomingFingerprint: "bbb",
			existingMtimeMs: 50,
			incomingMtimeMs: 10,
		});
		expect(createCopy.action).toBe("create-copy");
		expect(createCopy.reason).toBe("default-create-copy");
		expect(createCopy.mtimeHint).toBe("existing-newer");
	});

	it("Given wrong passphrase, When decoding, Then auth failure is explicit", async () => {
		const archive = await encodeSessionArchive({
			appVersion: "0.1.1",
			passphrase: "correct",
			randomBytes: fixedRandom(99),
			sessions: [
				{
					sessionId: "s",
					fingerprintSource: { sessionId: "s" },
					records: [],
				},
			],
		});
		await expect(decodeSessionArchive(archive, "wrong")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.AUTH_FAILED,
		});
	});
});
