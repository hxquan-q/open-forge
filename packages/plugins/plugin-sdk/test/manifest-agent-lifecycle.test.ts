// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/manifest.js";

const baseManifest = {
	id: "agent-lifecycle-test",
	name: "Agent lifecycle test",
	version: "1.0.0",
	pluginApiVersion: "^2.13.0",
	entry: "dist/index.js",
	moduleFederation: { remoteName: "agent_lifecycle_test", expose: "./plugin" },
};

function withAgent(lifecycle?: string) {
	return {
		...baseManifest,
		agent: {
			agents: [
				{
					id: "worker",
					name: "Worker",
					systemPrompt: "You work.",
					...(lifecycle ? { lifecycle } : {}),
				},
			],
		},
	};
}

// 委任生命周期（agents[].lifecycle）：声明即 worker 型（resident 常驻 / oneshot 一次性），
// 缺省 = 主控/接管型（现状行为）；未知值 fail-closed（清单校验拒绝，而不是静默忽略）。
describe("plugin manifest agent lifecycle", () => {
	it("accepts resident and oneshot", () => {
		expect(parsePluginManifest(withAgent("resident")).agent?.agents?.[0]?.lifecycle).toBe("resident");
		expect(parsePluginManifest(withAgent("oneshot")).agent?.agents?.[0]?.lifecycle).toBe("oneshot");
	});

	it("keeps the field absent when it is not declared (legacy manifests stay valid)", () => {
		expect(parsePluginManifest(withAgent()).agent?.agents?.[0]?.lifecycle).toBeUndefined();
	});

	it("rejects unknown lifecycle values instead of silently ignoring them", () => {
		expect(() => parsePluginManifest(withAgent("durable"))).toThrow();
		expect(() => parsePluginManifest(withAgent("always"))).toThrow();
	});
});
