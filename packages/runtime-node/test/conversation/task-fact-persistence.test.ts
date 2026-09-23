// Copyright The Open Forge contributors.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRuntimeSessionTaskState } from "@vetta/runtime-core";
import type {
	ArtifactDescriptorRecordedEvent,
	TaskLifecycleRecordedEvent,
	TurnStartedEvent,
} from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { FileConversationRepository } from "../../src/conversation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(): Promise<{
	readonly repository: FileConversationRepository;
	readonly rootDir: string;
}> {
	const rootDir = await mkdtemp(join(tmpdir(), "vetta-conversation-"));
	temporaryRoots.push(rootDir);
	return { repository: new FileConversationRepository({ rootDir }), rootDir };
}

function started(sessionId: string, turnId: string): TurnStartedEvent {
	return {
		type: "turn.started",
		sessionId,
		turnId,
		snapshotId: "snapshot-1",
		timestamp: 1,
	};
}

function taskCreated(sessionId: string): TaskLifecycleRecordedEvent {
	return {
		type: "task.lifecycle.recorded",
		sessionId,
		task: {
			schemaVersion: 1,
			taskId: "task-1",
			eventId: "task-1:created",
			at: 100,
			type: "task.created",
			snapshot: {
				schemaVersion: 1,
				identity: { taskId: "task-1", rootSessionId: sessionId, generation: "generation-1" },
				status: "draft",
				title: "整理项目文档",
				createdAt: 100,
				updatedAt: 100,
				artifactIds: [],
				pendingApprovalIds: [],
			},
		},
		timestamp: 100,
	};
}

function taskPlanned(sessionId: string): TaskLifecycleRecordedEvent {
	return {
		type: "task.lifecycle.recorded",
		sessionId,
		task: {
			schemaVersion: 1,
			taskId: "task-1",
			eventId: "task-1:plan:0",
			at: 101,
			type: "task.status_changed",
			from: "draft",
			to: "planning",
		},
		timestamp: 101,
	};
}

function artifactRecorded(sessionId: string): ArtifactDescriptorRecordedEvent {
	return {
		type: "artifact.descriptor.recorded",
		sessionId,
		artifact: {
			schemaVersion: 1,
			artifactId: "artifact-1",
			kind: "document",
			status: "generated",
			title: "会议纪要",
			uri: "file:///documents/notes.md",
			version: 1,
			sourceTaskId: "task-1",
			sourceSessionId: sessionId,
			createdAt: 102,
			updatedAt: 102,
		},
		timestamp: 102,
	};
}

describe("Task/Artifact 事实在会话 JSONL 的持久化往返", () => {
	it("追加、落盘、重开仓库后事件与投影完整恢复", async () => {
		const { repository, rootDir } = await createRepository();
		const sessionId = "session-task-1";
		await repository.create({ sessionId, createdAt: 1 });
		const initial = await repository.load(sessionId);
		await repository.append(sessionId, initial.version, [started(sessionId, "turn-1")]);
		const afterTurn = await repository.load(sessionId);
		await repository.append(sessionId, afterTurn.version, [
			taskCreated(sessionId),
			taskPlanned(sessionId),
			artifactRecorded(sessionId),
		]);

		// 模拟进程重启：用同一 rootDir 重建仓库。
		await repository.close();
		const reopened = new FileConversationRepository({ rootDir });
		const conversation = await reopened.load(sessionId);

		const state = projectRuntimeSessionTaskState(conversation.events);
		expect(state.tasks).toHaveLength(1);
		expect(state.tasks[0].status).toBe("planning");
		expect(state.tasks[0].title).toBe("整理项目文档");
		expect(state.artifacts).toHaveLength(1);
		expect(state.artifacts[0].title).toBe("会议纪要");
		await reopened.close();
	});

	it("Task 事实出现在活动 Turn 内不会让文件被判为损坏", async () => {
		const { repository } = await createRepository();
		const sessionId = "session-task-2";
		await repository.create({ sessionId, createdAt: 1 });
		const initial = await repository.load(sessionId);
		await repository.append(sessionId, initial.version, [
			started(sessionId, "turn-1"),
			taskCreated(sessionId),
			taskPlanned(sessionId),
		]);

		const conversation = await repository.load(sessionId);
		expect(conversation.events.filter((event) => event.type === "task.lifecycle.recorded")).toHaveLength(2);
		await repository.close();
	});
});
