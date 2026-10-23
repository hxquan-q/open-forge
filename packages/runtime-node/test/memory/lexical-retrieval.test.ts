// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryScope } from "@vetta/runtime-memory";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import {
	escapeFts5StringLiteral,
	LexicalMemoryIndex,
	planLexicalQuery,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * TASK-0372 词法检索合同：作用域隔离、短词回退、字面量转义、有效时间过滤、
 * 可重复重建。真实临时库 + 真实 FTS5（trigram），短词路径参数化 instr。
 */

let workDir: string;
let databasePath: string;

const OTHER_PROJECT_SCOPE: MemoryScope = {
	name: "project",
	identity: { principalId: "principal-fixture-1", projectId: "project-other" },
};

function otherScope(): MemoryScope {
	return OTHER_PROJECT_SCOPE;
}

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "runtime-node-lexical-"));
	databasePath = join(workDir, "memory.sqlite");
	const store = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE, OTHER_PROJECT_SCOPE],
	});
	try {
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "记忆升级需要 SQLite 驱动与 FTS5 索引",
			kind: "fact",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "路径 packages/runtime-node/src/memory 是存储层拓扑",
			kind: "fact",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: '错误码 ERR_DLOPEN_FAILED 与引号"和星号*都是字面量',
			kind: "fact",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
		await store.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "alpha OR beta 是按字面处理的查询词",
			kind: "fact",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
		await store.write(OTHER_PROJECT_SCOPE, {
			action: "remember",
			content: "别的项目也有 SQLite 字样，但不得跨 scope 命中",
			kind: "fact",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
	} finally {
		await store.close();
	}
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("查询计划与转义（纯函数）", () => {
	it("≥3 Unicode 字符走 trigram，不降级", () => {
		const plan = planLexicalQuery("记忆升级");
		expect(plan.matchKind).toBe("trigram");
		expect(plan.degraded).toBe(false);
		expect(plan.ftsLiteral).toBe('"记忆升级"');
	});

	it("1/2 字短词只走 instr 回退并标记 degraded", () => {
		for (const term of ["记", "记忆"]) {
			const plan = planLexicalQuery(term);
			expect(plan.matchKind).toBe("instr-fallback");
			expect(plan.degraded).toBe(true);
			expect(plan.instrTerm).toBe(term);
		}
	});

	it("FTS 语法字符被字面量转义", () => {
		expect(escapeFts5StringLiteral('引号"内容')).toBe('"引号""内容"');
		expect(escapeFts5StringLiteral("a*b")).toBe('"a*b"');
		expect(() => planLexicalQuery("   ")).toThrowError(/不能为空/);
	});
});

describe("作用域词法检索（真实 FTS5）", () => {
	it("trigram 命中项目内事实，其他项目不可见", async () => {
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const result = index.search(FIXTURE_PROJECT_SCOPE, "SQLite 驱动", { asOf: "2026-06-01T00:00:00Z" });
			expect(result.matchKind).toBe("trigram");
			expect(result.entries.length).toBeGreaterThanOrEqual(1);
			expect(result.entries.some((entry) => entry.content.includes("FTS5 索引"))).toBe(true);

			const other = index.search(otherScope(), "SQLite 驱动", { asOf: "2026-06-01T00:00:00Z" });
			expect(other.entries.some((entry) => entry.content.includes("别的项目"))).toBe(false);
			expect(other.entries.filter((entry) => entry.content.includes("不得跨 scope"))).toHaveLength(0);
		} finally {
			index.close();
		}
	});

	it("1/2 字中文短词经参数化 instr 回退命中", async () => {
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const one = index.search(FIXTURE_PROJECT_SCOPE, "记", { asOf: "2026-06-01T00:00:00Z" });
			expect(one.usedFallback).toBe(true);
			expect(one.entries.length).toBeGreaterThanOrEqual(1);
			expect(one.entries.every((entry) => entry.content.includes("记"))).toBe(true);

			const two = index.search(FIXTURE_PROJECT_SCOPE, "记忆", { asOf: "2026-06-01T00:00:00Z" });
			expect(two.usedFallback).toBe(true);
			expect(two.entries.some((entry) => entry.content.includes("记忆升级"))).toBe(true);
		} finally {
			index.close();
		}
	});

	it("路径/错误码按字面命中；引号星号不触发 FTS 语法", async () => {
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const path = index.search(FIXTURE_PROJECT_SCOPE, "runtime-node/src/memory", { asOf: "2026-06-01T00:00:00Z" });
			expect(path.entries.some((entry) => entry.content.includes("路径 packages"))).toBe(true);

			const quoted = index.search(FIXTURE_PROJECT_SCOPE, '引号"和星号*', { asOf: "2026-06-01T00:00:00Z" });
			expect(quoted.entries.some((entry) => entry.content.includes("ERR_DLOPEN_FAILED"))).toBe(true);

			const literalOr = index.search(FIXTURE_PROJECT_SCOPE, "alpha OR beta", { asOf: "2026-06-01T00:00:00Z" });
			expect(literalOr.entries.some((entry) => entry.content.includes("alpha OR beta 是按字面"))).toBe(true);
			expect(literalOr.entries.every((entry) => entry.content.includes("按字面处理"))).toBe(true);
		} finally {
			index.close();
		}
	});

	it("有效时间过滤：历史区间外的修订不参与当前检索", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "旧版检索约定 lexical-only",
				kind: "convention",
				scopeName: "project",
				validFrom: "2026-01-01T00:00:00Z",
			});
			await new Promise((resolve) => setTimeout(resolve, 5));
			await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "correct",
				memoryId: written.memoryId,
				expectedRevision: 1,
				content: "新版检索约定 hybrid-ready",
			});
		} finally {
			await store.close();
		}
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const now = index.search(FIXTURE_PROJECT_SCOPE, "检索约定", { asOf: "2030-01-01T00:00:00Z" });
			expect(now.entries.some((entry) => entry.content.includes("hybrid-ready"))).toBe(true);
			expect(now.entries.some((entry) => entry.content.includes("lexical-only"))).toBe(false);
		} finally {
			index.close();
		}
	});

	it("遗忘后索引重建可重复且不复活", async () => {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_PROJECT_SCOPE],
		});
		let forgottenId = "";
		try {
			const written = await store.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: "将被遗忘的 FTS 索引行",
				kind: "fact",
				scopeName: "project",
			});
			forgottenId = written.memoryId;
			await store.write(FIXTURE_PROJECT_SCOPE, { action: "forget", memoryId: forgottenId });
		} finally {
			await store.close();
		}
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			index.refresh();
			const first = index.search(FIXTURE_PROJECT_SCOPE, "将被遗忘", { asOf: "2030-01-01T00:00:00Z" });
			index.refresh();
			const second = index.search(FIXTURE_PROJECT_SCOPE, "将被遗忘", { asOf: "2030-01-01T00:00:00Z" });
			expect(first.entries).toEqual([]);
			expect(second.entries).toEqual([]);
		} finally {
			index.close();
		}
	});

	it("无命中与降级不混同：空结果仍是成功的 trigram 查询", async () => {
		const index = await LexicalMemoryIndex.open({ databasePath });
		try {
			const result = index.search(FIXTURE_PROJECT_SCOPE, "不存在的查询词组", { asOf: "2026-06-01T00:00:00Z" });
			expect(result.entries).toEqual([]);
			expect(result.degraded).toBe(false);
			expect(result.usedFallback).toBe(false);
		} finally {
			index.close();
		}
	});
});
