import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getVersion: () => "0.1.1" },
	dialog: {
		showSaveDialog: async () => ({ canceled: true }),
		showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
	},
}));

vi.mock("../i18n/index.js", () => ({
	mainT: (key: string) => key,
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ warn: () => undefined, info: () => undefined }),
}));

const { exportSessionArchiveToBytes, fingerprintConversationFile, importSessionArchiveFromBytes } = await import(
	"./session-archive-service.js"
);

describe("desktop session archive service", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	it("Given an exported session archive, When imported twice, Then the second import skips by fingerprint", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-archive-svc-"));
		roots.push(root);
		const sessionPath = join(root, "demo.jsonl");
		const content = [
			JSON.stringify({
				type: "session",
				version: 3,
				id: "sess-1",
				timestamp: "2026-01-01T00:00:00.000Z",
				cwd: root,
			}),
			JSON.stringify({
				type: "message",
				id: "m1",
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				message: { role: "user", content: "hi", timestamp: "2026-01-01T00:00:01.000Z" },
			}),
		].join("\n");
		await writeFile(sessionPath, `${content}\n`, "utf8");

		const bytes = await exportSessionArchiveToBytes({
			sessionPath,
			passphrase: "pw",
			appVersion: "0.1.1",
		});
		const fingerprint = await fingerprintConversationFile(await readFile(sessionPath, "utf8"));

		const first = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () => new Map(),
			resolveImportDirectory: async () => root,
		});
		expect(first[0]?.conflict.action).toBe("create-copy");
		expect(first[0]?.writtenPath).toBeTruthy();

		const second = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () =>
				new Map([[fingerprint, { sessionPath: first[0]!.writtenPath!, mtimeMs: 1 }]]),
			resolveImportDirectory: async () => root,
		});
		expect(second[0]?.conflict.action).toBe("skip-idempotent");
		expect(second[0]?.writtenPath).toBe(first[0]?.writtenPath);
	});
});
