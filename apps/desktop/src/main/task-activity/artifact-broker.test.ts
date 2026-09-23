// Copyright The Open Forge contributors.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodingAgentArtifactFunctionRequest } from "@vetta/coding-agent/function-extensions";
import type { RuntimeSessionFactEvent } from "@vetta/runtime-core/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";

const recorded: RuntimeSessionFactEvent[][] = [];

vi.mock("../runtime.js", () => ({
	getSharedRuntime: () => ({
		// 用测试根目录充当会话目录：sessionId 即绝对路径，便于断言暂存落点。
		getSessionPath: (sessionId: string) => join(sessionId, "session.jsonl"),
		recordTaskFacts: async (_sessionId: string, facts: RuntimeSessionFactEvent[]) => {
			recorded.push(facts);
			return undefined;
		},
		getTaskState: (sessionId: string) =>
			taskStates.get(sessionId) ?? { tasks: [], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() },
	}),
}));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
/** attach_to_task 的被测边界：只 mock task activity 服务，验证委托与字段回填。 */
const mockAttachToActiveTask = vi.fn();
vi.mock("./task-activity-service.js", () => ({
	desktopTaskActivityService: {
		getState: (sessionId: string) =>
			taskStates.get(sessionId) ?? { tasks: [], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() },
		attachToActiveTask: (...args: unknown[]) => mockAttachToActiveTask(...args),
	},
}));
vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: () => undefined }) }));

const taskStates = new Map<string, unknown>();

import { getDesktopArtifactBroker } from "./artifact-broker.js";

const roots: string[] = [];

afterEach(async () => {
	recorded.length = 0;
	taskStates.clear();
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function tempSession(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-artifact-"));
	roots.push(root);
	return root;
}

function createRequest(sessionId: string, input: Record<string, unknown>): CodingAgentArtifactFunctionRequest {
	return { sessionId, turnId: "turn-1", input: input as never };
}

describe("DesktopArtifactBroker create", () => {
	it("内容写入会话目录下的 artifacts 子目录，并返回 descriptor 回填所需字段", async () => {
		const sessionId = await tempSession();
		const outcome = await getDesktopArtifactBroker().handle(
			createRequest(sessionId, {
				action: "create",
				title: "周报",
				kind: "document",
				content: "# 周报\n正文",
			}),
		);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		const artifactsDir = join(sessionId, "artifacts");
		const files = await readdir(artifactsDir);
		expect(files).toHaveLength(1);
		expect(await readFile(join(artifactsDir, files[0]!), "utf8")).toContain("周报");
		expect(outcome.action).toBe("create");
		expect(outcome.artifactId).toMatch(/^artifact-/);
		expect(outcome.version).toBe(1);
		expect(outcome.title).toBe("周报");
		expect(outcome.kind).toBe("document");
		expect(outcome.uri?.startsWith(artifactsDir)).toBe(true);
	});

	it("重名文件加序号，绝不覆盖既有内容", async () => {
		const sessionId = await tempSession();
		const broker = getDesktopArtifactBroker();
		const first = await broker.handle(
			createRequest(sessionId, { action: "create", title: "报告", kind: "document", content: "v1" }),
		);
		const second = await broker.handle(
			createRequest(sessionId, { action: "create", title: "报告", kind: "document", content: "v2" }),
		);
		if (!first.ok || !second.ok) throw new Error("expected success");
		expect(first.uri).not.toBe(second.uri);
		expect(await readFile(second.uri as string, "utf8")).toBe("v2");
		const artifactsDir = join(sessionId, "artifacts");
		expect(await readdir(artifactsDir)).toHaveLength(2);
	});

	it("缺 title 时用 filename 派生文件名；两者都缺时拒绝", async () => {
		const sessionId = await tempSession();
		const named = await getDesktopArtifactBroker().handle(
			createRequest(sessionId, { action: "create", filename: "notes.md", kind: "document", content: "x" }),
		);
		if (named.ok) expect(named.uri?.endsWith("notes.md")).toBe(true);
		const rejected = await getDesktopArtifactBroker().handle(
			createRequest(sessionId, { action: "create", kind: "document", content: "x" }),
		);
		expect(rejected).toMatchObject({ ok: false, code: "invalid_input" });
	});
});

describe("DesktopArtifactBroker attach_to_task", () => {
	const baseDescriptor = {
		schemaVersion: 1 as const,
		artifactId: "artifact-1",
		kind: "document" as const,
		status: "generated" as const,
		title: "草稿",
		uri: "C:\\tmp\\draft.md",
		version: 3,
		createdAt: 1,
		updatedAt: 1,
	};

	it("从投影找回 descriptor 后委托 task activity 服务，并回填挂载后的字段", async () => {
		const sessionId = await tempSession();
		const attached = { ...baseDescriptor, artifactId: "artifact-attached", version: 4 };
		taskStates.set(sessionId, {
			tasks: [],
			artifacts: [baseDescriptor],
			pendingApprovals: [],
			approvalDecisions: new Map(),
		});
		mockAttachToActiveTask.mockResolvedValue({
			ok: true,
			state: { tasks: [], artifacts: [attached], pendingApprovals: [], approvalDecisions: new Map() },
		});
		const outcome = await getDesktopArtifactBroker().handle(
			createRequest(sessionId, { action: "attach_to_task", artifactId: "artifact-1" }),
		);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(mockAttachToActiveTask).toHaveBeenCalledTimes(1);
		expect(mockAttachToActiveTask).toHaveBeenCalledWith(sessionId, {
			kind: "document",
			title: "草稿",
			uri: "C:\\tmp\\draft.md",
		});
		expect(outcome.action).toBe("attach_to_task");
		expect(outcome.artifactId).toBe("artifact-attached");
		expect(outcome.version).toBe(4);
		expect(outcome.title).toBe("草稿");
		expect(outcome.uri).toBe("C:\\tmp\\draft.md");
	});

	it("无活跃任务时把 task_not_found 映射为 no_active_task", async () => {
		const sessionId = await tempSession();
		taskStates.set(sessionId, {
			tasks: [],
			artifacts: [baseDescriptor],
			pendingApprovals: [],
			approvalDecisions: new Map(),
		});
		mockAttachToActiveTask.mockResolvedValue({
			ok: false,
			code: "task_not_found",
			message: "no active task in this session",
		});
		const outcome = await getDesktopArtifactBroker().handle(
			createRequest(sessionId, { action: "attach_to_task", artifactId: "artifact-1" }),
		);
		expect(outcome).toMatchObject({ ok: false, code: "no_active_task", action: "attach_to_task" });
	});
});

describe("DesktopArtifactBroker 其余 action", () => {
	it("update/get/list 返回 unimplemented", async () => {
		const sessionId = await tempSession();
		const broker = getDesktopArtifactBroker();
		for (const action of ["update", "get", "list"]) {
			const outcome = await broker.handle(createRequest(sessionId, { action, artifactId: "artifact-x" }));
			expect(outcome).toMatchObject({ ok: false, code: "unimplemented", action });
		}
	});
});
