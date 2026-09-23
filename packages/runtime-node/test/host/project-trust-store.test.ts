// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import type { NodeProjectTrustStoreIo } from "../../src/host/project-trust-store.js";
import { NodeProjectTrustStore } from "../../src/host/project-trust-store.js";

function memoryIo(initial?: string): NodeProjectTrustStoreIo & { contents(): string | undefined } {
	let stored = initial;
	return {
		read: async () => stored,
		write: async (contents) => {
			stored = contents;
		},
		contents: () => stored,
	};
}

const clock = { current: 1_000, now: () => clock.current };

describe("NodeProjectTrustStore", () => {
	it("空文件/无文件时无任何授权（fail closed）", async () => {
		const store = new NodeProjectTrustStore({ projectRoot: "C:\\work\\project", io: memoryIo(), now: clock.now });
		expect(await store.allows("tool:bash")).toBe(false);
		expect(await store.readGrants()).toEqual([]);
	});

	it("授权后按 capability 放行，grant 携带规范化 projectRoot", async () => {
		const io = memoryIo();
		const store = new NodeProjectTrustStore({ projectRoot: "C:\\Work\\Project", io, now: clock.now });
		await store.grant({ capabilities: ["tool:bash"] });
		expect(await store.allows("tool:bash")).toBe(true);
		expect(await store.allows("tool:write")).toBe(false);
		const grants = await store.readGrants();
		expect(grants[0].scope).toBe("project");
		expect(grants[0].projectRoot).toBe("c:/Work/Project");
	});

	it("撤销立即生效；过期后不再放行", async () => {
		const io = memoryIo();
		const store = new NodeProjectTrustStore({ projectRoot: "/work/project", io, now: clock.now });
		const grant = await store.grant({ capabilities: ["tool:bash"], expiresAt: 2_000 });
		expect(await store.allows("tool:bash")).toBe(true);
		expect(await store.revoke(grant.grantId)).toBe(true);
		expect(await store.allows("tool:bash")).toBe(false);

		const other = await store.grant({ capabilities: ["tool:bash"], expiresAt: 2_000 });
		clock.current = 2_500;
		expect(await store.allows("tool:bash")).toBe(false);
		expect(await store.prune()).toBe(0);
		expect(other.revokedAt).toBeUndefined();
	});

	it("未知 schemaVersion 或损坏 JSON 整体忽略", async () => {
		const badVersion = memoryIo(JSON.stringify({ schemaVersion: 99, grants: [] }));
		expect(
			await new NodeProjectTrustStore({ projectRoot: "/p", io: badVersion, now: clock.now }).readGrants(),
		).toEqual([]);

		const corrupted = memoryIo("{ not json");
		expect(
			await new NodeProjectTrustStore({ projectRoot: "/p", io: corrupted, now: clock.now }).readGrants(),
		).toEqual([]);
	});

	it("deniedCapabilities 胜过 allow（deny-wins）", async () => {
		const io = memoryIo(
			JSON.stringify({
				schemaVersion: 1,
				grants: [
					{
						schemaVersion: 1,
						grantId: "grant-1",
						scope: "project",
						projectRoot: "/p",
						capabilities: ["tool:bash"],
						deniedCapabilities: ["tool:bash"],
						source: "user",
						version: "1",
						issuedAt: 1,
					},
				],
			}),
		);
		const store = new NodeProjectTrustStore({ projectRoot: "/p", io, now: clock.now });
		expect(await store.allows("tool:bash")).toBe(false);
	});
});
