// Copyright The Open Forge contributors.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredSessionEvent } from "../../../runtime-core/src/kernel/index.js";
import { encodeConversationSessionId } from "../../src/conversation/conversation-file-codec.js";
import { assessConversationInterruption } from "../../src/conversation/conversation-interruption-assessment.js";
import { FileConversationRepository } from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createFixture(): Promise<{ readonly repository: FileConversationRepository; readonly rootDir: string }> {
	const rootDir = await mkdtemp(join(tmpdir(), "vetta-interrupt-assess-"));
	temporaryRoots.push(rootDir);
	return { repository: new FileConversationRepository({ rootDir }), rootDir };
}

function sessionPath(rootDir: string, sessionId: string): string {
	return join(rootDir, `${encodeConversationSessionId(sessionId)}.conversation.jsonl`);
}

function turnStarted(sessionId: string, turnId: string): StoredSessionEvent {
	return { type: "turn.started", sessionId, turnId, snapshotId: "snapshot-1", timestamp: 100 };
}

function turnCompleted(sessionId: string, turnId: string): StoredSessionEvent {
	return { type: "turn.completed", sessionId, turnId, stopReason: "stop", timestamp: 101 };
}

describe("assessConversationInterruption", () => {
	it("未闭合 Turn（崩溃在 turn 中途）判定为 interrupted", async () => {
		const { repository, rootDir } = await createFixture();
		await repository.create({ sessionId: "session-1", createdAt: 1 });
		await repository.append("session-1", 0, [turnStarted("session-1", "turn-1")]);
		await repository.close();

		await expect(assessConversationInterruption("session-1", sessionPath(rootDir, "session-1"))).resolves.toBe(
			"interrupted",
		);
	});

	it("全部 Turn 已完结判定为 ready", async () => {
		const { repository, rootDir } = await createFixture();
		await repository.create({ sessionId: "session-1", createdAt: 1 });
		await repository.append("session-1", 0, [
			turnStarted("session-1", "turn-1"),
			turnCompleted("session-1", "turn-1"),
		]);
		await repository.close();

		await expect(assessConversationInterruption("session-1", sessionPath(rootDir, "session-1"))).resolves.toBe(
			"ready",
		);
	});

	it("崩溃中断的 Turn 被 resume 收敛（turn.failed）后回到 ready", async () => {
		const { repository, rootDir } = await createFixture();
		await repository.create({ sessionId: "session-1", createdAt: 1 });
		await repository.append("session-1", 0, [turnStarted("session-1", "turn-1")]);
		await repository.append("session-1", 1, [
			{
				type: "turn.failed",
				sessionId: "session-1",
				turnId: "turn-1",
				error: { code: "turn_interrupted", message: "Turn interrupted before the session was resumed" },
				timestamp: 102,
			},
		]);
		await repository.close();

		await expect(assessConversationInterruption("session-1", sessionPath(rootDir, "session-1"))).resolves.toBe(
			"ready",
		);
	});

	it("文件缺失判定为 unreadable 而不是抛出", async () => {
		const { rootDir } = await createFixture();
		await expect(assessConversationInterruption("missing", sessionPath(rootDir, "missing"))).resolves.toBe(
			"unreadable",
		);
	});

	it("文件损坏（无法解析）判定为 unreadable 而不是抛出", async () => {
		const { rootDir } = await createFixture();
		const path = sessionPath(rootDir, "broken");
		await writeFile(path, "not a conversation file\n", "utf8");

		await expect(assessConversationInterruption("broken", path)).resolves.toBe("unreadable");
	});

	it("协议非法历史（嵌套 Turn）判定为 unreadable，恢复裁决留给 resumeSession", async () => {
		const { repository, rootDir } = await createFixture();
		await repository.create({ sessionId: "session-1", createdAt: 1 });
		await repository.append("session-1", 0, [turnStarted("session-1", "turn-1"), turnStarted("session-1", "turn-2")]);
		await repository.close();

		await expect(assessConversationInterruption("session-1", sessionPath(rootDir, "session-1"))).resolves.toBe(
			"unreadable",
		);
	});
});
