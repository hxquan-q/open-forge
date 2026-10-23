// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryScope } from "@vetta/runtime-memory";
import { FIXTURE_PROJECT_SCOPE } from "@vetta/runtime-memory/fixtures";
import {
	applyCharacterBudget,
	DEFAULT_HYBRID_BUDGET,
	dedupeByMemory,
	fuseByRank,
	HybridMemoryRetriever,
	resolveHybridPlan,
	type SemanticChannel,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0382 混合检索合同：RRF 融合、去同源、预算有界、双路降级标注、
 * 真实词法通道 + 确定性语义替身。
 */

let workDir: string;
let databasePath: string;
let store: SqliteMemoryWorkerStore;

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-hybrid-"));
	databasePath = join(workDir, "memory.sqlite");
	store = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_PROJECT_SCOPE],
	});
});

afterEach(async () => {
	await store.close();
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("RRF 融合（纯函数）", () => {
	it("按排名倒数融合：双路共识条目排前", () => {
		const lexical = [
			{ memoryId: "a", revisionId: "r1", content: "词法第一" },
			{ memoryId: "b", revisionId: "r2", content: "词法第二" },
		];
		const semantic = [
			{ memoryId: "b", revisionId: "r2", content: "词法第二" },
			{ memoryId: "c", revisionId: "r3", content: "语义第二" },
		];
		const fused = fuseByRank([lexical, semantic]);
		expect(fused[0]?.memoryId).toBe("b");
		expect(fused.map((entry) => entry.memoryId)).toContain("a");
		expect(fused.map((entry) => entry.memoryId)).toContain("c");
	});

	it("各通道候选截断与最终条数上限受预算约束", () => {
		const channel = Array.from({ length: 50 }, (_, i) => ({
			memoryId: `m${i}`,
			revisionId: `r${i}`,
			content: `条目${i}`,
		}));
		const fused = fuseByRank([channel, []], { ...DEFAULT_HYBRID_BUDGET, maxEntries: 5 });
		expect(fused.length).toBeLessThanOrEqual(5);
	});

	it("去同源：同 memoryId 只保留一条", () => {
		const entries = [
			{ memoryId: "a", revisionId: "r1", content: "x" },
			{ memoryId: "a", revisionId: "r2", content: "x" },
			{ memoryId: "b", revisionId: "r3", content: "y" },
		];
		expect(dedupeByMemory(entries).map((entry) => entry.memoryId)).toEqual(["a", "b"]);
	});

	it("字符预算截断：超预算条目跳过而非截断内容", () => {
		const entries = [
			{ memoryId: "a", revisionId: "r1", content: "x".repeat(800) },
			{ memoryId: "b", revisionId: "r2", content: "y".repeat(800) },
			{ memoryId: "c", revisionId: "r3", content: "z" },
		];
		const result = applyCharacterBudget(entries, { ...DEFAULT_HYBRID_BUDGET, maxChars: 1000 });
		expect(result.map((entry) => entry.memoryId)).toEqual(["a", "c"]);
	});

	it("降级计划：无模型/超时/索引旧 epoch 各自标注", () => {
		expect(resolveHybridPlan({ semanticAvailable: false })).toEqual({
			useSemantic: false,
			degradation: "semantic-unavailable",
		});
		expect(resolveHybridPlan({ semanticAvailable: true, semanticTimedOut: true })).toEqual({
			useSemantic: false,
			degradation: "semantic-timeout",
		});
		expect(resolveHybridPlan({ semanticAvailable: true, semanticIndexEpochStale: true })).toEqual({
			useSemantic: false,
			degradation: "semantic-stale-index",
		});
		expect(resolveHybridPlan({ semanticAvailable: true })).toEqual({ useSemantic: true, degradation: "none" });
	});
});

describe("HybridMemoryRetriever（真实词法 + 确定性语义替身）", () => {
	async function seedMemories() {
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "项目构建命令 bun run check 是唯一入口",
			kind: "convention",
			scopeName: "project",
		});
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "语义相近但措辞不同的构建说明",
			kind: "fact",
			scopeName: "project",
		});
	}

	it("双路融合命中：共识条目在前，标注 fused", async () => {
		await seedMemories();
		const { LexicalMemoryIndex } = await import("@vetta/runtime-node/memory");
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		try {
			const semantic: SemanticChannel = async () => [
				{ memoryId: "mem-sem-1", revisionId: "rev-sem-1", content: "语义替身命中" },
			];
			const retriever = new HybridMemoryRetriever({ lexical, semantic: { search: semantic } });
			const result = await retriever.search(FIXTURE_PROJECT_SCOPE, "构建命令", { asOf: "2030-01-01T00:00:00Z" });
			expect(result.degradation).toBe("none");
			expect(result.entries.length).toBeGreaterThan(0);
			expect(result.entries.some((entry) => entry.matchKind === "fused")).toBe(true);
		} finally {
			lexical.close();
		}
	});

	it("无语义模型：词法单路并标注 semantic-unavailable", async () => {
		await seedMemories();
		const { LexicalMemoryIndex } = await import("@vetta/runtime-node/memory");
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		try {
			const retriever = new HybridMemoryRetriever({ lexical });
			const result = await retriever.search(FIXTURE_PROJECT_SCOPE, "bun run check", {
				asOf: "2030-01-01T00:00:00Z",
			});
			expect(result.degradation).toBe("semantic-unavailable");
			expect(result.entries.some((entry) => entry.content.includes("bun run check"))).toBe(true);
		} finally {
			lexical.close();
		}
	});

	it("语义超时：软超时退词法并标注 semantic-timeout", async () => {
		await seedMemories();
		const { LexicalMemoryIndex } = await import("@vetta/runtime-node/memory");
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		try {
			const slow: SemanticChannel = () => new Promise((resolve) => setTimeout(() => resolve([]), 5_000));
			const retriever = new HybridMemoryRetriever({
				lexical,
				semantic: { search: slow },
				semanticTimeoutMs: 100,
			});
			const result = await retriever.search(FIXTURE_PROJECT_SCOPE, "构建", { asOf: "2030-01-01T00:00:00Z" });
			expect(result.degradation).toBe("semantic-timeout");
			expect(result.entries.length).toBeGreaterThan(0);
		} finally {
			lexical.close();
		}
	});

	it("短词词法降级标注透传（中文 1/2 字）", async () => {
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "短词回退验证条目",
			kind: "fact",
			scopeName: "project",
		});
		const { LexicalMemoryIndex } = await import("@vetta/runtime-node/memory");
		const lexical = await LexicalMemoryIndex.open({ databasePath });
		try {
			const retriever = new HybridMemoryRetriever({ lexical });
			const result = await retriever.search(FIXTURE_PROJECT_SCOPE as MemoryScope, "短词", {
				asOf: "2030-01-01T00:00:00Z",
			});
			expect(result.lexicalDegraded).toBe(true);
		} finally {
			lexical.close();
		}
	});
});
