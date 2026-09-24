import { describe, expect, it } from "vitest";
import { isPackagedJsonResource, minifyPackagedJsonResource } from "../src/pack-resource-minify.js";

describe("packaged plugin JSON resources", () => {
	it("only treats JSON-shaped resources as minifiable", () => {
		expect(isPackagedJsonResource("plugin.json")).toBe(true);
		expect(isPackagedJsonResource("locales/zh.json")).toBe(true);
		expect(isPackagedJsonResource("snippets/demo.code-snippets")).toBe(true);
		expect(isPackagedJsonResource("dist/remoteEntry.js")).toBe(false);
		expect(isPackagedJsonResource("assets/icon.svg")).toBe(false);
	});

	it("removes whitespace while keeping the parsed value identical", () => {
		const source = Buffer.from(
			`{\n  "id": "demo",\n  "name": "演示",\n  "nested": { "list": [1, 2, 3] }\n}\n`,
			"utf-8",
		);
		const minified = minifyPackagedJsonResource("plugin.json", source);

		expect(minified.toString("utf-8")).toBe('{"id":"demo","name":"演示","nested":{"list":[1,2,3]}}');
		expect(JSON.parse(minified.toString("utf-8"))).toEqual(JSON.parse(source.toString("utf-8")));
		expect(minified.length).toBeLessThan(source.length);
	});

	it("keeps non-JSON payloads byte-identical", () => {
		const script = Buffer.from("export function activate() {}\n", "utf-8");
		expect(minifyPackagedJsonResource("dist/remoteEntry.js", script)).toBe(script);
	});

	it("keeps bytes untouched when the resource is not strict JSON or already smaller", () => {
		const withComment = Buffer.from('{\n  // 注释\n  "id": "demo"\n}\n', "utf-8");
		expect(minifyPackagedJsonResource("plugin.json", withComment)).toBe(withComment);

		const alreadyMinified = Buffer.from('{"id":"demo"}', "utf-8");
		expect(minifyPackagedJsonResource("plugin.json", alreadyMinified)).toBe(alreadyMinified);
	});
});
