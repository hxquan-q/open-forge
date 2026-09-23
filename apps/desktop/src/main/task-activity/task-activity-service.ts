import { stat } from "node:fs/promises";
import type {
	ArtifactDescriptorRecordedEvent,
	RuntimeSessionFactEvent,
	TaskLifecycleRecordedEvent,
} from "@vetta/runtime-core/kernel";
import {
	ARTIFACT_AVAILABILITY,
	type ArtifactAvailability,
	type ArtifactDescriptor,
	type ArtifactKind,
	createRuntimeTaskSnapshot,
	type RuntimeSessionTaskState,
	RuntimeTaskError,
	type RuntimeTaskEvent,
	type RuntimeTaskIdentity,
	type RuntimeTaskSnapshot,
	transitionRuntimeTask,
} from "@vetta/runtime-core/task";
import { getAppLogger } from "../logger.js";
import { getSharedRuntime } from "../runtime.js";

const log = getAppLogger("task-activity");

/** 渲染端可发起的 Task 命令；只驱动状态机，不直接执行任何模型或工具。 */
export type DesktopTaskCommand =
	| { readonly type: "create"; readonly title?: string }
	| { readonly type: "cancel"; readonly taskId: string; readonly reason?: string }
	| { readonly type: "pause"; readonly taskId: string }
	| {
			readonly type: "review";
			readonly taskId: string;
			readonly decision: "approved" | "changes_requested" | "rejected";
	  }
	| {
			readonly type: "attach-artifact";
			readonly taskId: string;
			readonly artifact: {
				readonly kind: ArtifactKind;
				readonly title: string;
				readonly uri: string;
				readonly contentType?: string;
			};
	  };

export type DesktopTaskCommandResult =
	| { readonly ok: true; readonly state: RuntimeSessionTaskState }
	| { readonly ok: false; readonly code: string; readonly message: string };

export interface DesktopArtifactView {
	readonly descriptor: ArtifactDescriptor;
	readonly availability: ArtifactAvailability;
}

function newId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

function toFact(sessionId: string, task: RuntimeTaskEvent): TaskLifecycleRecordedEvent {
	return { type: "task.lifecycle.recorded", sessionId, task, timestamp: task.at };
}

/**
 * Desktop 的 Task 控制面：把用户在 Activity Panel 的操作翻译成
 * RuntimeTaskEvent 事实，交给 RuntimeHost 落盘；状态一律从事件流投影读取，
 * Renderer 不持有最终状态。
 */
class DesktopTaskActivityService {
	getState(sessionId: string): RuntimeSessionTaskState {
		try {
			return getSharedRuntime().getTaskState(sessionId);
		} catch (error) {
			// 会话尚未在宿主打开（或已关闭）时投影为空；打开后会经事件重建。
			log.warn(`task state unavailable for ${sessionId}: ${errorMessage(error)}`);
			return { tasks: [], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() };
		}
	}

	/** 附加文件可用性后的 Artifact 视图；文件内容才是事实源，缺文件时 descriptor 仍在。 */
	async getArtifactViews(sessionId: string): Promise<readonly DesktopArtifactView[]> {
		const state = this.getState(sessionId);
		return Promise.all(
			state.artifacts.map(async (descriptor) => ({
				descriptor,
				availability: descriptor.uri ? await checkAvailability(descriptor.uri) : ARTIFACT_AVAILABILITY.READY,
			})),
		);
	}

	async runCommand(sessionId: string, command: DesktopTaskCommand): Promise<DesktopTaskCommandResult> {
		try {
			const runtime = getSharedRuntime();
			const state = runtime.getTaskState(sessionId);
			switch (command.type) {
				case "create":
					return { ok: true, state: await this.createTask(sessionId, command.title) };
				case "cancel":
					return {
						ok: true,
						state: await this.applyIntent(sessionId, findTask(state, command.taskId), {
							type: "cancel",
							reason: command.reason,
						}),
					};
				case "pause":
					return {
						ok: true,
						state: await this.applyIntent(sessionId, findTask(state, command.taskId), { type: "pause" }),
					};
				case "review":
					return {
						ok: true,
						state: await this.reviewTask(sessionId, findTask(state, command.taskId), command.decision, state),
					};
				case "attach-artifact":
					return {
						ok: true,
						state: await this.attachArtifact(sessionId, findTask(state, command.taskId), command.artifact),
					};
			}
		} catch (error) {
			if (error instanceof RuntimeTaskError) {
				return { ok: false, code: error.code, message: error.message };
			}
			const message = errorMessage(error);
			log.warn(`task command failed for ${sessionId}: ${message}`);
			return { ok: false, code: "task_command_failed", message };
		}
	}

	private async createTask(sessionId: string, title: string | undefined): Promise<RuntimeSessionTaskState> {
		const runtime = getSharedRuntime();
		const now = Date.now();
		const identity: RuntimeTaskIdentity = {
			taskId: newId("task"),
			rootSessionId: sessionId,
			generation: newId("generation"),
		};
		const snapshot = createRuntimeTaskSnapshot({ identity, ...(title ? { title } : {}), at: now });
		const created: RuntimeTaskEvent = {
			schemaVersion: 1,
			taskId: identity.taskId,
			eventId: `${identity.taskId}:created`,
			at: now,
			type: "task.created",
			snapshot,
		};
		// 创建即进入 planning：下一次用户消息触发 Turn 时由内核自动绑定执行。
		const planned = transitionRuntimeTask(snapshot, {
			eventId: `${identity.taskId}:plan`,
			at: now + 1,
			intent: { type: "plan" },
		});
		await runtime.recordTaskFacts(
			sessionId,
			[created, ...planned.events].map((task) => toFact(sessionId, task)),
		);
		return runtime.getTaskState(sessionId);
	}

	/** Review 三分支同时落 Artifact 终审状态：approved → accepted，rejected → rejected。 */
	private async reviewTask(
		sessionId: string,
		snapshot: RuntimeTaskSnapshot,
		decision: "approved" | "changes_requested" | "rejected",
		state: RuntimeSessionTaskState,
	): Promise<RuntimeSessionTaskState> {
		const runtime = getSharedRuntime();
		const now = Date.now();
		const { events } = transitionRuntimeTask(snapshot, {
			eventId: `${snapshot.identity.taskId}:review:${now}`,
			at: now,
			intent: { type: "review", decision },
		});
		const facts: RuntimeSessionFactEvent[] = events.map((task) => toFact(sessionId, task));
		if (decision === "approved" || decision === "rejected") {
			const artifactStatus = decision === "approved" ? "accepted" : "rejected";
			for (const artifact of state.artifacts) {
				if (!snapshot.artifactIds.includes(artifact.artifactId)) continue;
				if (artifact.status === artifactStatus) continue;
				facts.push({
					type: "artifact.descriptor.recorded",
					sessionId,
					artifact: {
						...artifact,
						status: artifactStatus,
						version: artifact.version + 1,
						updatedAt: now,
					},
					timestamp: now,
				});
			}
		}
		await runtime.recordTaskFacts(sessionId, facts);
		return runtime.getTaskState(sessionId);
	}

	private async applyIntent(
		sessionId: string,
		snapshot: RuntimeTaskSnapshot,
		intent: Parameters<typeof transitionRuntimeTask>[1]["intent"],
	): Promise<RuntimeSessionTaskState> {
		const runtime = getSharedRuntime();
		const { events } = transitionRuntimeTask(snapshot, {
			eventId: `${snapshot.identity.taskId}:${intent.type}:${Date.now()}`,
			at: Date.now(),
			intent,
		});
		await runtime.recordTaskFacts(
			sessionId,
			events.map((task) => toFact(sessionId, task)),
		);
		return runtime.getTaskState(sessionId);
	}

	private async attachArtifact(
		sessionId: string,
		snapshot: RuntimeTaskSnapshot,
		input: {
			readonly kind: ArtifactKind;
			readonly title: string;
			readonly uri: string;
			readonly contentType?: string;
		},
	): Promise<RuntimeSessionTaskState> {
		const runtime = getSharedRuntime();
		const now = Date.now();
		const descriptor: ArtifactDescriptor = {
			schemaVersion: 1,
			artifactId: newId("artifact"),
			kind: input.kind,
			status: "generated",
			title: input.title,
			uri: input.uri,
			version: 1,
			sourceTaskId: snapshot.identity.taskId,
			sourceSessionId: sessionId,
			...(snapshot.activeTurnId ? { sourceTurnId: snapshot.activeTurnId } : {}),
			...(input.contentType ? { contentType: input.contentType } : {}),
			createdAt: now,
			updatedAt: now,
		};
		const descriptorFact: ArtifactDescriptorRecordedEvent = {
			type: "artifact.descriptor.recorded",
			sessionId,
			artifact: descriptor,
			timestamp: now,
		};
		const attached = transitionRuntimeTask(snapshot, {
			eventId: `${snapshot.identity.taskId}:attach:${descriptor.artifactId}`,
			at: now + 1,
			intent: { type: "attach_artifact", artifactId: descriptor.artifactId },
		});
		await runtime.recordTaskFacts(sessionId, [
			descriptorFact,
			...attached.events.map((task) => toFact(sessionId, task)),
		]);
		return runtime.getTaskState(sessionId);
	}
}

async function checkAvailability(uri: string): Promise<ArtifactAvailability> {
	const path = artifactUriToPath(uri);
	if (!path) return ARTIFACT_AVAILABILITY.READY;
	try {
		await stat(path);
		return ARTIFACT_AVAILABILITY.READY;
	} catch {
		return ARTIFACT_AVAILABILITY.MISSING;
	}
}

/** 本机 file URI / 绝对路径可校验；其余 scheme 交给对应 renderer 判定。 */
function artifactUriToPath(uri: string): string | undefined {
	if (uri.startsWith("file://")) {
		try {
			return decodeURIComponent(new URL(uri).pathname).replace(/^\/([A-Za-z]:)/, "$1");
		} catch {
			return undefined;
		}
	}
	if (/^([A-Za-z]:[\\/]|\/)/.test(uri)) return uri;
	return undefined;
}

function findTask(state: RuntimeSessionTaskState, taskId: string): RuntimeTaskSnapshot {
	const snapshot = state.tasks.find((task) => task.identity.taskId === taskId);
	if (!snapshot) throw new RuntimeTaskError("task_unknown_approval" as never, `task "${taskId}" not found`);
	return snapshot;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const desktopTaskActivityService = new DesktopTaskActivityService();
