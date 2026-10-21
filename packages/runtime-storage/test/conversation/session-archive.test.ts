import { describe, expect, it } from "vitest";
import {
	canonicalizeJson,
	decodeFrames,
	decodeSessionArchive,
	encodeFrames,
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

describe("session archive format v2 (migration workspace)", () => {
	/** 头部未被 MAC 覆盖，可在字节层伪造：magic(8) + ver(2) + metaLen(4) + meta + salt/iv/ct。 */
	function patchHeader(
		bytes: Uint8Array,
		mutate: (meta: Record<string, unknown>) => void,
		headerVersion?: number,
	): Uint8Array {
		const metaLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(10, false);
		const metaStart = 14;
		const meta = JSON.parse(
			new TextDecoder().decode(bytes.subarray(metaStart, metaStart + metaLen)),
		) as Record<string, unknown>;
		mutate(meta);
		const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
		const tail = bytes.subarray(metaStart + metaLen);
		const out = new Uint8Array(metaStart + metaBytes.byteLength + tail.byteLength);
		out.set(bytes.subarray(0, metaStart), 0);
		out.set(metaBytes, metaStart);
		out.set(tail, metaStart + metaBytes.byteLength);
		if (headerVersion !== undefined) {
			new DataView(out.buffer, out.byteOffset, out.byteLength).setUint16(8, headerVersion, false);
		}
		return out;
	}

	async function encodeMigrationArchive(files: ReadonlyArray<{ relativePath: string; bytes: Uint8Array }>) {
		return encodeSessionArchive({
			appVersion: "0.1.3",
			passphrase: "pw",
			randomBytes: fixedRandom(11),
			sessions: [
				{
					sessionId: "sess-mig",
					name: "Migration demo",
					cwd: "C:/source/project",
					fingerprintSource: { sessionId: "sess-mig", entries: [{ text: "hi" }] },
					records: [{ type: "message", id: "m1", text: "hi" }],
				},
			],
			workspace: { sourceCwd: "C:/source/project", files },
		});
	}

	it("Given sessions plus workspace files, When encoded as v2 and decoded, Then workspace bytes round-trip without stringifying and metadata carries sourceCwd/count", async () => {
		const sourceA = new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x00, 0x7f]);
		const sourceB = new Uint8Array(1024).fill(0xcd);
		const archive = await encodeMigrationArchive([
			{ relativePath: "src/main.ts", bytes: sourceA },
			{ relativePath: "docs/nested/蓝图.md", bytes: sourceB },
		]);

		// 头部版本字节是 v2，metadata 声明 workspace。
		expect(new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint16(8, false)).toBe(2);

		const decoded = await decodeSessionArchive(archive, "pw");
		expect(decoded.metadata.formatVersion).toBe(2);
		expect(decoded.metadata.sourceCwd).toBe("C:/source/project");
		expect(decoded.metadata.workspaceFileCount).toBe(2);
		expect(decoded.sessions).toHaveLength(1);
		expect(decoded.sessions[0]?.records).toEqual([{ type: "message", id: "m1", text: "hi" }]);
		expect(decoded.workspace?.sourceCwd).toBe("C:/source/project");
		expect(decoded.workspace?.files.map((file) => file.relativePath)).toEqual(["src/main.ts", "docs/nested/蓝图.md"]);
		expect(decoded.workspace?.files[0]?.bytes).toEqual(sourceA);
		expect(decoded.workspace?.files[1]?.bytes).toEqual(sourceB);
		expect(decoded.workspace?.files[0]?.bytes).toBeInstanceOf(Uint8Array);
	});

	it("Given a v2 migration archive with zero workspace files, When decoded, Then workspace exists but is empty (still a migration package)", async () => {
		const archive = await encodeMigrationArchive([]);
		const decoded = await decodeSessionArchive(archive, "pw");
		expect(decoded.metadata.formatVersion).toBe(2);
		expect(decoded.metadata.workspaceFileCount).toBe(0);
		expect(decoded.workspace?.files).toEqual([]);
	});

	it("Given an encode without workspace input, When encoded, Then bytes stay v1 and decode yields no workspace", async () => {
		const archive = await encodeSessionArchive({
			appVersion: "0.1.3",
			passphrase: "pw",
			randomBytes: fixedRandom(42),
			sessions: [
				{
					sessionId: "s1",
					fingerprintSource: { sessionId: "s1" },
					records: [{ type: "message", id: "1" }],
			},
			],
		});
		expect(new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint16(8, false)).toBe(1);
		const decoded = await decodeSessionArchive(archive, "pw");
		expect(decoded.metadata.formatVersion).toBe(1);
		expect(decoded.metadata.sourceCwd).toBeUndefined();
		expect(decoded.metadata.workspaceFileCount).toBeUndefined();
		expect(decoded.workspace).toBeUndefined();
	});

	it("Given a v1 archive whose payload smuggles workspace frames, When decoded, Then the illegal version/frame mix is rejected", async () => {
		const archive = await encodeMigrationArchive([{ relativePath: "a.txt", bytes: new Uint8Array([1]) }]);
		// 头部未 MAC：把版本与 metadata 一同伪造成 v1，验证 v1 不接受 workspace 帧。
		const forged = patchHeader(
			archive,
			(meta) => {
				meta.formatVersion = 1;
				delete meta.sourceCwd;
				delete meta.workspaceFileCount;
			},
			1,
		);
		await expect(decodeSessionArchive(forged, "pw")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
		});
	});

	it("Given a v2 archive whose declared workspaceFileCount disagrees with the frames, When decoded, Then it is rejected", async () => {
		const archive = await encodeMigrationArchive([
			{ relativePath: "a.txt", bytes: new Uint8Array([1]) },
			{ relativePath: "b.txt", bytes: new Uint8Array([2]) },
		]);
		const forged = patchHeader(archive, (meta) => {
			meta.workspaceFileCount = 5;
		});
		await expect(decodeSessionArchive(forged, "pw")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
		});
	});

	it("Given a version the decoder does not know, When decoded, Then it is rejected as UNSUPPORTED_VERSION", async () => {
		const archive = await encodeMigrationArchive([]);
		const forged = patchHeader(archive, (meta) => {
			meta.formatVersion = 3;
		}, 3);
		await expect(decodeSessionArchive(forged, "pw")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.UNSUPPORTED_VERSION,
		});
	});

	it("Given frames with an unknown kind, When decoded, Then they are rejected", () => {
		const frames = encodeFrames([
			{ kind: 0x05 as never, payload: new Uint8Array([1, 2, 3]) },
		]);
		expect(() => decodeFrames(frames)).toThrow(SessionArchiveError);
		expect(() => decodeFrames(frames)).toThrow(/Unknown frame kind/);
	});

	it("Given a v2 migration archive, When decoded with the wrong passphrase, Then auth fails and nothing materializes", async () => {
		const archive = await encodeMigrationArchive([{ relativePath: "a.txt", bytes: new Uint8Array([9]) }]);
		await expect(decodeSessionArchive(archive, "wrong")).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.AUTH_FAILED,
		});
	});
});
