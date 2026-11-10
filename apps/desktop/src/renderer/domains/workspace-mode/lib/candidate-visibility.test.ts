// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { candidateVisibleInWorkspaceMode } from "./candidate-visibility";

describe("candidateVisibleInWorkspaceMode", () => {
	it("keeps untagged product candidates visible in both modes", () => {
		expect(candidateVisibleInWorkspaceMode(undefined, "work")).toBe(true);
		expect(candidateVisibleInWorkspaceMode(undefined, "coding")).toBe(true);
	});

	it("shows explicitly tagged candidates only in their assigned mode", () => {
		expect(candidateVisibleInWorkspaceMode("work", "work")).toBe(true);
		expect(candidateVisibleInWorkspaceMode("work", "coding")).toBe(false);
		expect(candidateVisibleInWorkspaceMode("coding", "coding")).toBe(true);
		expect(candidateVisibleInWorkspaceMode("coding", "work")).toBe(false);
	});
});
