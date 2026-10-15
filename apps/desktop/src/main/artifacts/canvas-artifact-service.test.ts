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
	it("用户写入沿用 artifact 归属会话、自增版本并保留历史版本文件", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const outcome = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: created.artifactId,
			baseVersion: 1,
			content: "user-edit",
			signal,
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) throw new Error("expected update success");
		expect(outcome.descriptor).toMatchObject({
			version: 2,
			status: "generated",
			sourceSessionId: harness.sessionId,
		});
		// 历史版本不覆盖：v1 仍是原内容，v2 是新写入。
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");
		const writtenUri = outcome.descriptor.uri;
		if (!writtenUri) throw new Error("expected written uri");
		expect(await harness.store.readContent(artifactUriToPath(writtenUri) ?? "")).toBe("user-edit");
		expect(harness.facts.at(-1)).toMatchObject({
			type: "artifact.descriptor.recorded",
			sessionId: harness.sessionId,
			artifact: { version: 2, sourceSessionId: harness.sessionId },
		});
	});

	it("用户写入基线落后或文件被外部改动时都拦截为 stale_version", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const first = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: created.artifactId,
			baseVersion: 1,
			content: "v2",
			signal,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("expected update success");

		const stale = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: created.artifactId,
			baseVersion: 1,
			content: "should-not-write",
			signal,
		});
		expect(stale.ok).toBe(false);
		if (stale.ok) throw new Error("expected stale");
		expect(stale.error).toMatchObject({ code: "stale_version", currentVersion: 2, baseVersion: 1 });

		// 外部改动落在当前版本文件上：checksum 不符同样拦截，不覆盖别人的内容。
		const currentUri = first.descriptor.uri;
		if (!currentUri) throw new Error("expected updated uri");
		const currentPath = artifactUriToPath(currentUri);
		if (!currentPath) throw new Error("expected path");
		await writeFile(currentPath, "externally-changed", "utf8");
		const external = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: created.artifactId,
			baseVersion: 2,
			content: "user-edit",
			signal,
		});
		expect(external.ok).toBe(false);
		if (external.ok) throw new Error("expected stale after external change");
		expect(external.error.code).toBe("stale_version");
		expect(await harness.store.readContent(currentPath)).toBe("externally-changed");
	});

	it("用户写入中途取消时回滚刚写入的版本，不留半成品", async () => {
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const controller = new AbortController();
		controller.abort();
		const outcome = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: created.artifactId,
			baseVersion: 1,
			content: "aborted",
			signal: controller.signal,
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) throw new Error("expected cancel");
		expect(outcome.error).toMatchObject({ code: "cancelled" });
		expect(await harness.store.read(harness.workspaceId, created.artifactId, 2)).toBeUndefined();
		expect(await harness.store.readContent(artifactUriToPath(created.uri) ?? "")).toBe("# Hello");
		expect(harness.facts).toHaveLength(1);
	});

	it("用户写入不存在的 artifact 返回 missing_file", async () => {
		const harness = await createHarness();
		const outcome = await harness.service.applyUpdate({
			workspaceId: harness.workspaceId,
			artifactId: "ghost",
			baseVersion: 1,
			content: "x",
			signal,
		});
		expect(outcome.ok).toBe(false);
		if (outcome.ok) throw new Error("expected missing_file");
		expect(outcome.error).toMatchObject({ code: "missing_file", action: "update", artifactId: "ghost" });
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

	it("同基线的两次并发 update 都能完成，不再撞共享临时文件（BUG-0020）", async () => {
		// 回归：同一会话里两次 Canvas 写入并行起跑（模型并行工具调用、用户与 Agent
		// 同时保存）时，两次都写到同一个版本文件；旧实现用只带 pid 的临时文件名，
		// 先 rename 的一方把后写方的临时路径搬走，后者 rename 直接 ENOENT——
		// Windows 上表现为「文件被占用/正在使用」类错误，连续 Canvas 操作被拒。
		const harness = await createHarness();
		const created = await createArtifact(harness);
		const [first, second] = await Promise.all([
			harness.service.applyUpdate({
				workspaceId: harness.workspaceId,
				artifactId: created.artifactId,
				baseVersion: 1,
				content: "parallel-a",
				signal,
			}),
			harness.service.applyUpdate({
				workspaceId: harness.workspaceId,
				artifactId: created.artifactId,
				baseVersion: 1,
				content: "parallel-b",
				signal,
			}),
		]);
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		const versions = await harness.store.listVersions(harness.workspaceId, created.artifactId);
		expect(versions.map((version) => version.version)).toEqual([1, 2]);
		const latest = versions.at(-1);
		if (!latest) throw new Error("expected latest version");
		expect(await harness.store.readContent(latest.path)).toMatch(/^parallel-[ab]$/);
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
	service: CanvasArtifactService;
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
		service: null as unknown as CanvasArtifactService,
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
