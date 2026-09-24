// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { PLUGIN_PERMISSION_LABEL_KEYS, PLUGIN_PERMISSION_PRESENTATIONS } from "./plugin-permission-labels";

describe("Artifact Renderer permission presentation", () => {
	it("keeps its label, explanation, and risk classification in the host-owned catalog", () => {
		expect(PLUGIN_PERMISSION_LABEL_KEYS["ui.slot.artifact-renderer"]).toBe("permission.uiSlotArtifactRenderer");
		expect(PLUGIN_PERMISSION_PRESENTATIONS["ui.slot.artifact-renderer"]).toEqual({
			descriptionKey: "permission.description.uiSlotArtifactRenderer",
			group: "interface",
			risk: "low",
			visual: "interface",
		});
	});
});
