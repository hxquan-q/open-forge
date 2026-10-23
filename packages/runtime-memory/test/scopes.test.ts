// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "../src/fixtures.js";
import { isScopeAllowed, MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "../src/index.js";

describe("作用域授权合同", () => {
	it("逐字段匹配的作用域放行", () => {
		expect(isScopeAllowed(FIXTURE_USER_SCOPE, [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE])).toBe(true);
	});

	it("不同 principal / projectId / workspaceView 拒绝", () => {
		const foreign = {
			name: "user" as const,
			identity: { principalId: "principal-other" },
		};
		expect(isScopeAllowed(foreign, [FIXTURE_USER_SCOPE])).toBe(false);

		const otherProject = {
			name: "project" as const,
			identity: { principalId: "principal-fixture-1", projectId: "project-fixture-b" },
		};
		expect(isScopeAllowed(otherProject, [FIXTURE_PROJECT_SCOPE])).toBe(false);

		const otherView = {
			name: "project" as const,
			identity: { principalId: "principal-fixture-1", projectId: "project-fixture-a", workspaceViewId: "view-2" },
		};
		expect(isScopeAllowed(otherView, [FIXTURE_PROJECT_SCOPE])).toBe(false);
	});

	it("跨 scope（user 对 project）拒绝", () => {
		expect(isScopeAllowed(FIXTURE_USER_SCOPE, [FIXTURE_PROJECT_SCOPE])).toBe(false);
	});

	it("visibility 不一致拒绝（agent-private 与 user-visible 分离）", () => {
		const privateScope = { ...FIXTURE_PROJECT_SCOPE, visibility: "agent-private" as const };
		expect(isScopeAllowed(privateScope, [FIXTURE_PROJECT_SCOPE])).toBe(false);
	});

	it("稳定错误码可用于程序分支", () => {
		expect(MEMORY_CONTRACT_ERROR_CODES.SCOPE_NOT_ALLOWED).toBe("SCOPE_NOT_ALLOWED");
		expect(new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.SCOPE_NOT_ALLOWED, "x").name).toBe(
			"MemoryContractError",
		);
	});
});
