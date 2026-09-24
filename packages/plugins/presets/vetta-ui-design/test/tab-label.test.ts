// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vetta-ui-design activity tab label", () => {
	it("与通用 Canvas tab 文案区分：自身标签是「设计画布」", () => {
		const zh = JSON.parse(readFileSync(join(__dirname, "../locales/zh.json"), "utf8")) as Record<string, string>;
		const en = JSON.parse(readFileSync(join(__dirname, "../locales/en.json"), "utf8")) as Record<string, string>;
		expect(zh["tab.label"]).toBe("设计画布");
		expect(en["tab.label"]).toBe("Design canvas");
		expect(zh["tab.label"]).not.toBe("画布");
		expect(en["tab.label"]).not.toBe("Canvas");
	});
});
