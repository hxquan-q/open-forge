// Copyright The Open Forge contributors.
import { type FSWatcher, watch } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import {
	type ArtifactToolError,
	type ArtifactToolListItem,
	artifactToolError,
	type CodingAgentArtifactFunctionRequest,
	type CodingAgentArtifactFunctionResult,
	decideArtifactUpdate,
	isExternalArtifactUpdate,
	nextArtifactVersion,
} from "@vetta/coding-agent/function-extensions";
import type { ArtifactDescriptorRecordedEvent, RuntimeSessionFactEvent } from "@vetta/runtime-core/kernel";
import {
	type ArtifactDescriptor,
	type ArtifactKind,
	projectRuntimeSessionTaskState,
	RUNTIME_TASK_TERMINAL_STATUSES,
	type RuntimeSessionTaskState,
	type RuntimeTaskSnapshot,
	transitionRuntimeTask,
} from "@vetta/runtime-core/task";
import { isSshProjectUri } from "@vetta/ssh-transport";
import { artifactUriToPath, extensionForArtifact, isPathLikeWorkspaceId, sha256Hex } from "./canvas-paths.js";
import { projectArtifactsFromConversationText, readSessionIdFromConversationText } from "./canvas-session-scan.js";
import type { CanvasStore } from "./canvas-store.js";

export interface CanvasSessionRef {
	readonly sessionId: string;
	readonly path?: string;
	readonly cwd?: string;
}

export interface CanvasOwnershipRecord {
	readonly sessionPath: string;
	readonly workspaceId?: string;
	readonly cwd?: string;
}

export interface CanvasProjectTargetPort {
	exists(path: string, projectRoot?: string): Promise<boolean>;
	read(path: string, projectRoot?: string): Promise<string | undefined>;
	write(path: string, content: string, projectRoot?: string): Promise<void>;
}

export interface CanvasArtifactRuntimePort {
	getTaskState(sessionId: string): RuntimeSessionTaskState;
	recordTaskFacts(sessionId: string, facts: readonly RuntimeSessionFactEvent[]): Promise<void>;
	listSessions(cwd: string, sessionDir?: string): Promise<readonly CanvasSessionRef[]>;
	readWorkingDirectory(sessionId: string): string | undefined;
	getSessionPath(sessionId: string): string | undefined;
}

export interface CanvasArtifactServiceDeps {
	readonly store: CanvasStore;
	readonly runtime: CanvasArtifactRuntimePort;
	readonly project: CanvasProjectTargetPort;
	readonly now: () => number;
	readonly createId: () => string;
	readonly resolveSessionDir?: (cwd: string) => string | undefined;
	readonly listOwnership?: () => Promise<readonly CanvasOwnershipRecord[]>;
	readonly readConversationText?: (path: string) => Promise<string | undefined>;
	readonly watchFile?: (path: string, onChange: () => void) => () => void;
}

export interface CanvasArtifactView {
	readonly descriptor: ArtifactDescriptor;
	readonly missing: boolean;
	readonly externalUpdate: boolean;
}

/** 写入请求：Agent 工具路径与用户就地编辑路径共用同一组字段。 */
export interface CanvasArtifactUpdateInput {
	readonly workspaceId: string;
	readonly artifactId: string;
	readonly baseVersion: number;
	readonly content: string;
	readonly title?: string;
	readonly contentType?: string;
	/** 归属会话；省略时沿用 artifact 现有 `sourceSessionId`（用户就地编辑）。 */
	readonly sessionId?: string;
	readonly turnId?: string;
	readonly signal: AbortSignal;
}

export type CanvasArtifactUpdateOutcome =
	| { readonly ok: true; readonly descriptor: ArtifactDescriptor }
	| { readonly ok: false; readonly error: ArtifactToolError };

export class CanvasArtifactService {
	private readonly watchers = new Map<string, () => void>();
	private readonly suppressUntil = new Map<string, number>();
	/** 在途的外部改动导入，按 artifact 去重（见 importExternalUpdate）。 */
	private readonly imports = new Map<string, Promise<ArtifactDescriptor>>();

	constructor(private readonly deps: CanvasArtifactServiceDeps) {}

	async invokeTool(
		request: CodingAgentArtifactFunctionRequest,
		signal: AbortSignal,
	): Promise<CodingAgentArtifactFunctionResult> {
		if (signal.aborted) return cancelled(request.input.action);
		const workspaceId = await this.resolveWorkspaceId(request.sessionId);
		switch (request.input.action) {
			case "create":
				return this.create(request, workspaceId, signal);
			case "update":
				return this.update(request, workspaceId, signal);
			case "get":
				return this.getTool(request, workspaceId);
			case "list":
				return this.listTool(request, workspaceId);
			case "attach_to_task":
				return this.attachToTask(request, workspaceId);
		}
	}

	async listWorkspace(
		workspaceId: string,
		extraSessionIds: readonly string[] = [],
	): Promise<readonly CanvasArtifactView[]> {
		const descriptors = await this.collectWorkspaceDescriptors(workspaceId, extraSessionIds);
		const views: CanvasArtifactView[] = [];
		for (const descriptor of descriptors) {
			views.push(await this.refreshView(workspaceId, descriptor));
		}
		this.refreshWatches(workspaceId, views);
		return views;
	}

	async getWorkspace(
		workspaceId: string,
		artifactId: string,
		version?: number,
	): Promise<
		| {
				readonly ok: true;
				readonly view: CanvasArtifactView;
				readonly content: string;
				readonly contentType?: string;
		  }
		| ArtifactToolError
	> {
		const current = await this.findDescriptor(workspaceId, artifactId);
		if (!current) return artifactToolError("missing_file", "artifact not found", { artifactId });
		const view = await this.refreshView(workspaceId, current);
		let target = view.descriptor;
		if (version !== undefined && version !== view.descriptor.version) {
			const stored = await this.deps.store.read(workspaceId, artifactId, version);
			if (!stored) {
				return artifactToolError("missing_file", "artifact file is missing", { artifactId, action: "get" });
			}
			target = { ...view.descriptor, version, uri: stored.uri };
		}
		if (!target.uri) {
			return artifactToolError("missing_file", "artifact file is missing", { artifactId, action: "get" });
		}
		const content = await this.readUriContent(target.uri);
		if (content === undefined) {
			return artifactToolError("missing_file", "artifact file is missing", { artifactId, action: "get" });
		}
		this.refreshWatches(workspaceId, [view]);
		return {
			ok: true,
			view: {
				descriptor:
					target.uri === view.descriptor.uri
						? view.descriptor
						: { ...view.descriptor, version: target.version, uri: target.uri },
				missing: false,
				externalUpdate: isExternalArtifactUpdate(target.status ?? view.descriptor.status),
			},
			content,
			...(view.descriptor.contentType ? { contentType: view.descriptor.contentType } : {}),
		};
	}

	async saveToProject(
		workspaceId: string,
		artifactId: string,
		targetPath: string,
		signal: AbortSignal = new AbortController().signal,
	): Promise<
		| { readonly ok: true; readonly descriptor: ArtifactDescriptor }
		| ArtifactToolError
		| { readonly ok: false; readonly code: "conflict"; readonly message: string }
	> {
		if (signal.aborted) return cancelled("update");
		const current = await this.findDescriptor(workspaceId, artifactId);
		if (!current?.uri) return artifactToolError("missing_file", "artifact file is missing", { artifactId });
		const cwd = await this.resolveCwd(current.sourceSessionId, workspaceId);
		const content = await this.readUriContent(current.uri, cwd);
		if (content === undefined) return artifactToolError("missing_file", "artifact file is missing", { artifactId });
		if (!isSshProjectUri(targetPath) && !isAbsolute(targetPath) && !cwd) {
			return artifactToolError("invalid_input", "target path is not resolvable", { action: "update", artifactId });
		}
		const resolvedTarget = resolveProjectTarget(targetPath, cwd);
		if (await this.deps.project.exists(resolvedTarget, cwd)) {
			return { ok: false, code: "conflict", message: `target already exists: ${resolvedTarget}` };
		}
		if (signal.aborted) return cancelled("update");
		this.suppress(resolvedTarget);
		await this.deps.project.write(resolvedTarget, content, cwd);
		if (signal.aborted) return cancelled("update");
		const now = this.deps.now();
		const next: ArtifactDescriptor = {
			...current,
			version: nextArtifactVersion(current.version),
			uri: resolvedTarget,
			checksum: sha256Hex(content),
			updatedAt: now,
		};
		await this.recordDescriptor(current.sourceSessionId, next);
		return { ok: true, descriptor: next };
	}

	async deleteWorkspaceArtifact(workspaceId: string, artifactId: string): Promise<void> {
		this.unwatch(watchKey(workspaceId, artifactId));
		await this.deps.store.removeArtifact(workspaceId, artifactId);
	}

	/**
	 * 同一次外部改动可能被 watcher 与「打开时比对」同时发现。两个导入并发写同一版本
	 * 会撞在同一个临时文件上（rename ENOENT），也会凭空多出第二个版本；因此在途导入
	 * 按 artifact 去重，保证「一次外部改动 = 一个新版本」。
	 */
	async importExternalUpdate(workspaceId: string, descriptor: ArtifactDescriptor): Promise<ArtifactDescriptor> {
		const key = watchKey(workspaceId, descriptor.artifactId);
		const inFlight = this.imports.get(key);
		if (inFlight) return inFlight;
		const task = this.importExternalUpdateOnce(workspaceId, descriptor);
		this.imports.set(key, task);
		try {
			return await task;
		} finally {
			if (this.imports.get(key) === task) this.imports.delete(key);
		}
	}

	private async importExternalUpdateOnce(
		workspaceId: string,
		descriptor: ArtifactDescriptor,
	): Promise<ArtifactDescriptor> {
		if (!descriptor.uri) return descriptor;
		const path = artifactUriToPath(descriptor.uri);
		if (!path) return descriptor;
		const content = await this.readUriContent(descriptor.uri);
		if (content === undefined) return descriptor;
		const checksum = sha256Hex(content);
		if (descriptor.checksum && descriptor.checksum === checksum) return descriptor;
		const extension = extensionForArtifact({
			contentType: descriptor.contentType,
			title: descriptor.title,
			fallback: ".md",
		});
		const snapshot = await this.deps.store.write({
			workspaceId,
			artifactId: descriptor.artifactId,
			version: nextArtifactVersion(descriptor.version),
			content,
			contentType: descriptor.contentType,
			title: descriptor.title,
			filename: `snapshot${extension}`,
		});
		const now = this.deps.now();
		const sourcePath = artifactUriToPath(descriptor.uri);
		const keptUri = sourcePath && this.deps.store.isManagedPath(sourcePath) ? snapshot.uri : descriptor.uri;
		const next: ArtifactDescriptor = {
			...descriptor,
			version: snapshot.version,
			checksum,
			status: "modified",
			uri: keptUri,
			updatedAt: now,
		};
		await this.recordDescriptor(descriptor.sourceSessionId, next);
		return next;
	}

	dispose(): void {
		for (const stop of this.watchers.values()) stop();
		this.watchers.clear();
	}

	private async create(
		request: CodingAgentArtifactFunctionRequest,
		workspaceId: string,
		signal: AbortSignal,
	): Promise<CodingAgentArtifactFunctionResult> {
		const input = request.input;
		if (input.action !== "create") return artifactToolError("invalid_input", "expected create");
		const artifactId = this.deps.createId();
		const written = await this.deps.store.write({
			workspaceId,
			artifactId,
			version: 1,
			content: input.content,
			contentType: input.contentType,
			filename: input.filename,
			title: input.title,
		});
		if (signal.aborted) {
			await this.deps.store.removeVersion(workspaceId, artifactId, 1);
			return cancelled("create");
		}
		const now = this.deps.now();
		const descriptor: ArtifactDescriptor = {
			schemaVersion: 1,
			artifactId,
			kind: input.kind,
			status: "generated",
			title: input.title,
			uri: written.uri,
			version: 1,
			sourceSessionId: request.sessionId,
			...(request.turnId ? { sourceTurnId: request.turnId } : {}),
			...(input.contentType ? { contentType: input.contentType } : {}),
			checksum: written.checksum,
			createdAt: now,
			updatedAt: now,
		};
		await this.recordDescriptor(request.sessionId, descriptor);
		return successFromDescriptor("create", descriptor);
	}

	/**
	 * 单一写入实现：Agent 工具路径与用户就地编辑（IPC）路径共用，保证单调版本递增
	 * 与 SHA-256 乐观锁只有一份实现。归因由调用方给出——Agent 写当前会话，
	 * 用户编辑沿用 artifact 自己的来源会话（省略 `sessionId` 即保持原归属）。
	 */
	async applyUpdate(input: CanvasArtifactUpdateInput): Promise<CanvasArtifactUpdateOutcome> {
		const current = await this.findDescriptor(input.workspaceId, input.artifactId, input.sessionId);
		if (!current) {
			return {
				ok: false,
				error: artifactToolError("missing_file", "artifact not found", {
					action: "update",
					artifactId: input.artifactId,
				}),
			};
		}
		const fileChecksum = await this.fileChecksum(current.uri);
		const decision = decideArtifactUpdate({
			current: { version: current.version, checksum: current.checksum },
			baseVersion: input.baseVersion,
			...(fileChecksum === undefined ? {} : { currentFileChecksum: fileChecksum }),
		});
		if (decision.kind === "stale_version") {
			return {
				ok: false,
				error: artifactToolError("stale_version", "artifact version is stale", {
					action: "update",
					artifactId: current.artifactId,
					baseVersion: input.baseVersion,
					currentVersion: decision.currentVersion,
				}),
			};
		}
		const written = await this.deps.store.write({
			workspaceId: input.workspaceId,
			artifactId: current.artifactId,
			version: decision.nextVersion,
			content: input.content,
			contentType: input.contentType ?? current.contentType,
			title: input.title ?? current.title,
		});
		if (input.signal.aborted) {
			await this.deps.store.removeVersion(input.workspaceId, current.artifactId, decision.nextVersion);
			return { ok: false, error: cancelled("update", current.artifactId) };
		}
		const now = this.deps.now();
		const descriptor: ArtifactDescriptor = {
			...current,
			title: input.title ?? current.title,
			...(input.contentType ? { contentType: input.contentType } : {}),
			uri: written.uri,
			version: decision.nextVersion,
			checksum: written.checksum,
			status: "generated",
			updatedAt: now,
			...(input.sessionId ? { sourceSessionId: input.sessionId } : {}),
			...(input.turnId ? { sourceTurnId: input.turnId } : {}),
		};
		await this.recordDescriptor(descriptor.sourceSessionId, descriptor);
		return { ok: true, descriptor };
	}

	private async update(
		request: CodingAgentArtifactFunctionRequest,
		workspaceId: string,
		signal: AbortSignal,
	): Promise<CodingAgentArtifactFunctionResult> {
		const input = request.input;
		if (input.action !== "update") return artifactToolError("invalid_input", "expected update");
		const outcome = await this.applyUpdate({
			workspaceId,
			artifactId: input.artifactId,
			baseVersion: input.baseVersion,
			content: input.content,
			...(input.title === undefined ? {} : { title: input.title }),
			...(input.contentType === undefined ? {} : { contentType: input.contentType }),
			sessionId: request.sessionId,
			...(request.turnId === undefined ? {} : { turnId: request.turnId }),
			signal,
		});
		if (!outcome.ok) return outcome.error;
		return successFromDescriptor("update", outcome.descriptor);
	}

	private async getTool(
		request: CodingAgentArtifactFunctionRequest,
		workspaceId: string,
	): Promise<CodingAgentArtifactFunctionResult> {
		const input = request.input;
		if (input.action !== "get") return artifactToolError("invalid_input", "expected get");
		const result = await this.getWorkspace(workspaceId, input.artifactId, input.version);
		if (!result.ok) return result;
		return {
			ok: true,
			action: "get",
			artifactId: result.view.descriptor.artifactId,
			version: result.view.descriptor.version,
			title: result.view.descriptor.title,
			kind: result.view.descriptor.kind,
			uri: result.view.descriptor.uri,
			contentType: result.view.descriptor.contentType,
			checksum: result.view.descriptor.checksum,
			sourceTaskId: result.view.descriptor.sourceTaskId,
			content: result.content,
		};
	}

	private async listTool(
		request: CodingAgentArtifactFunctionRequest,
		workspaceId: string,
	): Promise<CodingAgentArtifactFunctionResult> {
		const input = request.input;
		if (input.action !== "list") return artifactToolError("invalid_input", "expected list");
		const views = await this.listWorkspace(workspaceId, [request.sessionId]);
		const items: ArtifactToolListItem[] = views
			.filter((view) => !input.sourceSessionId || view.descriptor.sourceSessionId === input.sourceSessionId)
			.map((view) => ({
				artifactId: view.descriptor.artifactId,
				title: view.descriptor.title,
				kind: view.descriptor.kind,
				version: view.descriptor.version,
				sourceSessionId: view.descriptor.sourceSessionId,
				updatedAt: view.descriptor.updatedAt,
				...(view.descriptor.uri ? { uri: view.descriptor.uri } : {}),
				...(view.descriptor.contentType ? { contentType: view.descriptor.contentType } : {}),
				...(view.descriptor.checksum ? { checksum: view.descriptor.checksum } : {}),
				...(view.descriptor.sourceTaskId ? { sourceTaskId: view.descriptor.sourceTaskId } : {}),
			}));
		return { ok: true, action: "list", items };
	}

	private async attachToTask(
		request: CodingAgentArtifactFunctionRequest,
		workspaceId: string,
	): Promise<CodingAgentArtifactFunctionResult> {
		const input = request.input;
		if (input.action !== "attach_to_task") return artifactToolError("invalid_input", "expected attach_to_task");
		const current = await this.findDescriptor(workspaceId, input.artifactId, request.sessionId);
		if (!current) {
			return artifactToolError("missing_file", "artifact not found", {
				action: "attach_to_task",
				artifactId: input.artifactId,
			});
		}
		const state = this.tryTaskState(request.sessionId);
		const active = findActiveTask(state);
		if (!active) {
			return artifactToolError("no_active_task", "no active task in this session", { action: "attach_to_task" });
		}
		if (active.artifactIds.includes(current.artifactId) && current.sourceTaskId === active.identity.taskId) {
			return successFromDescriptor("attach_to_task", current);
		}
		const now = this.deps.now();
		const descriptor: ArtifactDescriptor = {
			...current,
			sourceTaskId: active.identity.taskId,
			version: nextArtifactVersion(current.version),
			updatedAt: now,
			sourceSessionId: request.sessionId,
		};
		const attached = transitionRuntimeTask(active, {
			eventId: `${active.identity.taskId}:attach:${descriptor.artifactId}:${now}`,
			at: now,
			intent: { type: "attach_artifact", artifactId: descriptor.artifactId },
		});
		await this.recordFacts(request.sessionId, [
			descriptorFact(request.sessionId, descriptor, now),
			...attached.events.map((task) => ({
				type: "task.lifecycle.recorded" as const,
				sessionId: request.sessionId,
				task,
				timestamp: task.at,
			})),
		]);
		return successFromDescriptor("attach_to_task", descriptor);
	}

	private async refreshView(workspaceId: string, descriptor: ArtifactDescriptor): Promise<CanvasArtifactView> {
		const path = descriptor.uri ? artifactUriToPath(descriptor.uri) : undefined;
		const missing = !path || !(await this.deps.store.exists(path));
		if (!missing && path) {
			const checksum = await this.deps.store.checksumOfPath(path);
			if (descriptor.checksum && checksum && checksum !== descriptor.checksum) {
				const imported = await this.importExternalUpdate(workspaceId, descriptor);
				return {
					descriptor: imported,
					missing: false,
					externalUpdate: isExternalArtifactUpdate(imported.status),
				};
			}
		}
		return {
			descriptor,
			missing,
			externalUpdate: isExternalArtifactUpdate(descriptor.status),
		};
	}

	private async findDescriptor(
		workspaceId: string,
		artifactId: string,
		preferredSessionId?: string,
	): Promise<ArtifactDescriptor | undefined> {
		if (preferredSessionId) {
			const fromSession = this.tryTaskState(preferredSessionId).artifacts.find(
				(item) => item.artifactId === artifactId,
			);
			if (fromSession) return fromSession;
		}
		return (await this.collectWorkspaceDescriptors(workspaceId, preferredSessionId ? [preferredSessionId] : [])).find(
			(item) => item.artifactId === artifactId,
		);
	}

	private async collectWorkspaceDescriptors(
		workspaceId: string,
		extraSessionIds: readonly string[] = [],
	): Promise<ArtifactDescriptor[]> {
		const byId = new Map<string, ArtifactDescriptor>();
		const adopt = (descriptor: ArtifactDescriptor) => {
			const existing = byId.get(descriptor.artifactId);
			if (!existing || descriptor.version > existing.version) byId.set(descriptor.artifactId, descriptor);
		};
		const sessions = new Map<string, CanvasSessionRef>();
		for (const session of await this.listWorkspaceSessions(workspaceId)) sessions.set(session.sessionId, session);
		for (const sessionId of extraSessionIds) {
			if (!sessions.has(sessionId)) sessions.set(sessionId, { sessionId });
		}
		for (const session of sessions.values()) {
			const fromOpen = this.tryTaskState(session.sessionId).artifacts;
			if (fromOpen.length > 0) {
				for (const artifact of fromOpen) adopt(artifact);
				continue;
			}
			if (!session.path || !this.deps.readConversationText) continue;
			const text = await this.deps.readConversationText(session.path);
			if (!text) continue;
			for (const artifact of projectArtifactsFromConversationText(text)) adopt(artifact);
		}
		return [...byId.values()];
	}

	private async listWorkspaceSessions(workspaceId: string): Promise<readonly CanvasSessionRef[]> {
		const sessions = new Map<string, CanvasSessionRef>();
		const ownership = this.deps.listOwnership ? await this.deps.listOwnership() : [];
		for (const record of ownership) {
			if (record.workspaceId !== workspaceId || !record.sessionPath) continue;
			const text = this.deps.readConversationText
				? await this.deps.readConversationText(record.sessionPath)
				: undefined;
			const sessionId = text ? readSessionIdFromConversationText(text) : undefined;
			if (!sessionId) continue;
			sessions.set(sessionId, {
				sessionId,
				path: record.sessionPath,
				...(record.cwd ? { cwd: record.cwd } : {}),
			});
		}
		if (isPathLikeWorkspaceId(workspaceId)) {
			try {
				const listed = await this.deps.runtime.listSessions(
					workspaceId,
					this.deps.resolveSessionDir?.(workspaceId),
				);
				for (const session of listed) sessions.set(session.sessionId, session);
			} catch {
				// 非会话根或不存在的 cwd 不阻断已打开会话的投影。
			}
		}
		return [...sessions.values()];
	}

	private async resolveWorkspaceId(sessionId: string): Promise<string> {
		const sessionPath = this.deps.runtime.getSessionPath(sessionId);
		if (sessionPath && this.deps.listOwnership) {
			const records = await this.deps.listOwnership();
			const match = records.find((record) => samePath(record.sessionPath, sessionPath));
			if (match?.workspaceId) return match.workspaceId;
		}
		return this.deps.runtime.readWorkingDirectory(sessionId) ?? `session:${sessionId}`;
	}

	private async resolveCwd(sessionId: string, workspaceId: string): Promise<string | undefined> {
		return (
			this.deps.runtime.readWorkingDirectory(sessionId) ??
			(isPathLikeWorkspaceId(workspaceId) ? workspaceId : undefined)
		);
	}

	private tryTaskState(sessionId: string): RuntimeSessionTaskState {
		try {
			return this.deps.runtime.getTaskState(sessionId);
		} catch {
			return projectRuntimeSessionTaskState([]);
		}
	}

	private async fileChecksum(uri: string | undefined): Promise<string | undefined> {
		const content = await this.readUriContent(uri);
		return content === undefined ? undefined : sha256Hex(content);
	}

	private async readUriContent(uri: string | undefined, projectRoot?: string): Promise<string | undefined> {
		const path = uri ? artifactUriToPath(uri) : undefined;
		if (!path) return undefined;
		if (!isSshProjectUri(path)) {
			const local = await this.deps.store.readContent(path);
			if (local !== undefined) return local;
		}
		return this.deps.project.read(path, projectRoot);
	}

	private async recordDescriptor(sessionId: string, descriptor: ArtifactDescriptor): Promise<void> {
		await this.recordFacts(sessionId, [descriptorFact(sessionId, descriptor, descriptor.updatedAt)]);
	}

	private async recordFacts(sessionId: string, facts: readonly RuntimeSessionFactEvent[]): Promise<void> {
		if (facts.some((fact) => fact.sessionId !== sessionId)) {
			throw new Error("recordTaskFacts session affiliation mismatch");
		}
		await this.deps.runtime.recordTaskFacts(sessionId, facts);
	}

	private refreshWatches(workspaceId: string, views: readonly CanvasArtifactView[]): void {
		const watchFile = this.deps.watchFile ?? defaultWatchFile;
		const live = new Set<string>();
		for (const view of views) {
			const path = view.descriptor.uri ? artifactUriToPath(view.descriptor.uri) : undefined;
			if (!path || isSshProjectUri(path)) continue;
			const key = watchKey(workspaceId, view.descriptor.artifactId);
			live.add(key);
			if (this.watchers.has(key)) continue;
			const artifactId = view.descriptor.artifactId;
			const stop = watchFile(path, () => {
				if (Date.now() < (this.suppressUntil.get(path) ?? 0)) return;
				void this.findDescriptor(workspaceId, artifactId).then((current) =>
					current ? this.importExternalUpdate(workspaceId, current) : undefined,
				);
			});
			this.watchers.set(key, stop);
		}
		for (const [key, stop] of this.watchers) {
			if (key.startsWith(`${workspaceId}:`) && !live.has(key)) {
				stop();
				this.watchers.delete(key);
			}
		}
	}

	private unwatch(key: string): void {
		this.watchers.get(key)?.();
		this.watchers.delete(key);
	}

	private suppress(path: string): void {
		this.suppressUntil.set(path, Date.now() + 250);
	}
}

function successFromDescriptor(
	action: "create" | "update" | "attach_to_task",
	descriptor: ArtifactDescriptor,
): CodingAgentArtifactFunctionResult {
	return {
		ok: true,
		action,
		artifactId: descriptor.artifactId,
		version: descriptor.version,
		title: descriptor.title,
		kind: descriptor.kind,
		uri: descriptor.uri,
		contentType: descriptor.contentType,
		checksum: descriptor.checksum,
		sourceTaskId: descriptor.sourceTaskId,
	};
}

function descriptorFact(
	sessionId: string,
	artifact: ArtifactDescriptor,
	timestamp: number,
): ArtifactDescriptorRecordedEvent {
	return { type: "artifact.descriptor.recorded", sessionId, artifact, timestamp };
}

function cancelled(action: ArtifactToolError["action"], artifactId?: string): ArtifactToolError {
	return artifactToolError("cancelled", "cancelled", { action, ...(artifactId ? { artifactId } : {}) });
}

function findActiveTask(state: RuntimeSessionTaskState): RuntimeTaskSnapshot | undefined {
	return [...state.tasks]
		.reverse()
		.find((task) => !(RUNTIME_TASK_TERMINAL_STATUSES as readonly string[]).includes(task.status));
}

function resolveProjectTarget(targetPath: string, cwd: string | undefined): string {
	if (isSshProjectUri(targetPath) || isAbsolute(targetPath)) return targetPath;
	if (!cwd) return targetPath;
	if (isSshProjectUri(cwd)) return `${cwd.replace(/\/$/, "")}/${targetPath.replace(/^\/+/, "")}`;
	return resolvePath(cwd, targetPath);
}

function samePath(left: string, right: string): boolean {
	const normalize = (value: string) =>
		process.platform === "win32" ? resolvePath(value).toLowerCase() : resolvePath(value);
	try {
		return normalize(left) === normalize(right);
	} catch {
		return left === right;
	}
}

function watchKey(workspaceId: string, artifactId: string): string {
	return `${workspaceId}:${artifactId}`;
}

function defaultWatchFile(path: string, onChange: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let watcher: FSWatcher;
	try {
		watcher = watch(path, () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(onChange, 50);
		});
	} catch {
		return () => undefined;
	}
	return () => {
		if (timer) clearTimeout(timer);
		watcher.close();
	};
}

export type { ArtifactKind };
