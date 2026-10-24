// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

const grammar = vi.hoisted(() => ({ evaluations: 0 }));
vi.mock("@codemirror/lang-javascript", () => {
	grammar.evaluations += 1;
	return { javascript: () => [] };
});

import { CodePreview } from "../activity/CodePreview";

describe("readonly preview dependencies", () => {
	it("does not evaluate editor grammars when importing the readonly code preview", () => {
		expect(CodePreview).toBeTypeOf("function");
		expect(grammar.evaluations).toBe(0);
	});
});
