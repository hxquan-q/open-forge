// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectToolPolicy, readProjectToolPolicy } from "../../src/projects/project-tool-policy.js";
import { VettaProjectManifestError } from "../../src/projects/shared-project-conventions.js";
import { resolveCapabilityNameConflict, resolveToolCatalogPolicy } from "../../src/tool-policy/catalog-policy.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("resolveToolCatalogPolicy", () => {
	it("显式选择优先于 Profile 默认", () => {
		const resolved = resolveToolCatalogPolicy({
			profileDefaultToolNames: ["read", "write"],
			explicitToolNames: ["read", "bash"],
			projectDeniedToolNames: undefined,
		});
		expect(resolved.source).toBe("explicit");
		expect(resolved.toolNames).toEqual(["read", "bash"]);
	});

	it("无显式选择时用 Profile 默认，并去重", () => {
		const resolved = resolveToolCatalogPolicy({
			profileDefaultToolNames: ["read", "read", "write"],
			explicitToolNames: undefined,
			projectDeniedToolNames: undefined,
		});
		expect(resolved.source).toBe("profile");
		expect(resolved.toolNames).toEqual(["read", "write"]);
	});

	it("项目策略 deny 只能收紧：从任何来源剔除，显式选择也不例外", () => {
		const fromProfile = resolveToolCatalogPolicy({
			profileDefaultToolNames: ["read", "write", "bash"],
			explicitToolNames: undefined,
			projectDeniedToolNames: ["bash"],
		});
		expect(fromProfile.toolNames).toEqual(["read", "write"]);
		const fromExplicit = resolveToolCatalogPolicy({
			profileDefaultToolNames: null,
			explicitToolNames: ["bash", "read"],
			projectDeniedToolNames: ["bash"],
		});
		expect(fromExplicit.source).toBe("explicit");
		expect(fromExplicit.toolNames).toEqual(["read"]);
	});

	it("Profile 默认被项目策略清空时得到空 Catalog（最小集合）", () => {
		const resolved = resolveToolCatalogPolicy({
			profileDefaultToolNames: ["bash"],
			explicitToolNames: undefined,
			projectDeniedToolNames: ["bash"],
		});
		expect(resolved.toolNames).toEqual([]);
	});

	it("无默认无选择时保持 unset；仅有项目 deny 时不构成放宽也不虚构全集", () => {
		expect(
			resolveToolCatalogPolicy({
				profileDefaultToolNames: null,
				explicitToolNames: undefined,
				projectDeniedToolNames: undefined,
			}),
		).toEqual({ toolNames: undefined, source: "unset" });
		expect(
			resolveToolCatalogPolicy({
				profileDefaultToolNames: null,
				explicitToolNames: undefined,
				projectDeniedToolNames: ["x"],
			}),
		).toEqual({ toolNames: undefined, source: "project-deny-only" });
	});
});

describe("resolveCapabilityNameConflict", () => {
	it("同名能力先到先得，后注册被拒且不静默覆盖", () => {
		const existing = { name: "mcp__fs__list", version: 1 };
		const incoming = { name: "mcp__fs__list", version: 2 };
		const resolved = resolveCapabilityNameConflict(existing, incoming);
		expect(resolved.winner).toBe(existing);
		expect(resolved.replaced).toBe(true);
		const fresh = resolveCapabilityNameConflict(undefined, incoming);
		expect(fresh.winner).toBe(incoming);
		expect(fresh.replaced).toBe(false);
	});
});

describe("project tool policy (policies/tools.json)", () => {
	it("合法策略收窄；缺文件返回 undefined", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-policy-"));
		roots.push(root);
		expect(await loadProjectToolPolicy(root)).toBeUndefined();
		await mkdir(join(root, ".vetta", "policies"), { recursive: true });
		await writeFile(
			join(root, ".vetta", "policies", "tools.json"),
			JSON.stringify({ schemaVersion: 1, denyTools: ["bash", "mcp__net__fetch"] }),
			"utf8",
		);
		const policy = await loadProjectToolPolicy(root);
		expect(policy?.denyTools).toEqual(["bash", "mcp__net__fetch"]);
	});

	it("结构损坏与未知字段 fail closed", () => {
		expect(() => readProjectToolPolicy({ schemaVersion: 2, denyTools: [] })).toThrow(VettaProjectManifestError);
		expect(() => readProjectToolPolicy({ schemaVersion: 1, denyTools: [], extra: true })).toThrow(
			VettaProjectManifestError,
		);
		expect(() => readProjectToolPolicy("nope")).toThrow(VettaProjectManifestError);
	});
});
