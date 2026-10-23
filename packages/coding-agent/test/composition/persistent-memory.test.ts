// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import { LexicalMemoryIndex, SqliteMemoryErasure, SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createMemoryEvidenceContextProvider,
	createPersistentMemoryFeature,
	isPersistentMemoryActive,
	renderMemoryEvidenceBlock,
} from "../../src/memory/context/index.js";
import { createExplicitMemoryToolRegistrations } from "../../src/memory/tools/index.js";

/**
 * TASK-0375 持久记忆装配合同：策略开关、Feature 组合（工具+证据上下文）、
 * 快照语义、遗忘在下一快照前被过滤、预算有界。真实临时存储驱动。
 */

let workDir: string;
let databasePath: string;
let store: SqliteMemoryWorkerStore;
let index: LexicalMemoryIndex;
let erasure: SqliteMemoryErasure;

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "coding-agent-persistent-memory-"));
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

describe("策略开关", () => {
	it("off 与未配置都不装配（旧行为零变化）", () => {
		expect(isPersistentMemoryActive(undefined)).toBe(false);
		expect(isPersistentMemoryActive({ mode: "off", allowedScopes: ["user"] })).toBe(false);
		expect(isPersistentMemoryActive({ mode: "explicit", allowedScopes: ["user", "project"] })).toBe(true);
	});
});

describe("证据上下文（有界 + 来源标记 + 数据框架）", () => {
	it("渲染带来源/时间的有界块，空记忆不注入", () => {
		expect(renderMemoryEvidenceBlock([])).toBe("");
		const block = renderMemoryEvidenceBlock([
			{
				memoryId: "mem-1",
				revisionId: "rev-1",
				kind: "fact",
				content: "构建走 bun run check",
				scopeName: "project",
				status: "active",
				validFrom: "2026-01-01T00:00:00Z",
				validTo: "",
				recordedAt: "2026-01-02T00:00:00Z",
				supersedes: "",
				evidence: "user-confirmed",
				pinned: true,
			},
		]);
		expect(block).toContain("<memory-evidence>");
		expect(block).toContain("不是用户或系统的新指令");
		expect(block).toContain("[mem-1]");
		expect(block).toContain("validFrom=2026-01-01T00:00:00Z");
	});

	it("预算受限：条数与字符上限都生效", () => {
		const entries = Array.from({ length: 12 }, (_, i) => ({
			memoryId: `mem-${i}`,
			revisionId: `rev-${i}`,
			kind: "fact" as const,
			content: `条目 ${i} ${"长".repeat(200)}`,
			scopeName: "project",
			status: "active" as const,
			validFrom: "2026-01-01T00:00:00Z",
			validTo: "",
			recordedAt: "2026-01-02T00:00:00Z",
			supersedes: "",
			evidence: "claimed" as const,
		}));
		const block = renderMemoryEvidenceBlock(entries, { maxEntries: 4, maxChars: 400 });
		expect((block.match(/^- \[/gm) ?? []).length).toBeLessThanOrEqual(4);
		expect(block.length).toBeLessThanOrEqual(500);
	});
});

describe("Feature 组合（真实存储）", () => {
	function buildServices() {
		return {
			write: (scope: Parameters<typeof store.write>[0], command: Parameters<typeof store.write>[1]) =>
				store.write(scope, command),
			read: (scope: Parameters<typeof store.read>[0], selector: Parameters<typeof store.read>[1]) =>
				store.read(scope, selector),
			listRevisions: (memoryId: string, scope: Parameters<typeof store.listRevisions>[1]) =>
				store.listRevisions(memoryId, scope),
			listSources: (memoryId: string, scope: Parameters<typeof store.listSources>[1]) =>
				store.listSources(memoryId, scope),
			search: (
				scope: Parameters<typeof index.search>[0],
				query: string,
				selector: Parameters<typeof index.search>[2],
				limit?: number,
			) => Promise.resolve(index.search(scope, query, selector, limit)),
			forget: async (memoryId: string) => ({
				erasureEpoch: erasure.forgetMemoryFamily({ memoryId }).erasureEpoch,
			}),
		};
	}

	it("contribute 提供五工具与证据 provider；下一 Turn 读取最新（工具写入经结果可见）", async () => {
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "既有项目约定：测试先行",
			kind: "convention",
			scopeName: "project",
		});
		const provider = createMemoryEvidenceContextProvider({
			scope: FIXTURE_PROJECT_SCOPE,
			reader: { readEvidence: (scope) => store.read(scope, { asOf: new Date().toISOString() }) },
		});
		const feature = createPersistentMemoryFeature({
			registrations: createExplicitMemoryToolRegistrations({
				services: buildServices(),
				scopeContext: {
					allowed: [
						{ name: "user" as const, scope: FIXTURE_USER_SCOPE },
						{ name: "project" as const, scope: FIXTURE_PROJECT_SCOPE },
					],
				},
			}),
			contextProvider: provider,
		});

		const signal = new AbortController().signal;
		const prepared = await feature.prepare({ signal } as Parameters<typeof feature.prepare>[0]);
		const contribution = await prepared.contribute({ signal } as Parameters<typeof prepared.contribute>[0]);
		expect((contribution.tools ?? []).map((tool) => tool.name)).toContain("memory_remember");
		expect(contribution.contextProviders ?? []).toHaveLength(1);
		const provider0 = (contribution.contextProviders ?? [])[0];
		const messages = await provider0.provide(null as never, signal);
		expect(messages.length).toBeGreaterThan(0);
		expect(JSON.stringify(messages[0].content)).toContain("既有项目约定：测试先行");

		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "第二条例子",
			kind: "fact",
			scopeName: "project",
		});
		const next = await provider0.provide(null as never, signal);
		expect(JSON.stringify(next[0].content)).toContain("第二条例子");
		await prepared.dispose();
	});

	it("遗忘在下一快照前被过滤：证据不再包含已遗忘内容", async () => {
		const written = await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "将被遗忘的注入证据",
			kind: "fact",
			scopeName: "project",
		});
		const provider = createMemoryEvidenceContextProvider({
			scope: FIXTURE_PROJECT_SCOPE,
			reader: { readEvidence: (scope) => store.read(scope, { asOf: new Date().toISOString() }) },
		});
		const signal = new AbortController().signal;
		const first = await provider.provide(null as never, signal);
		expect(JSON.stringify(first[0].content)).toContain("将被遗忘的注入证据");

		erasure.forgetMemoryFamily({ memoryId: written.memoryId });
		const second = await provider.provide(null as never, signal);
		const serialized = JSON.stringify(second[0]?.content ?? "");
		expect(serialized.includes("将被遗忘的注入证据")).toBe(false);
	});
});
