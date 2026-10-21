// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { Buffer } from "node:buffer";
import type { WeKnoraMessage } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { beforeAll, describe, expect, it } from "vitest";
import { exportFileName, exportFileNames, serializeExport, toMarkdown, toTxt } from "./weknoraExport";

/**
 * T05 新增的导出格式辅助纯函数（AC-3 / AC-5 / AC-7）：文件名（含扩展名、净化、批内去重）
 * 与「格式 → 载荷（内容 + 编码）」分发。docx 产物本身合法性由 `weknoraExport.test.ts` 覆盖，
 * 这里只钉住「格式选择 → 正确序列化器 + 正确编码」的接线。
 */

function message(role: "user" | "assistant", content: string, id = `${role}-${content}`): WeKnoraMessage {
	return { id, role, content };
}

const MESSAGES: readonly WeKnoraMessage[] = [message("user", "你好"), message("assistant", "在的")];

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("导出格式辅助（T05 / AC-3 / AC-5 / AC-7）", () => {
	it("exportFileName：净化基名 + 按格式追加扩展名", () => {
		expect(exportFileName("会话 s1", "txt")).toBe("会话 s1.txt");
		expect(exportFileName("会话 s1", "md")).toBe("会话 s1.md");
		expect(exportFileName("会话 s1", "docx")).toBe("会话 s1.docx");
		// 非法字符换 `_`（复用 safeFileName 的净化）。
		expect(exportFileName("a/b:c*?", "txt")).toBe("a_b_c__.txt");
	});

	it("exportFileName：空标题回退「未命名会话」", () => {
		expect(exportFileName("   ", "md")).toBe("未命名会话.md");
	});

	it("exportFileNames：批内重名加序号（大小写不敏感）后统一追加扩展名", () => {
		expect(exportFileNames(["会话", "会话", "会话"], "txt")).toEqual(["会话.txt", "会话 (2).txt", "会话 (3).txt"]);
		// 大小写不敏感：Windows / macOS 文件系统不区分大小写，避免写盘互相覆盖。
		expect(exportFileNames(["Report", "report"], "md")).toEqual(["Report.md", "report (2).md"]);
	});

	it("serializeExport：txt / md 走 utf8，内容与序列化器一致", async () => {
		const txt = await serializeExport(MESSAGES, "txt");
		expect(txt).toEqual({ content: toTxt(MESSAGES), encoding: "utf8" });

		const md = await serializeExport(MESSAGES, "md");
		expect(md).toEqual({ content: toMarkdown(MESSAGES), encoding: "utf8" });
	});

	it("serializeExport：docx 走 base64，产物是合法 ZIP（PK 魔数）", async () => {
		const docx = await serializeExport(MESSAGES, "docx");
		expect(docx.encoding).toBe("base64");
		expect(Buffer.from(docx.content, "base64").subarray(0, 2).toString()).toBe("PK");
	});
});
