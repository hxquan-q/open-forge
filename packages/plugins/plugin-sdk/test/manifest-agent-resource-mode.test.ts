// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/manifest.js";

const baseManifest = {
	id: "agent-resource-mode-test",
	name: "Agent resource mode test",
	version: "1.0.0",
	pluginApiVersion: "^2.11.0",
	entry: "dist/index.js",
	moduleFederation: { remoteName: "agent_resource_mode_test", expose: "./plugin" },
};

function withAgent(mode?: string) {
	return {
		...baseManifest,
		agent: {
			agents: [
				{
					id: "lead",
					name: "Lead",
					systemPrompt: "You lead.",
					...(mode ? { mode } : {}),
				},
			],
		},
	};
}

function withTeam(mode?: string) {
	return {
		...baseManifest,
		agent: {
			agents: [{ id: "lead", name: "Lead", systemPrompt: "You lead." }],
			teams: [
				{
					id: "squad",
					name: "Squad",
					members: [{ agent: "lead", responsibility: "Runs the loop." }],
					workflow: "Run the loop.",
					...(mode ? { mode } : {}),
				},
			],
		},
	};
}

// 档位归属（agents[].mode / teams[].mode）是可见性过滤声明：合法值 work / coding，
// 缺省两档可见；未知值 fail-closed（清单校验拒绝，而不是静默忽略）。
describe("plugin manifest agent resource mode", () => {
	it("accepts work and coding on agents and teams", () => {
		expect(parsePluginManifest(withAgent("work")).agent?.agents?.[0]?.mode).toBe("work");
		expect(parsePluginManifest(withAgent("coding")).agent?.agents?.[0]?.mode).toBe("coding");
		expect(parsePluginManifest(withTeam("coding")).agent?.teams?.[0]?.mode).toBe("coding");
	});

	it("keeps the field absent when it is not declared (legacy manifests stay valid)", () => {
		expect(parsePluginManifest(withAgent()).agent?.agents?.[0]?.mode).toBeUndefined();
		expect(parsePluginManifest(withTeam()).agent?.teams?.[0]?.mode).toBeUndefined();
	});

	it("rejects unknown mode values instead of silently ignoring them", () => {
		expect(() => parsePluginManifest(withAgent("dev"))).toThrow();
		expect(() => parsePluginManifest(withTeam("all"))).toThrow();
	});
});
