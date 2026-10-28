// Copyright The Open Forge contributors.
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ENV_AGENT_DIR } from "@vetta/coding-agent/config";
import {
	FileConversationRepository,
	FileConversationRuntimeSessionCatalog,
	FileConversationRuntimeSessionFileHistoryReader,
} from "@vetta/runtime-node/conversation";
import {
	decodeSessionArchive,
	encodeSessionArchive,
	SESSION_ARCHIVE_ERROR_CODES,
} from "@vetta/runtime-storage/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	applyProjectMigrationArchive,
	exportProjectMigrationArchive,
	previewProjectMigrationFromFile,
} from "./project-migration-service.js";
import {
	exportSessionArchiveToBytes,
	fingerprintConversationFile,
	importSessionArchiveFromBytes,
	type KnownArchiveFingerprint,
	parseConversationFile,
} from "./session-archive-service.js";

const saveDialog = vi.fn<() => Promise<{ canceled: boolean; filePath?: string }>>();
vi.mock("electron", () => ({
	app: { getVersion: () => "0.1.3" },
	dialog: { showSaveDialog: () => saveDialog() },
}));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: () => undefined }) }));

describe("native session archive portability", () => {
	const roots: string[] = [];
	afterEach(async () => {
		vi.unstubAllEnvs();
		saveDialog.mockReset();
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});
	async function root(): Promise<string> {
		const path = await mkdtemp(join(tmpdir(), "native-archive-"));
		roots.push(path);
		return path;
	}
	async function source() {
		const base = await root();
		const cwd = join(base, "source-project");
		await mkdir(cwd);
		await mkdir(join(cwd, "nested"));
		const artifact = new Uint8Array([0, 128, 255, 42]);
		await writeFile(join(cwd, "nested", "artifact.bin"), artifact);
		const repository = new FileConversationRepository({ rootDir: join(base, "source-sessions") });
		const sessionId = "native/session";
		try {
			await repository.create({ sessionId, createdAt: 100, cwd });
			await repository.append(sessionId, 0, [
				{ type: "turn.started", sessionId, turnId: "t1", snapshotId: "snap", timestamp: 101 },
				{
					type: "message.appended",
					sessionId,
					turnId: "t1",
					timestamp: 102,
					message: { role: "user", content: `inspect ${cwd}/nested/artifact.bin`, timestamp: 102 },
				},
				{
					type: "message.appended",
					sessionId,
					turnId: "t1",
					timestamp: 103,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "artifact is ready" }],
						api: "openai-responses",
						provider: "openai",
						model: "fixture",
						usage: {
							input: 7,
							output: 3,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 10,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "stop",
						timestamp: 103,
					},
				},
				{ type: "turn.completed", sessionId, turnId: "t1", stopReason: "stop", timestamp: 104 },
			]);
			await repository.execute(sessionId, null, { type: "session.name.set", name: "portable native history" });
			return { cwd, sessionId, sessionPath: repository.resolveConversationPath(sessionId), artifact };
		} finally {
			await repository.close();
		}
	}

	it("exports current identity/title/cwd and restores a discoverable, readable v1 conversation with unchanged history", async () => {
		const input = await source();
		const bytes = await exportSessionArchiveToBytes({ sessionPath: input.sessionPath, passphrase: "pw" });
		const decoded = await decodeSessionArchive(bytes, "pw");
		expect(decoded.sessions[0]).toMatchObject({
			sessionId: input.sessionId,
			name: "portable native history",
			cwd: input.cwd,
		});
		const target = await root();
		const decisions = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () => new Map(),
			resolveImportDirectory: async () => target,
		});
		const writtenPath = decisions[0]!.writtenPath!;
		const reader = new FileConversationRuntimeSessionFileHistoryReader();
		expect(reader.canRead(writtenPath)).toBe(true);
		expect(reader.read(writtenPath)).toEqual(reader.read(input.sessionPath));
		const catalog = new FileConversationRuntimeSessionCatalog();
		expect(await catalog.listSessions(input.cwd, target)).toEqual([
			expect.objectContaining({ id: input.sessionId, name: "portable native history", path: writtenPath }),
		]);
		const second = await importSessionArchiveFromBytes(bytes, "pw", {
			listKnownFingerprints: async () => new Map(),
			resolveImportDirectory: async () => target,
		});
		expect(second[0]?.conflict.action).toBe("skip-idempotent");
		expect(second[0]?.writtenPath).toBe(writtenPath);
	});

	it("exports, previews, relocates and reopens native history plus binary artifacts across isolated device roots", async () => {
		const input = await source();
		const archivePath = join(await root(), "project.ofar");
		saveDialog.mockResolvedValueOnce({ canceled: false, filePath: archivePath });
		await exportProjectMigrationArchive({
			cwd: input.cwd,
			passphrase: "pw",
			includeWorkspace: true,
			listSessionPaths: async () => [input.sessionPath],
		});
		const preview = await previewProjectMigrationFromFile(archivePath, "pw");
		expect(preview).toMatchObject({
			classic: false,
			sessions: [{ sessionId: input.sessionId, name: "portable native history" }],
			workspaceFileCount: 1,
		});
		vi.stubEnv(ENV_AGENT_DIR, join(await root(), "other-device-agent"));
		const targetCwd = join(await root(), "relocated-project");
		const index = new Map<string, KnownArchiveFingerprint>();
		const report = await applyProjectMigrationArchive({
			archivePath,
			passphrase: "pw",
			targetCwd,
			listKnownFingerprints: async () => index,
		});
		const writtenPath = report.sessions[0]!.writtenPath!;
		const reader = new FileConversationRuntimeSessionFileHistoryReader();
		expect(reader.canRead(writtenPath)).toBe(true);
		expect(reader.read(writtenPath)).toEqual(reader.read(input.sessionPath));
		const repository = new FileConversationRepository({ rootDir: dirname(writtenPath) });
		try {
			const document = await repository.readDocument(input.sessionId);
			expect(document.identity.cwd).toBe(resolve(targetCwd));
			expect(document.name).toBe("portable native history");
		} finally {
			await repository.close();
		}
		const sourceRecords = (await readFile(input.sessionPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown);
		const targetRecords = (await readFile(writtenPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown);
		expect(targetRecords.slice(1)).toEqual(sourceRecords.slice(1));
		expect(new Uint8Array(await readFile(join(targetCwd, "nested/artifact.bin")))).toEqual(input.artifact);
		expect(await new FileConversationRuntimeSessionCatalog().listSessions(targetCwd, dirname(writtenPath))).toEqual([
			expect.objectContaining({ path: writtenPath, cwd: resolve(targetCwd), id: input.sessionId }),
		]);
		index.set(await fingerprintConversationFile(await readFile(writtenPath, "utf8")), {
			sessionPath: writtenPath,
			mtimeMs: 1,
		});
		const second = await applyProjectMigrationArchive({
			archivePath,
			passphrase: "pw",
			targetCwd,
			listKnownFingerprints: async () => index,
		});
		expect(second.sessions[0]?.conflict.action).toBe("skip-idempotent");
		expect(second.workspace).toEqual({ written: 0, skipped: 1, overwritten: 0, failed: [] });
		const resumed = new FileConversationRepository({ rootDir: dirname(writtenPath) });
		try {
			const loaded = await resumed.load(input.sessionId);
			await resumed.append(input.sessionId, loaded.version, [
				{ type: "turn.started", sessionId: input.sessionId, turnId: "t2", snapshotId: "snap-2", timestamp: 201 },
				{
					type: "message.appended",
					sessionId: input.sessionId,
					turnId: "t2",
					timestamp: 202,
					message: { role: "user", content: "continue after migration", timestamp: 202 },
				},
				{ type: "turn.completed", sessionId: input.sessionId, turnId: "t2", stopReason: "stop", timestamp: 203 },
			]);
			expect((await resumed.load(input.sessionId)).messages).toContainEqual(
				expect.objectContaining({ role: "user", content: "continue after migration" }),
			);
		} finally {
			await resumed.close();
		}
	});

	it("refuses a different native history with the same canonical identity instead of overwriting or creating an unreadable copy", async () => {
		const input = await source();
		const bytes = await exportSessionArchiveToBytes({ sessionPath: input.sessionPath, passphrase: "" });
		const target = await root();
		const options = { listKnownFingerprints: async () => new Map(), resolveImportDirectory: async () => target };
		const first = await importSessionArchiveFromBytes(bytes, "", options);
		const original = await readFile(first[0]!.writtenPath!, "utf8");
		const repository = new FileConversationRepository({ rootDir: dirname(input.sessionPath) });
		try {
			await repository.execute(input.sessionId, null, { type: "session.name.set", name: "changed source" });
		} finally {
			await repository.close();
		}
		const changed = await exportSessionArchiveToBytes({ sessionPath: input.sessionPath, passphrase: "" });
		await expect(importSessionArchiveFromBytes(changed, "", options)).rejects.toMatchObject({
			archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
		});
		expect(await readFile(first[0]!.writtenPath!, "utf8")).toBe(original);
	});

	it("deduplicates repeated sessions inside a single archive before publishing another file", async () => {
		const input = await source();
		const parsed = parseConversationFile(await readFile(input.sessionPath, "utf8"), input.sessionId);
		const payload = { ...parsed, fingerprintSource: { records: parsed.records } };
		const bytes = await encodeSessionArchive({ appVersion: "0.1.3", passphrase: "", sessions: [payload, payload] });
		const target = await root();
		const decisions = await importSessionArchiveFromBytes(bytes, "", {
			listKnownFingerprints: async () => new Map(),
			resolveImportDirectory: async () => target,
		});
		expect(decisions.map((decision) => decision.conflict.action)).toEqual(["create-copy", "skip-idempotent"]);
		expect((await readdir(target)).filter((file) => file.endsWith(".jsonl"))).toHaveLength(1);
	});

	it.each([
		["history", "same"],
		["history", "additional"],
		["history", "conflict"],
		["migration", "same"],
		["migration", "additional"],
		["migration", "conflict"],
	])("%s duplicate records still restore or validate %s attachments", async (kind, scenario) => {
		const input = await source();
		const parsed = parseConversationFile(await readFile(input.sessionPath, "utf8"), input.sessionId);
		const first = {
			...parsed,
			fingerprintSource: { records: parsed.records },
			attachments: [{ id: "a", relativePath: "assets/a.bin", bytes: input.artifact }],
		};
		const second = {
			...first,
			attachments:
				scenario === "additional"
					? [...first.attachments, { id: "b", relativePath: "assets/b.bin", bytes: new Uint8Array([77]) }]
					: scenario === "conflict"
						? [{ ...first.attachments[0]!, bytes: new Uint8Array([88]) }]
						: first.attachments,
		};
		const bytes = await encodeSessionArchive({
			appVersion: "0.1.3",
			passphrase: "",
			sessions: [first, second],
			workspace: kind === "migration" ? { sourceCwd: input.cwd, files: [] } : undefined,
		});
		const target = await root();
		vi.stubEnv(ENV_AGENT_DIR, join(target, "agent"));
		const archivePath = join(target, "duplicate.ofar");
		await writeFile(archivePath, bytes);
		const importArchive = async () =>
			kind === "migration"
				? (
						await applyProjectMigrationArchive({
							archivePath,
							passphrase: "",
							targetCwd: join(target, "project"),
							listKnownFingerprints: async () => new Map(),
						})
					).sessions
				: importSessionArchiveFromBytes(bytes, "", {
						listKnownFingerprints: async () => new Map(),
						resolveImportDirectory: async () => join(target, "sessions"),
					});
		if (scenario === "conflict") {
			await expect(importArchive()).rejects.toMatchObject({
				archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			});
		} else {
			const decisions = await importArchive();
			expect(decisions.map((decision) => decision.conflict.action)).toEqual(["create-copy", "skip-idempotent"]);
			const dir = dirname(decisions[0]!.writtenPath!);
			expect(new Uint8Array(await readFile(join(dir, "assets/a.bin")))).toEqual(input.artifact);
			if (scenario === "additional")
				expect(new Uint8Array(await readFile(join(dir, "assets/b.bin")))).toEqual(new Uint8Array([77]));
		}
	});

	it.each(["conflict", "directory-link"])(
		"an attachment %s does not overwrite user files or commit an incomplete conversation",
		async (scenario) => {
			const input = await source();
			const parsed = parseConversationFile(await readFile(input.sessionPath, "utf8"), input.sessionId);
			const bytes = await encodeSessionArchive({
				appVersion: "0.1.3",
				passphrase: "",
				sessions: [
					{
						...parsed,
						fingerprintSource: { records: parsed.records },
						attachments: [{ id: "image", relativePath: "assets/image.bin", bytes: input.artifact }],
					},
				],
			});
			const target = await root();
			const outside = await root();
			if (scenario === "directory-link") {
				await symlink(outside, join(target, "assets"), process.platform === "win32" ? "junction" : "dir");
			} else {
				await mkdir(join(target, "assets"));
				await writeFile(join(target, "assets/image.bin"), "user-owned");
			}
			await expect(
				importSessionArchiveFromBytes(bytes, "", {
					listKnownFingerprints: async () => new Map(),
					resolveImportDirectory: async () => target,
				}),
			).rejects.toMatchObject({
				archiveCode:
					scenario === "directory-link"
						? SESSION_ARCHIVE_ERROR_CODES.UNSAFE_PATH
						: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			});
			expect(await readdir(outside)).toEqual([]);
			expect(await readdir(target)).toEqual(["assets"]);
			if (scenario === "conflict")
				expect(await readFile(join(target, "assets/image.bin"), "utf8")).toBe("user-owned");
		},
	);

	it.each(["conversation.seed", "conversation.import.seed"])(
		"preserves a %s title and later name commands without changing any records",
		(recordType) => {
			const records = [
				{ recordType: "conversation.header", schemaVersion: 2, sessionId: "seeded", createdAt: 100 },
				{ recordType, name: "seed title", entries: [], activeLeafId: null },
				null,
				{ recordType: "conversation.document.operation", command: { type: "session.name.set", name: "" } },
			];
			expect(
				parseConversationFile(
					records
						.slice(0, 2)
						.map((record) => JSON.stringify(record))
						.join("\n"),
					"fallback",
				).name,
			).toBe("seed title");
			const parsed = parseConversationFile(records.map((record) => JSON.stringify(record)).join("\n"), "fallback");
			expect(parsed).toMatchObject({ sessionId: "seeded", name: "", records });
		},
	);

	it("refuses corrupt history instead of replacing a broken record with a hash in a successful backup", async () => {
		const input = await source();
		await appendFile(input.sessionPath, '{"truncated":');
		const original = await readFile(input.sessionPath, "utf8");
		await expect(
			exportSessionArchiveToBytes({ sessionPath: input.sessionPath, passphrase: "" }),
		).rejects.toMatchObject({ archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME });
		await expect(
			exportProjectMigrationArchive({
				cwd: input.cwd,
				passphrase: "",
				includeWorkspace: true,
				listSessionPaths: async () => [input.sessionPath],
			}),
		).rejects.toMatchObject({ archiveCode: SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME });
		expect(saveDialog).not.toHaveBeenCalled();
		expect(await readFile(input.sessionPath, "utf8")).toBe(original);
	});
});
