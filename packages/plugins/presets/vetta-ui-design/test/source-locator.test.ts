// Copyright The Open Forge contributors.
/**
 * `data-vetd-source` 跨代解析（TASK-0315）：v2 file:line:column、v1 file:line、
 * 畸形输入全部不抛。所有消费方（vetd_notes、备注锚、后续 AST 指纹）都靠这层兼容。
 */
import { describe, expect, it } from "vitest";
import { parseSourceLocator } from "../src/shared/source-locator";

describe("parseSourceLocator", () => {
	it("v2 值解析出文件、行、列（列 1-based）", () => {
		expect(parseSourceLocator("frames/login.tsx:42:9")).toEqual({
			file: "frames/login.tsx",
			line: 42,
			column: 9,
		});
	});

	it("v1 值（旧引擎实例/历史快照）解析出列 null", () => {
		expect(parseSourceLocator("frames/login.tsx:42")).toEqual({
			file: "frames/login.tsx",
			line: 42,
			column: null,
		});
	});

	it("子目录路径与多段数字都归位到 file/line/column", () => {
		expect(parseSourceLocator("components/nav/Link.tsx:3:12")).toEqual({
			file: "components/nav/Link.tsx",
			line: 3,
			column: 12,
		});
	});

	it.each([
		["空值", null],
		["空串", ""],
		["undefined", undefined],
		["没有行号", "frames/login.tsx"],
		["行号非数字", "frames/login.tsx:abc"],
		["行号零", "frames/login.tsx:0"],
		["列号零", "frames/login.tsx:42:0"],
		["负列", "frames/login.tsx:42:-3"],
		["三段以上", "frames/login.tsx:42:9:7"],
	])("%s → null 不抛", (_name, value) => {
		expect(parseSourceLocator(value as string | null | undefined)).toBeNull();
	});
});
