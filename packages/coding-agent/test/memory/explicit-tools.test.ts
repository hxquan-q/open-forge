// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryScope } from "@vetta/runtime-memory";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import { LexicalMemoryIndex, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createExplicitMemoryToolRegistrations,
	createMemoryCorrectTool,
	createMemoryForgetTool,
	createMemoryGetTool,
	createMemoryRecallTool,
	createMemoryRememberTool,
	EXPLICIT_MEMORY_TOOL_SCOPES,
} from "../../src/memory/tools/index.js";

/**
 * TASK-0374 显式记忆工具合同：真实存储（worker store + FTS 检索 + 遗忘屏障）
 * 驱动工具行为：ID/revision/scope/状态输出、expectedRevision 冲突不吞、
 * 遗忘后拒绝复活、宿主绑定 scope（模型不能自述身份）、与 legacy 工具不共存。
 */

let workDir: string;
let databasePath: string;
let store: SqliteMemoryWorkerStore;
let index: LexicalMemoryIndex;
let erasure: SqliteMemoryErasure;

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "coding-agent-explicit-memory-"));
	databasePath = join(workDir, "memory.sqlite");
	store = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
	});
	index = await LexicalMemoryIndex.open({ databasePath });
	erasure = await SqliteMemoryErasure.open({ databasePath });
});

afterEach(async () => {
	erasure.close();
	index.close();
	await store.close();
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

const now = () => "2030-01-01T00:00:00Z";

function buildServices() {
	return {
		write: (scope: MemoryScope, command: Parameters<typeof store.write>[1]) => store.write(scope, command),
		read: (scope: MemoryScope, selector: Parameters<typeof store.read>[1]) => store.read(scope, selector),
		listRevisions: (memoryId: string, scope: MemoryScope) => store.listRevisions(memoryId, scope),
		listSources: (memoryId: string, scope: MemoryScope) => store.listSources(memoryId, scope),
		search: (scope: MemoryScope, query: string, selector: Parameters<typeof store.read>[1], limit?: number) =>
			Promise.resolve(index.search(scope, query, selector, limit)),
		forget: async (memoryId: string, _scope: MemoryScope) => {
			const outcome = erasure.forgetMemoryFamily({ memoryId });
			return { erasureEpoch: outcome.erasureEpoch };
		},
	};
}

const scopeContext = {
	allowed: [
		{ name: "user" as const, scope: FIXTURE_USER_SCOPE },
		{ name: "project" as const, scope: FIXTURE_PROJECT_SCOPE },
	],
};

describe("显式记忆工具（真实存储）", () => {
	it("remember 返回稳定 ID/revision/scope/状态与有界来源", async () => {
		const tool = createMemoryRememberTool({ services: buildServices(), scopeContext, now });
		const result = await tool.execute({
			input: {
				description: "save convention",
				content: "项目 A 的构建走 bun run check",
				kind: "convention",
				scope: "project",
				sources: [{ sourceId: "session/s1/turn/1/entry/1", role: "user-input" }],
			},
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		expect(result.details).toMatchObject({ revision: 1, scope: "project", status: "saved" });
		const memoryId = (result.details as { memoryId: string }).memoryId;
		expect(memoryId).toMatch(/^mem-/);
		const sources = await store.listSources(memoryId, FIXTURE_PROJECT_SCOPE);
		expect(sources).toHaveLength(1);
	});

	it("recall 命中已保存内容并标注降级回退", async () => {
		const remember = createMemoryRememberTool({ services: buildServices(), scopeContext, now });
		await remember.execute({
			input: { description: "d", content: "记忆工具需要中文短词回退", scope: "project" },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		const recall = createMemoryRecallTool({ services: buildServices(), scopeContext, now });
		const shortTerm = await recall.execute({
			input: { description: "d", query: "短词", limit: 5 },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		expect(shortTerm.details).toMatchObject({ degraded: true });
		expect(shortTerm.content[0]).toMatchObject({ type: "text" });
		expect((shortTerm.content[0] as { text: string }).text).toContain("记忆工具需要中文短词回退");
	});

	it("correct 带 expectedRevision：冲突错误不被吞掉", async () => {
		const remember = createMemoryRememberTool({ services: buildServices(), scopeContext, now });
		const written = await remember.execute({
			input: { description: "d", content: "初始", scope: "project" },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		const memoryId = (written.details as { memoryId: string }).memoryId;
		const correct = createMemoryCorrectTool({ services: buildServices(), scopeContext, now });
		const ok = await correct.execute({
			input: { description: "d", memoryId, expectedRevision: 1, content: "更正版", scope: "project" },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		expect(ok.details).toMatchObject({ revision: 2 });
		await expect(
			correct.execute({
				input: { description: "d", memoryId, expectedRevision: 1, content: "过时版本", scope: "project" },
				sessionId: "session-test",
				turnId: "turn-1",
				toolCallId: "call-1",
				signal: new AbortController().signal,
			}),
		).rejects.toThrowError(/REVISION_CONFLICT|expectedRevision/);
	});

	it("forget 清除家族：get/recall 空且再次写入被拒", async () => {
		const remember = createMemoryRememberTool({ services: buildServices(), scopeContext, now });
		const written = await remember.execute({
			input: { description: "d", content: "将被遗忘的显式条目", scope: "project" },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		const memoryId = (written.details as { memoryId: string }).memoryId;
		const forget = createMemoryForgetTool({ services: buildServices(), scopeContext, now });
		const outcome = await forget.execute({
			input: { description: "d", memoryId },
			sessionId: "session-test",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		expect(outcome.details).toMatchObject({ memoryId });
		const get = createMemoryGetTool({ services: buildServices(), scopeContext, now });
		await expect(
			get.execute({
				input: { description: "d", memoryId },
				sessionId: "session-test",
				turnId: "turn-1",
				toolCallId: "call-1",
				signal: new AbortController().signal,
			}),
		).rejects.toThrowError(/NOT_FOUND/);
		await expect(
			createMemoryCorrectTool({ services: buildServices(), scopeContext, now }).execute({
				input: { description: "d", memoryId, expectedRevision: 1, content: "复活", scope: "project" },
				sessionId: "session-test",
				turnId: "turn-1",
				toolCallId: "call-1",
				signal: new AbortController().signal,
			}),
		).rejects.toThrowError(/MEMORY_SUPPRESSED|已被遗忘/);
	});

	it("宿主未授权的 scope 提示被拒（模型不能扩大作用域）", async () => {
		const limitedContext = { allowed: [{ name: "project" as const, scope: FIXTURE_PROJECT_SCOPE }] };
		const remember = createMemoryRememberTool({ services: buildServices(), scopeContext: limitedContext, now });
		await expect(
			remember.execute({
				input: { description: "d", content: "x", scope: "user" },
				sessionId: "session-test",
				turnId: "turn-1",
				toolCallId: "call-1",
				signal: new AbortController().signal,
			}),
		).rejects.toThrowError(/SCOPE_NOT_ALLOWED/);
	});

	it("工具注册：五个版本化工具名、scopeUse 排除 im-claw、不与 legacy 并存", () => {
		const registrations = createExplicitMemoryToolRegistrations({
			services: buildServices(),
			scopeContext,
			now,
		});
		expect(registrations.map((registration) => registration.tool.name).sort()).toEqual([
			"memory_correct",
			"memory_forget",
			"memory_get",
			"memory_recall",
			"memory_remember",
		]);
		for (const registration of registrations) {
			expect(registration.scopeUse).not.toContain("im-claw");
			expect(EXPLICIT_MEMORY_TOOL_SCOPES).toContain("conversation");
		}
	});
});
