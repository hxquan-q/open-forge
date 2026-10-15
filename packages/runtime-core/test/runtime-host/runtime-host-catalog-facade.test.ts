// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import { RuntimeHostCatalogFacade } from "../../src/runtime-host/runtime-host-catalog-facade.js";
import type { RuntimeSessionAccess, RuntimeSessionCatalog } from "../../src/runtime-host/session-services.js";

function access(overrides: Partial<RuntimeSessionAccess> = {}): RuntimeSessionAccess {
	return { readHistory: true, resume: true, rename: true, delete: true, ...overrides };
}

function createFacade(resolved: RuntimeSessionAccess | undefined) {
	const catalog = {
		deleteSessionArtifacts: vi.fn(async () => {}),
		renameSession: vi.fn(async () => {}),
	} as unknown as RuntimeSessionCatalog;
	const facade = new RuntimeHostCatalogFacade({
		catalog,
		accessResolver: { resolve: async () => resolved },
		sessionLifecycle: {
			findBySessionPath: () => undefined,
			disposeSession: async () => {},
		} as never,
		sessionOperations: { renameSessionById: async () => {} } as never,
	});
	return { facade, catalog };
}

async function failureOf(promise: Promise<unknown>): Promise<{ code: string; message: string; retryable: boolean }> {
	return (await promise.catch((error: unknown) => error)) as {
		code: string;
		message: string;
		retryable: boolean;
	};
}

describe("RuntimeHostCatalogFacade capability errors", () => {
	it("reports an unclaimed session path as not recognized instead of unsupported", async () => {
		const { facade } = createFacade(undefined);

		const error = await failureOf(facade.deleteSession("/sessions/foreign.jsonl"));

		expect(error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
		expect(error.message).not.toContain("does not support");
		expect(error.message).toContain("not recognized");
	});

	it("keeps the capability-denied wording when the owning route forbids delete", async () => {
		const { facade } = createFacade(access({ delete: false }));

		const error = await failureOf(facade.deleteSession("/sessions/known.jsonl"));

		expect(error.message).toContain("does not support delete");
	});

	it("applies the same split to rename", async () => {
		const { facade } = createFacade(undefined);

		const error = await failureOf(facade.renameSession("/sessions/foreign.jsonl", "x"));

		expect(error.message).not.toContain("does not support rename");
		expect(error.message).toContain("not recognized");
	});

	it("deletes artifacts when the owning route grants delete", async () => {
		const { facade, catalog } = createFacade(access());

		await facade.deleteSession("/sessions/known.jsonl");

		expect(catalog.deleteSessionArtifacts).toHaveBeenCalledWith("/sessions/known.jsonl");
	});

	// 回归 BUG-0108 路径 B：成员 runtime 的扩展释放失败不应把用户卡在删不掉的会话上。
	// 释放失败本身已由 sessionLifecycle 记为 session.dispose 生命周期观测。
	it("still deletes artifacts when the live session fails to dispose", async () => {
		const catalog = {
			deleteSessionArtifacts: vi.fn(async () => {}),
			renameSession: vi.fn(async () => {}),
		} as unknown as RuntimeSessionCatalog;
		const facade = new RuntimeHostCatalogFacade({
			catalog,
			accessResolver: { resolve: async () => access() },
			sessionLifecycle: {
				findBySessionPath: () => ({ sessionId: "runtime-1" }),
				disposeSession: async () => {
					throw new AggregateError(
						[new Error("Failed to dispose one or more session extensions: subagent")],
						"dispose failed",
					);
				},
			} as never,
			sessionOperations: { renameSessionById: async () => {} } as never,
		});

		await expect(facade.deleteSession("/sessions/known.jsonl")).resolves.toBeUndefined();

		expect(catalog.deleteSessionArtifacts).toHaveBeenCalledWith("/sessions/known.jsonl");
	});
});
