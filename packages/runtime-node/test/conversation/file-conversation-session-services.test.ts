import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageAppendedEvent, TurnCompletedEvent, TurnStartedEvent } from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ConversationOwnershipConflictError,
	FileConversationOwnershipManager,
	FileConversationRepository,
	FileConversationRuntimeSessionCatalog,
	FileConversationRuntimeSessionFileHistoryReader,
} from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Greenfield runtime session services", () => {
	it("keeps sidebar ordering based on message activity when a session file is touched while opening", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "older", createdAt: 10, cwd });
		await repository.append("older", 0, [
			started("older", 100),
			userMessage("older", "older question", 110),
			assistantMessage("older", "older answer", 120),
			completed("older", 130),
		]);
		await repository.create({ sessionId: "newer", createdAt: 20, cwd });
		await repository.append("newer", 0, [
			started("newer", 200),
			userMessage("newer", "newer question", 210),
			assistantMessage("newer", "newer answer", 220),
			completed("newer", 230),
		]);
		const olderPath = repository.resolveConversationPath("older");
		await repository.close();

		// Import/resume may rewrite or touch the file without adding a new message. That
		// storage detail must not make a merely opened conversation look newly active.
		const touchedAt = new Date("2030-01-01T00:00:00.000Z");
		await utimes(olderPath, touchedAt, touchedAt);

		const catalog = new FileConversationRuntimeSessionCatalog();
		const sessions = await catalog.listSessions(cwd, rootDir);

		expect(sessions.map(({ id, modifiedAt }) => ({ id, modifiedAt }))).toEqual([
			{ id: "newer", modifiedAt: 220 },
			{ id: "older", modifiedAt: 120 },
		]);
	});

	it("falls back to file modification time when a session has no conversation messages", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "empty", createdAt: 10, cwd });
		const sessionPath = repository.resolveConversationPath("empty");
		await repository.close();
		const touchedAt = new Date("2026-08-27T12:00:00.000Z");
		await utimes(sessionPath, touchedAt, touchedAt);

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session?.modifiedAt).toBe(touchedAt.getTime());
	});

	it("lists, reads, renames and deletes conversation artifacts without exposing storage details", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "greenfield/session";
		await repository.create({ sessionId, createdAt: 100, agentId: "reviewer" });
		await repository.append(sessionId, 0, [
			started(sessionId),
			userMessage(sessionId, "hello"),
			assistantMessage(sessionId, "world"),
			completed(sessionId),
		]);
		const stored = await repository.load(sessionId);
		await repository.saveSnapshot(sessionId, {
			sessionId,
			version: stored.version,
			messages: stored.messages,
			createdAt: 200,
		});
		const sessionPath = repository.resolveConversationPath(sessionId);
		const snapshotPath = sessionPath.replace(/\.conversation\.jsonl$/, ".snapshot.json");
		await repository.close();
		await writeFile(join(rootDir, "corrupt.conversation.jsonl"), "not-json\n", "utf8");

		const catalog = new FileConversationRuntimeSessionCatalog({
			roots: [{ cwd, sessionDir: rootDir }],
			artifactCleaner: {
				deleteSessionArtifacts: vi.fn(async (deletedSessionId) => {
					expect(deletedSessionId).toBe(sessionId);
				}),
			},
		});
		const reader = new FileConversationRuntimeSessionFileHistoryReader();

		expect(await catalog.listProjects()).toEqual([{ cwd, sessionCount: 1 }]);
		expect(await catalog.listSessions(cwd, rootDir)).toEqual([
			expect.objectContaining({
				id: sessionId,
				path: sessionPath,
				agentId: "reviewer",
				cwd,
				firstMessage: "hello",
				lastMessagePreview: "world",
			}),
		]);
		expect(await catalog.ownsSession(sessionPath)).toBe(true);
		expect(reader.canRead(sessionPath)).toBe(true);
		expect(reader.read(sessionPath).history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "message",
					message: expect.objectContaining({ role: "user", content: "hello" }),
				}),
			]),
		);

		await catalog.renameSession(sessionPath, "renamed");
		expect((await catalog.listSessions(cwd, rootDir))[0]?.name).toBe("renamed");

		await catalog.deleteSessionArtifacts(sessionPath);
		expect(existsSync(sessionPath)).toBe(false);
		expect(existsSync(`${sessionPath}.lock`)).toBe(false);
		expect(existsSync(`${sessionPath}.owner.lock`)).toBe(false);
		expect(existsSync(snapshotPath)).toBe(false);
	});

	it("lists stat-index metadata without building document state", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "indexed", createdAt: 10, cwd });
		await repository.append("indexed", 0, [
			started("indexed", 100),
			userMessage("indexed", "first   user\nquestion", 110),
			assistantMessage("indexed", "first answer", 120),
			userMessage("indexed", "second question", 130),
			assistantMessage("indexed", "last answer", 140),
			completed("indexed", 150),
		]);
		const sessionPath = repository.resolveConversationPath("indexed");
		await repository.close();
		const fileSize = (await stat(sessionPath)).size;

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session).toMatchObject({
			id: "indexed",
			path: sessionPath,
			cwd,
			firstMessage: "first user question",
			modifiedAt: 140,
			lastMessagePreview: "last answer",
			fileSizeBytes: fileSize,
		});
	});

	it("skips malformed JSONL lines while indexing a session", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "tolerant", createdAt: 10, cwd });
		await repository.append("tolerant", 0, [
			started("tolerant", 100),
			userMessage("tolerant", "surviving question", 110),
			assistantMessage("tolerant", "surviving answer", 120),
			completed("tolerant", 130),
		]);
		const sessionPath = repository.resolveConversationPath("tolerant");
		await repository.close();
		const original = await readFile(sessionPath, "utf8");
		const lines = original.split("\n");
		lines.splice(2, 0, "{not-valid-json", "   ");
		await writeFile(sessionPath, lines.join("\n"), "utf8");

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session).toMatchObject({
			id: "tolerant",
			firstMessage: "surviving question",
			lastMessagePreview: "surviving answer",
		});
	});

	it("reports empty sessions without a false message preview", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "blank", createdAt: 10, cwd });
		await repository.close();

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session?.firstMessage).toBe("(no messages)");
		expect(session?.lastMessagePreview).toBeUndefined();
		expect(session?.fileSizeBytes).toBeGreaterThan(0);
	});

	it("truncates the last-message preview for the list index", async () => {
		const rootDir = await createTemporaryRoot();
		const cwd = join(rootDir, "workspace");
		const repository = new FileConversationRepository({ rootDir });
		await repository.create({ sessionId: "verbose", createdAt: 10, cwd });
		await repository.append("verbose", 0, [
			started("verbose", 100),
			userMessage("verbose", "question", 110),
			assistantMessage("verbose", "x".repeat(400), 120),
			completed("verbose", 130),
		]);
		await repository.close();

		const catalog = new FileConversationRuntimeSessionCatalog();
		const [session] = await catalog.listSessions(cwd, rootDir);

		expect(session?.lastMessagePreview).toHaveLength(120);
	});

	it("keeps the session file when auxiliary artifact cleanup fails so deletion can be retried", async () => {
		const rootDir = await createTemporaryRoot();
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "retryable-cleanup";
		await repository.create({ sessionId, createdAt: 100 });
		const sessionPath = repository.resolveConversationPath(sessionId);
		await repository.close();
		const catalog = new FileConversationRuntimeSessionCatalog({
			artifactCleaner: {
				deleteSessionArtifacts: async () => {
					throw new Error("artifact cleanup failed");
				},
			},
		});

		await expect(catalog.deleteSessionArtifacts(sessionPath)).rejects.toThrow("artifact cleanup failed");
		expect(existsSync(sessionPath)).toBe(true);
	});

	it("rejects lifecycle writes while another process-lifetime owner holds the conversation", async () => {
		const rootDir = await createTemporaryRoot();
		const repository = new FileConversationRepository({ rootDir });
		const sessionId = "owned-session";
		await repository.create({ sessionId, createdAt: 100 });
		const sessionPath = repository.resolveConversationPath(sessionId);
		await repository.close();

		const ownershipManager = new FileConversationOwnershipManager();
		const owner = await ownershipManager.acquire(sessionPath);
		const catalog = new FileConversationRuntimeSessionCatalog({ ownershipManager });
		try {
			await expect(catalog.renameSession(sessionPath, "blocked")).rejects.toBeInstanceOf(
				ConversationOwnershipConflictError,
			);
			await expect(catalog.deleteSessionArtifacts(sessionPath)).rejects.toBeInstanceOf(
				ConversationOwnershipConflictError,
			);
			expect(existsSync(sessionPath)).toBe(true);
		} finally {
			await owner.release();
		}

		await catalog.deleteSessionArtifacts(sessionPath);
		expect(existsSync(sessionPath)).toBe(false);
	});
});

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-runtime-session-services-"));
	temporaryRoots.push(root);
	return root;
}

function started(sessionId: string, timestamp = 1): TurnStartedEvent {
	return {
		type: "turn.started",
		sessionId,
		turnId: "turn-1",
		snapshotId: "snapshot-1",
		timestamp,
	};
}

function userMessage(sessionId: string, text: string, timestamp = 2): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId: "turn-1",
		message: { role: "user", content: text, timestamp },
		timestamp,
	};
}

function assistantMessage(sessionId: string, text: string, timestamp = 3): MessageAppendedEvent {
	return {
		type: "message.appended",
		sessionId,
		turnId: "turn-1",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "openai-responses",
			provider: "openai",
			model: "test-model",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp,
		},
		timestamp,
	};
}

function completed(sessionId: string, timestamp = 4): TurnCompletedEvent {
	return {
		type: "turn.completed",
		sessionId,
		turnId: "turn-1",
		stopReason: "stop",
		timestamp,
	};
}
