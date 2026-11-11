// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { readComputerUseInput } from "./computer-use-contract.js";

describe("computer use structured boundary", () => {
	it("accepts observation and explicit UIA actions without arbitrary code", () => {
		expect(readComputerUseInput({ action: "observe", screenshot: true })).toEqual({
			action: "observe",
			screenshot: true,
		});
		expect(readComputerUseInput({ action: "fill", element: "ref-1", text: "hello" }).action).toBe("fill");
	});
	it.each([
		{ action: "run", code: "print(1)" },
		{ action: "observe", code: "print(1)" },
		{ action: "click", x: 1, y: 2 },
		{ action: "fill", element: "ref-1", text: "x", window: 123 },
		{ action: "scroll", element: "ref-1", amount: 21 },
	])("rejects unscoped or unbounded operations %j", (input) => {
		expect(() => readComputerUseInput(input)).toThrow("Invalid computer_use input");
	});
});
