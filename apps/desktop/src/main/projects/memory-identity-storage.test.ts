// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveMemoryIdentity } from "./memory-identity.js";
import {
	loadMemoryIdentityRegistry,
	MEMORY_IDENTITY_REGISTRY_FILE,
	MEMORY_IDENTITY_REGISTRY_VERSION,
	MemoryIdentityStorageError,
	roundTripMemoryIdentityRegistry,
	saveMemoryIdentityRegistry,
} from "./memory-identity-storage.js";

describe("记忆身份注册表存储", () => {
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), "memory-identity-storage-"));
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
	});

	it("缺失文件→空注册表；保存→读回等价（重启合同）", () => {
		const filePath = join(workDir, MEMORY_IDENTITY_REGISTRY_FILE);
		const empty = loadMemoryIdentityRegistry({ filePath, principal: { principalId: "p-1" } });
		expect(empty.projects).toEqual([]);

		const first = resolveMemoryIdentity({ registry: empty, cwd: "D:/a" });
		const second = resolveMemoryIdentity({ registry: first.registry, cwd: "D:/b" });
		saveMemoryIdentityRegistry({ filePath, registry: second.registry });

		const reloaded = loadMemoryIdentityRegistry({ filePath, principal: { principalId: "p-1" } });
		expect(reloaded.projects).toHaveLength(2);
		expect(roundTripMemoryIdentityRegistry(reloaded).version).toBe(MEMORY_IDENTITY_REGISTRY_VERSION);
	});

	it("损坏文件显式报错，不静默重建", () => {
		const filePath = join(workDir, MEMORY_IDENTITY_REGISTRY_FILE);
		writeFileSync(filePath, "not json at all", "utf8");
		expect(() => loadMemoryIdentityRegistry({ filePath, principal: { principalId: "p-1" } })).toThrowError(/损坏/);
	});

	it("版本不兼容显式报错", () => {
		const filePath = join(workDir, MEMORY_IDENTITY_REGISTRY_FILE);
		writeFileSync(filePath, JSON.stringify({ version: 99, principal: { principalId: "p-1" } }), "utf8");
		expect(() => loadMemoryIdentityRegistry({ filePath, principal: { principalId: "p-1" } })).toThrowError(
			MemoryIdentityStorageError,
		);
	});
});
