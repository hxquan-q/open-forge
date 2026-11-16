// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	DELEGATED_MEMBER_TYPE_PREFIX,
	delegatedMemberTypeId,
	parseDelegatedMembers,
} from "../../src/composition/contracts/delegated-members.js";
import {
	createDelegatedMemberSubagentType,
	createSessionDelegatedMemberTypeRegistry,
} from "../../src/composition/subagent/delegated-members.js";
import { createDefaultCodingAgentSubagentTypeRegistry } from "../../src/composition/subagent/profiles.js";

const member = {
	id: "agent-1",
	name: "Eform Developer",
	description: "AIMES CustomDev implementation within the verified contract",
	systemPrompt: "You are the eform developer.",
	lifecycle: "resident" as const,
	instructions: "Follow the studio operating contract.",
	skillNames: ["eform-implement", "eform-verify"],
};

describe("delegated member type assembly", () => {
	it("wraps the member persona with leaf-worker discipline and team brief", () => {
		const type = createDelegatedMemberSubagentType(member);
		expect(type.id).toBe(`${DELEGATED_MEMBER_TYPE_PREFIX}agent-1`);
		expect(type.label).toBe("Eform Developer");
		expect(type.displayTitle).toBe("Eform Developer");
		const prompt = type.profile.systemPromptAddon;
		expect(prompt).toContain("You are Eform Developer, a specialist crew member");
		expect(prompt).toContain("You are the eform developer.");
		expect(prompt).toContain("## Team brief");
		expect(prompt).toContain("Follow the studio operating contract.");
		expect(prompt).toContain("never spawn agents");
	});

	it("narrows the skill surface to the member allow-list", () => {
		const type = createDelegatedMemberSubagentType(member);
		expect(type.profile.skillPolicy).toEqual({ mode: "allow", names: ["eform-implement", "eform-verify"] });
	});

	it("inherits the parent skill surface when the member declares no skills", () => {
		const type = createDelegatedMemberSubagentType({ ...member, skillNames: undefined });
		expect(type.profile.skillPolicy).toEqual({ mode: "inherit" });
	});

	it("carries the lifecycle on the profile for the resident spawn guard", () => {
		expect(createDelegatedMemberSubagentType(member).profile.delegation).toEqual({ lifecycle: "resident" });
		expect(createDelegatedMemberSubagentType({ ...member, lifecycle: "oneshot" }).profile.delegation).toEqual({
			lifecycle: "oneshot",
		});
	});

	it("keeps general-shaped inheritance for tools, MCP, context, todo and workspace", () => {
		const type = createDelegatedMemberSubagentType(member);
		expect(type.profile.toolPolicy).toEqual({ mode: "inherit" });
		expect(type.profile.mcpPolicy).toEqual({ mode: "inherit" });
		expect(type.profile.contextPolicy).toEqual({ mode: "full" });
		expect(type.profile.todoPolicy).toEqual({ mode: "enabled" });
		expect(type.profile.workspacePolicy).toEqual({ mode: "shared" });
	});
});

describe("session delegated member registry", () => {
	it("copies the base types into a fresh registry and overlays members", () => {
		const base = createDefaultCodingAgentSubagentTypeRegistry();
		const registry = createSessionDelegatedMemberTypeRegistry(base, [member]);
		expect(registry.ids()).toContain("general");
		expect(registry.ids()).toContain("explorer");
		expect(registry.ids()).toContain("workflow");
		expect(registry.ids()).toContain(delegatedMemberTypeId("agent-1"));
		// 基础注册表不得被会话成员污染：组合级对象跨会话共享。
		expect(base.ids()).not.toContain(delegatedMemberTypeId("agent-1"));
	});

	it("upserts so a rebuilt roster replaces the member definition", () => {
		const registry = createSessionDelegatedMemberTypeRegistry(createDefaultCodingAgentSubagentTypeRegistry(), [
			member,
		]);
		const next = createSessionDelegatedMemberTypeRegistry(registry, [
			{ ...member, name: "Renamed", lifecycle: "oneshot" },
		]);
		expect(next.get(delegatedMemberTypeId("agent-1"))?.label).toBe("Renamed");
		expect(next.get(delegatedMemberTypeId("agent-1"))?.profile.delegation).toEqual({ lifecycle: "oneshot" });
	});
});

describe("parseDelegatedMembers boundary validation", () => {
	it("accepts a valid roster and normalizes absent optionals", () => {
		const parsed = parseDelegatedMembers([
			{ id: "a", name: "A", description: "domain", systemPrompt: "persona", lifecycle: "oneshot" },
		]);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual({
			id: "a",
			name: "A",
			description: "domain",
			systemPrompt: "persona",
			lifecycle: "oneshot",
		});
	});

	it("rejects unknown lifecycle values instead of silently downgrading", () => {
		expect(() =>
			parseDelegatedMembers([{ id: "a", name: "A", description: "d", systemPrompt: "p", lifecycle: "durable" }]),
		).toThrow('lifecycle must be "resident" or "oneshot"');
	});

	it("rejects duplicate ids and empty personas", () => {
		const base = { name: "A", description: "d", lifecycle: "resident" as const };
		expect(() =>
			parseDelegatedMembers([
				{ id: "a", ...base, systemPrompt: "p" },
				{ id: "a", ...base, systemPrompt: "q" },
			]),
		).toThrow("Duplicate delegated member id: a");
		expect(() => parseDelegatedMembers([{ id: "a", ...base, systemPrompt: "  " }])).toThrow(
			"systemPrompt must be a non-empty string",
		);
	});

	it("caps the roster size", () => {
		const roster = Array.from({ length: 17 }, (_, index) => ({
			id: `m${index}`,
			name: "M",
			description: "d",
			systemPrompt: "p",
			lifecycle: "oneshot" as const,
		}));
		expect(() => parseDelegatedMembers(roster)).toThrow("exceeds 16 entries");
		expect(parseDelegatedMembers([])).toEqual([]);
		expect(parseDelegatedMembers(undefined)).toEqual([]);
	});
});
