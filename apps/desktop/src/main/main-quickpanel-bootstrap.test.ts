// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "main.ts"), "utf8");

describe("main 进程快捷面板装配", () => {
	it("不再预创建快捷面板窗口（懒创建），但保留热键武装调用", () => {
		expect(mainSource).not.toContain("createQuickPanelWindow(");
		expect(mainSource).toContain("syncQuickPanelTrigger(");
	});
});
