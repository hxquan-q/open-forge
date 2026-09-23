// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeSessionFactEvent } from "@vetta/runtime-core/kernel";
import {
	createRuntimeTaskSnapshot,
	projectRuntimeSessionTaskState,
	type RuntimeTaskSnapshot,
} from "@vetta/runtime-core/task";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasArtifactService } from "./canvas-artifact-service.js";
import { artifactUriToPath } from "./canvas-paths.js";
import { CanvasStore } from "./canvas-store.js";

const roots: string[] = [];
const signal = new AbortController().signal;

afterEach(async () => {
	await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Canvas artifact service", () => {
	it("普通会话无活动 Task 时 create 写入管理目录并记录无 sourceTaskId 的 descriptor", async () => {
		const harness = await createHarness();
		const created = await harness.service.invokeTool(createRequest(harness.sessionId), signal);
		expect(created).toMatchObject({ ok: true, action: "create", version: 1, title: "Notes" });
		if (!created.ok || !created.uri || !created.artifactId) throw new Error("expected create success");
		expect(created.sourceTaskId).toBeUndefined();
		expect(harness.facts).toHaveLength(1);
		expect(harness.facts[0]).toMatchObject({
			type: "artifact.descriptor.recorded",
			sessionId: harness.sessionId,
			artifact: { sourceSessionId: harness.sessionId, version: 1 },
		});
		expect("sourceTaskId" in (harness.facts[0] as { artifact: object }).artifact).toBe(false);
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");

		const listed = await harness.service.invokeTool(
			{ sessionId: harness.sessionId, turnId: "t1", input: { action: "list" } },
			signal,
		);
		expect(listed).toMatchObject({ ok: true, action: "list" });
		if (!listed.ok) throw new Error("expected list");
		expect(listed.items).toHaveLength(1);

		const got = await harness.service.invokeTool(
			{ sessionId: harness.sessionId, turnId: "t1", input: { action: "get", artifactId: created.artifactId } },
			signal,
		);
		expect(got).toMatchObject({ ok: true, action: "get", content: "# Hello" });
	});

	it("baseVersion 落后的 update 返回 stale_version 且不覆盖文件", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const updated = await harness.service.invokeTool(
			{
				sessionId: harness.sessionId,
				turnId: "t2",
				input: { action: "update", artifactId: created.artifactId, baseVersion: 1, content: "v2" },
			},
			signal,
		);
		expect(updated).toMatchObject({ ok: true, version: 2 });
		const stale = await harness.service.invokeTool(
			{
				sessionId: harness.sessionId,
				turnId: "t3",
				input: { action: "update", artifactId: created.artifactId, baseVersion: 1, content: "should-not-write" },
			},
			signal,
		);
		expect(stale).toMatchObject({ ok: false, code: "stale_version", currentVersion: 2 });
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");
		if (!updated.ok || !updated.uri) throw new Error("expected update");
		expect(await harness.store.readContent(artifactUriToPath(updated.uri) ?? "")).toBe("v2");
	});

	it("checksum 冲突时拒绝 Agent update，不覆盖历史版本", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const path = artifactUriToPath(created.uri);
		if (!path) throw new Error("expected path");
		await writeFile(path, "externally-changed", "utf8");
		const stale = await harness.service.invokeTool(
			{
				sessionId: harness.sessionId,
				turnId: "t2",
				input: { action: "update", artifactId: created.artifactId, baseVersion: 1, content: "agent" },
			},
			signal,
		);
		expect(stale).toMatchObject({ ok: false, code: "stale_version" });
		expect(await harness.store.readContent(path)).toBe("externally-changed");
	});

	it("attach_to_task 在无活动 Task 时明确失败，有活动 Task 时复用同一 artifactId", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const missing = await harness.service.invokeTool(
			{
				sessionId: harness.sessionId,
				turnId: "t2",
				input: { action: "attach_to_task", artifactId: created.artifactId },
			},
			signal,
		);
		expect(missing).toMatchObject({ ok: false, code: "no_active_task" });
		expect(harness.facts).toHaveLength(1);

		harness.activeTask = createRuntimeTaskSnapshot({
			identity: { taskId: "task-1", rootSessionId: harness.sessionId },
			at: 10,
		});
		const attached = await harness.service.invokeTool(
			{
				sessionId: harness.sessionId,
				turnId: "t3",
				input: { action: "attach_to_task", artifactId: created.artifactId },
			},
			signal,
		);
		expect(attached).toMatchObject({
			ok: true,
			action: "attach_to_task",
			artifactId: created.artifactId,
			sourceTaskId: "task-1",
		});
		expect(harness.facts.some((fact) => fact.type === "task.lifecycle.recorded")).toBe(true);
	});

	it("保存到项目复制并重指 uri，目标冲突时报错且不覆盖；本机副本仍在", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const target = join(harness.projectRoot, "docs", "notes.md");
		const saved = await harness.service.saveToProject(harness.workspaceId, created.artifactId, target, signal);
		expect(saved).toMatchObject({ ok: true });
		if (!saved.ok) throw new Error("expected save");
		expect(saved.descriptor.uri).toBe(target);
		expect(saved.descriptor.version).toBe(2);
		expect(harness.projectFiles.get(target)).toBe("# Hello");
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");

		harness.projectFiles.set(join(harness.projectRoot, "docs", "other.md"), "taken");
		const conflict = await harness.service.saveToProject(
			harness.workspaceId,
			created.artifactId,
			join(harness.projectRoot, "docs", "other.md"),
			signal,
		);
		expect(conflict).toMatchObject({ ok: false, code: "conflict" });
		expect(harness.projectFiles.get(join(harness.projectRoot, "docs", "other.md"))).toBe("taken");
	});

	it("重开会话可从已记录事实恢复，外部编辑导入为新版本并标外部更新", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const saved = await harness.service.saveToProject(
			harness.workspaceId,
			created.artifactId,
			join(harness.projectRoot, "out.md"),
			signal,
		);
		if (!saved.ok) throw new Error("expected save");
		const reopened = createService(harness);
		const recovered = await reopened.invokeTool(
			{ sessionId: harness.sessionId, turnId: "t9", input: { action: "get", artifactId: created.artifactId } },
			signal,
		);
		expect(recovered).toMatchObject({ ok: true, content: "# Hello", version: 2 });

		await writeFile(join(harness.projectRoot, "out.md"), "# Edited outside", "utf8");
		harness.projectFiles.set(join(harness.projectRoot, "out.md"), "# Edited outside");
		const views = await reopened.listWorkspace(harness.workspaceId, [harness.sessionId]);
		expect(views[0]).toMatchObject({
			externalUpdate: true,
			descriptor: { version: 3, status: "modified" },
		});
		const previous = await harness.store.read(harness.workspaceId, created.artifactId, 1);
		expect(previous).toBeDefined();
		expect(await harness.store.readContent(previous?.path ?? "")).toBe("# Hello");
	});

	it("保存到 SSH 项目路径走项目端口且冲突时不覆盖", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const target = "ssh://build-01/srv/app/docs/notes.md";
		const saved = await harness.service.saveToProject(harness.workspaceId, created.artifactId, target, signal);
		expect(saved).toMatchObject({ ok: true });
		if (!saved.ok) throw new Error("expected save");
		expect(saved.descriptor.uri).toBe(target);
		expect(harness.projectFiles.get(target)).toBe("# Hello");
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");

		const conflict = await harness.service.saveToProject(harness.workspaceId, created.artifactId, target, signal);
		expect(conflict).toMatchObject({ ok: false, code: "conflict" });
		expect(harness.projectFiles.get(target)).toBe("# Hello");
	});

	it("create 在取消时不留下 descriptor，半成品文件回滚", async () => {
		const harness = await createHarness();
		const controller = new AbortController();
		controller.abort();
		const result = await harness.service.invokeTool(createRequest(harness.sessionId), controller.signal);
		expect(result).toMatchObject({ ok: false, code: "cancelled" });
		expect(harness.facts).toHaveLength(0);
	});

	it("watcher 触发时把外部变更导入为新版本", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const path = artifactUriToPath(created.uri);
		if (!path) throw new Error("expected path");
		await harness.service.listWorkspace(harness.workspaceId, [harness.sessionId]);
		expect(harness.watchers.size).toBe(1);
		await writeFile(path, "# From watcher", "utf8");
		await harness.watchers.values().next().value?.();
		const views = await harness.service.listWorkspace(harness.workspaceId, [harness.sessionId]);
		expect(views[0]?.descriptor.version).toBe(2);
		expect(views[0]?.externalUpdate).toBe(true);
	});
});

async function createArtifact(harness: Harness) {
	const created = await harness.service.invokeTool(createRequest(harness.sessionId), signal);
	if (!created.ok || !created.artifactId || !created.uri) throw new Error("expected create");
	return { artifactId: created.artifactId, uri: created.uri };
}

function createRequest(sessionId: string) {
	return {
		sessionId,
		turnId: "t1",
		input: {
			action: "create" as const,
			title: "Notes",
			kind: "document" as const,
			content: "# Hello",
			contentType: "text/markdown",
		},
	};
}

interface Harness {
	readonly workspaceId: string;
	readonly sessionId: string;
	readonly projectRoot: string;
	readonly store: CanvasStore;
	readonly service: CanvasArtifactService;
	readonly facts: RuntimeSessionFactEvent[];
	readonly projectFiles: Map<string, string>;
	readonly watchers: Map<string, () => void | Promise<void>>;
	activeTask: RuntimeTaskSnapshot | undefined;
}

async function createHarness(): Promise<Harness> {
	const root = await mkdtemp(join(tmpdir(), "canvas-service-"));
	roots.push(root);
	const workspaceId = join(root, "project");
	const projectRoot = join(root, "project");
	const store = new CanvasStore(join(root, "canvas"));
	const facts: RuntimeSessionFactEvent[] = [];
	const projectFiles = new Map<string, string>();
	const watchers = new Map<string, () => void | Promise<void>>();
	const harness: Harness = {
		workspaceId,
		sessionId: "session-1",
		projectRoot,
		store,
		facts,
		projectFiles,
		watchers,
		activeTask: undefined,
		service: undefined as unknown as CanvasArtifactService,
	};
	harness.service = createService(harness);
	return harness;
}

function createService(harness: Harness): CanvasArtifactService {
	return new CanvasArtifactService({
		store: harness.store,
		now: () => 1_700_000_000_000,
		createId: () => "artifact-fixed",
		runtime: {
			getTaskState: (sessionId) => {
				const projected = projectRuntimeSessionTaskState(
					harness.facts.filter((fact) => fact.sessionId === sessionId),
				);
				return {
					...projected,
					tasks: harness.activeTask ? [harness.activeTask] : projected.tasks,
				};
			},
			recordTaskFacts: async (sessionId, next) => {
				if (next.some((fact) => fact.sessionId !== sessionId)) throw new Error("affiliation");
				harness.facts.push(...next);
			},
			listSessions: async (cwd) =>
				cwd === harness.workspaceId ? [{ sessionId: harness.sessionId, cwd: harness.workspaceId }] : [],
			readWorkingDirectory: () => harness.workspaceId,
			getSessionPath: () => join(harness.projectRoot, "session.jsonl"),
		},
		project: {
			exists: async (path) => harness.projectFiles.has(path),
			read: async (path) => harness.projectFiles.get(path),
			write: async (path, content) => {
				if (!path.startsWith("ssh://")) {
					await mkdir(dirname(path), { recursive: true });
					await writeFile(path, content, "utf8");
				}
				harness.projectFiles.set(path, content);
			},
		},
		watchFile: (path, onChange) => {
			harness.watchers.set(path, onChange);
			return () => harness.watchers.delete(path);
		},
	});
}
