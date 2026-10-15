// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTRACT_TEXT_FROM_IMAGE_TOOL_DESCRIPTION } from "../../src/coding/tools/extract-text-from-image/description.js";
import { EXTRACT_TEXT_FROM_PDF_TOOL_DESCRIPTION } from "../../src/coding/tools/extract-text-from-pdf/description.js";
import { HTML_TO_PDF_TOOL_DESCRIPTION } from "../../src/coding/tools/html-to-pdf/description.js";

/** 遗留品牌词：品牌档位下用户与模型都不应再读到它。 */
const LEGACY_BRAND = /\bVetta\b/;

describe("Desktop 依赖的工具文案按能力描述，不带遗留品牌名", () => {
	it.each([
		["html_to_pdf", HTML_TO_PDF_TOOL_DESCRIPTION],
		["extract_text_from_pdf", EXTRACT_TEXT_FROM_PDF_TOOL_DESCRIPTION],
		["extract_text_from_image", EXTRACT_TEXT_FROM_IMAGE_TOOL_DESCRIPTION],
	] as const)("%s 描述不含遗留品牌名且保留冻结的定位标识", (_tool, description) => {
		expect(description).not.toMatch(LEGACY_BRAND);
		expect(description).toContain("VETTA_DESKTOP_EXE");
	});

	// 失败原因同样进用户视野；直接守住事实源，避免新增分支时把遗留品牌名写回来。
	it("Desktop 命令相关实现不含遗留品牌名", () => {
		for (const file of [
			"../../src/coding/shared/ocr-document.ts",
			"../../src/coding/tools/html-to-pdf/html-to-pdf-tool.ts",
			"../../src/coding/tools/extract-text-from-pdf/extract-text-from-pdf-tool.ts",
			"../../src/coding/tools/extract-text-from-image/extract-text-from-image-tool.ts",
		]) {
			expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).not.toMatch(LEGACY_BRAND);
		}
	});
});
