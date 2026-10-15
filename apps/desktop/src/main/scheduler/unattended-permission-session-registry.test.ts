// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it } from "vitest";
import {
	bindUnattendedPermissionTiers,
	clearUnattendedPermissionTierForTests,
	getUnattendedPermissionTiersForSession,
	unbindUnattendedPermissionTiers,
} from "./unattended-permission-session-registry.js";

describe("unattended permission session registry", () => {
	beforeEach(() => {
		clearUnattendedPermissionTierForTests();
	});

	it("binds only granted tiers and clears on unbind", () => {
		bindUnattendedPermissionTiers("s1", {
			allowWorkspaceWrite: true,
			allowSystemTools: false,
		});
		expect(getUnattendedPermissionTiersForSession("s1")).toEqual({ allowWorkspaceWrite: true });
		unbindUnattendedPermissionTiers("s1");
		expect(getUnattendedPermissionTiersForSession("s1")).toBeUndefined();
	});

	it("ignores empty or all-false tiers to keep default approval path", () => {
		bindUnattendedPermissionTiers("s2", {});
		expect(getUnattendedPermissionTiersForSession("s2")).toBeUndefined();
		bindUnattendedPermissionTiers("s2", { allowCommonCommands: false });
		expect(getUnattendedPermissionTiersForSession("s2")).toBeUndefined();
	});
});
