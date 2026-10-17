// Copyright The Open Forge contributors.
/**
 * 源码定位 v2 的可单测层（TASK-0315）：属性值构造（file:line:column、列 1-based）
 * 与引擎模板注册。babel 访问器本体在真实 dev serve 里跑（@vitejs/plugin-react），
 * 端到端归引擎实机验收；这里锁住值格式与文件落位，防回退到仅行号。
 */
import { describe, expect, it } from "vitest";
import { ENGINE_FILES } from "../src/engine/engine-files";

const tagger = await import("../engine/plugins/source-tagger.mjs");

describe("sourceAttrValue", () => {
	it("拼出 file:line:column，列 1-based 与编辑器一致", () => {
		expect(tagger.sourceAttrValue("frames/login.tsx", { start: { line: 42, column: 8 } })).toBe(
			"frames/login.tsx:42:9",
		);
	});

	it("行 1 列 0 起点也归一化", () => {
		expect(tagger.sourceAttrValue("frames/a.tsx", { start: { line: 1, column: 0 } })).toBe("frames/a.tsx:1:1");
	});
});

describe("createSourceTagger", () => {
	it("工厂返回挂名为 vetd-source-attr 的 babel 插件（vite.config 引用形态）", () => {
		const plugin = tagger.createSourceTagger("C:/w/x.vetd")({ types: {} });
		expect(plugin.name).toBe("vetd-source-attr");
		expect(plugin.visitor).toHaveProperty("JSXOpeningElement");
	});
});

describe("ENGINE_FILES 注册", () => {
	it("tagger 与 source-payload 进模板清单——漏注册会让物化后的 vite.config import 悬空", () => {
		expect(ENGINE_FILES["plugins/source-tagger.mjs"]).toContain("sourceAttrValue");
		expect(ENGINE_FILES["src/source-payload.ts"]).toContain("styleSummaryFor");
		// vite.config 引用的是抽出后的模块，且不再内联仅行号的旧实现。
		expect(ENGINE_FILES["vite.config.mjs"]).toContain("createSourceTagger");
		expect(ENGINE_FILES["vite.config.mjs"]).not.toMatch(/loc\.start\.line`\)/);
	});
});
