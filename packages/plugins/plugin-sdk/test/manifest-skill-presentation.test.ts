// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/manifest.js";

const baseManifest = {
	id: "skill-presentation-test",
	name: "Skill presentation test",
	version: "1.0.0",
	pluginApiVersion: "^2.0.0",
	entry: "dist/index.js",
	moduleFederation: { remoteName: "skill_presentation_test", expose: "./plugin" },
};

describe("plugin manifest skill presentation", () => {
	it("keeps old manifests compatible", () => {
		expect(parsePluginManifest(baseManifest).agent).toBeUndefined();
	});

	it("normalizes provider defaults and per-skill display overrides", () => {
		const manifest = parsePluginManifest({
			...baseManifest,
			agent: {
				skillPaths: ["agent/skills"],
				skillPresentation: {
					defaultVisibility: "hidden",
					workspaceMode: "coding",
					surfaces: { abilityCatalog: "visible", pluginDetail: "visible" },
					skills: {
						" vetta-ui-design ": {
							defaultVisibility: "visible",
							workspaceMode: "work",
							displayName: " %plugin.name% ",
							displayDescription: " Design UI ",
						},
					},
				},
			},
		});

		expect(manifest.agent?.skillPresentation).toEqual({
			defaultVisibility: "hidden",
			workspaceMode: "coding",
			surfaces: { abilityCatalog: "visible", pluginDetail: "visible" },
			skills: {
				"vetta-ui-design": {
					defaultVisibility: "visible",
					workspaceMode: "work",
					surfaces: undefined,
					displayName: "%plugin.name%",
					displayDescription: "Design UI",
				},
			},
		});
	});

	it("rejects unknown surfaces, invalid workspace modes, and blank display text", () => {
		expect(() =>
			parsePluginManifest({
				...baseManifest,
				agent: { skillPresentation: { surfaces: { unknown: "hidden" } } },
			}),
		).toThrow("skillPresentation");
		expect(() =>
			parsePluginManifest({
				...baseManifest,
				agent: { skillPresentation: { workspaceMode: "both" } },
			}),
		).toThrow("skillPresentation");
		expect(() =>
			parsePluginManifest({
				...baseManifest,
				agent: { skillPresentation: { skills: { design: { displayName: "   " } } } },
			}),
		).toThrow("skillPresentation");
	});
});
