// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import { SqliteMemoryWorkerStore } from "@vetta/runtime-node/memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryControlService } from "./memory-control-service.js";

/**
 * TASK-0376 控制面服务合同（真实存储）：分页/搜索/详情/更正（expectedRevision）
 * /遗忘（同一 erasure 事务）/模式预算持久化与授权边界。
 */

let workDir: string;
let databasePath: string;
let seed: SqliteMemoryWorkerStore;
let service: MemoryControlService;

beforeEach(async () => {
	workDir = mkdtempSync(join(tmpdir(), "desktop-memory-control-"));
	databasePath = join(workDir, "memory.sqlite");
	seed = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
	});
	service = new MemoryControlService({
		memoryDirectory: workDir,
		allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
	});
});

afterEach(async () => {
	await seed.close();
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

describe("记忆控制面服务", () => {
	it("分页列表：按 recordedAt 倒序、scope 过滤与 hasMore", async () => {
		for (let i = 0; i < 5; i += 1) {
			await seed.write(FIXTURE_PROJECT_SCOPE, {
				action: "remember",
				content: `项目事实 ${i}`,
				kind: "fact",
				scopeName: "project",
			});
		}
		await seed.write(FIXTURE_USER_SCOPE, {
			action: "remember",
			content: "用户偏好：中文回复",
			kind: "preference",
			scopeName: "user",
		});
		const all = await service.list({ scope: "all", page: 1, pageSize: 3 });
		expect(all.items).toHaveLength(3);
		expect(all.hasMore).toBe(true);
		const rest = await service.list({ scope: "all", page: 2, pageSize: 3 });
		expect(rest.items).toHaveLength(3);
		expect(rest.hasMore).toBe(false);
		const userOnly = await service.list({ scope: "user" });
		expect(userOnly.items.map((item) => item.content)).toEqual(["用户偏好：中文回复"]);
	});

	it("搜索：中文短词回退标注 degraded；空查询返回空", async () => {
		await seed.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "构建入口 bun run check",
			kind: "convention",
			scopeName: "project",
		});
		const empty = await service.search({ query: "   " });
		expect(empty.items).toEqual([]);
		const short = await service.search({ query: "构建", scope: "project" });
		expect(short.degraded).toBe(true);
		expect(short.items.some((item) => item.content.includes("bun run check"))).toBe(true);
	});

	it("详情返回修订历史与来源；不存在报 NOT_FOUND", async () => {
		const written = await seed.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "初版",
			kind: "fact",
			scopeName: "project",
			sources: [{ sourceId: "session/s/1/1", role: "user-input" }],
		});
		await service.correct({ memoryId: written.memoryId, expectedRevision: 1, content: "二版" });
		const detail = await service.detail({ memoryId: written.memoryId });
		expect(detail.revisions.map((revision) => revision.content)).toEqual(["初版", "二版"]);
		expect(detail.sources).toEqual([{ sourceId: "session/s/1/1", role: "user-input" }]);
		await expect(service.detail({ memoryId: "mem-none" })).rejects.toThrowError(/NOT_FOUND/);
	});

	it("更正走 expectedRevision：冲突如实报错", async () => {
		const written = await seed.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "原值",
			kind: "fact",
			scopeName: "project",
		});
		const corrected = await service.correct({
			memoryId: written.memoryId,
			expectedRevision: 1,
			content: "新值",
		});
		expect(corrected.revision).toBe(2);
		await expect(
			service.correct({ memoryId: written.memoryId, expectedRevision: 1, content: "过时" }),
		).rejects.toThrowError(/REVISION_CONFLICT|expectedRevision/);
	});

	it("遗忘走同一 erasure 事务：列表/详情清空，来源处理只登记", async () => {
		const written = await seed.write(FIXTURE_PROJECT_SCOPE, {
			action: "remember",
			content: "将遗忘",
			kind: "fact",
			scopeName: "project",
		});
		const outcome = await service.forget({ memoryId: written.memoryId, alsoProcessSources: true });
		expect(outcome.erasureEpoch).toBeGreaterThan(0);
		expect(outcome.alsoProcessSourcesAccepted).toBe(true);
		await expect(service.detail({ memoryId: written.memoryId })).rejects.toThrowError(/NOT_FOUND/);
		const list = await service.list({ scope: "all" });
		expect(list.items).toEqual([]);
	});

	it("模式/预算持久化：缺省 off；automatic 无模型被拒；roundtrip 保持", async () => {
		expect(service.readPolicy()).toEqual({ mode: "off" });
		await expect(service.setPolicy({ mode: "automatic" })).rejects.toThrowError(/automatic/);
		const saved = await service.setPolicy({
			mode: "automatic",
			extractionModel: "local/extractor-1",
			dailyRequestLimit: 50,
		});
		expect(saved).toEqual({ mode: "automatic", extractionModel: "local/extractor-1", dailyRequestLimit: 50 });
		const reread = new MemoryControlService({
			memoryDirectory: workDir,
			allowedScopes: [FIXTURE_USER_SCOPE],
		});
		expect(reread.readPolicy()).toEqual(saved);
	});

	it("授权边界：service 不暴露 principal/DB 路径（接口面）", () => {
		const serviceMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
		for (const required of ["list", "search", "detail", "correct", "forget", "readPolicy", "setPolicy"]) {
			expect(serviceMethods).toContain(required);
		}
		// 接口面不暴露 principal/数据库路径类方法。
		expect(serviceMethods.filter((name) => /principal|database|path|sql/i.test(name))).toEqual([]);
	});
});
