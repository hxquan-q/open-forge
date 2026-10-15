// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { previewPackageForTest } from "./automation-package-service.js";

describe("automation package import gate", () => {
	it("preview marks same-id packages incompatible without mutating storage", () => {
		const preview = previewPackageForTest(
			{
				schemaVersion: 1,
				id: "com.example.demo",
				version: "1.0.0",
				name: "Demo",
				requires: { taskSchemaVersion: 1 },
				task: { name: "Demo", prompt: "hi", cron: "0 9 * * *" },
			},
			["com.example.demo"],
		);
		expect(preview.compatible).toBe(false);
		expect(preview.reasons.some((reason) => /already exists/i.test(reason))).toBe(true);
	});

	it("preview passes for a fresh compatible package", () => {
		const preview = previewPackageForTest({
			schemaVersion: 1,
			id: "com.example.fresh",
			version: "1.0.0",
			name: "Fresh",
			requires: { taskSchemaVersion: 1, capabilities: ["scheduler.cron"] },
			task: { name: "Fresh", prompt: "hi", cron: "0 9 * * *" },
		});
		expect(preview.compatible).toBe(true);
		expect(preview.reasons).toEqual([]);
	});
});
