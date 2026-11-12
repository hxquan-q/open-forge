// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { readComputerUseInput } from "./computer-use-contract.js";

describe("computer use structured boundary", () => {
	it("accepts global desktop observation and input actions without arbitrary code", () => {
		expect(readComputerUseInput({ action: "observe" })).toEqual({ action: "observe" });
		expect(readComputerUseInput({ action: "click", revision: "screen-1", x: 10, y: 20 }).action).toBe("click");
		expect(readComputerUseInput({ action: "type", text: "hello" }).action).toBe("type");
	});
	it.each([
		{ action: "run", code: "print(1)" },
		{ action: "observe", code: "print(1)" },
		{ action: "click", x: 1, y: 2 },
		{ action: "type", text: "x", window: 123 },
		{ action: "scroll", x: 1, y: 2, amount: "down" },
	])("rejects malformed or unbounded operations %j", (input) => {
		expect(() => readComputerUseInput(input)).toThrow("Invalid computer_use input");
	});
});
