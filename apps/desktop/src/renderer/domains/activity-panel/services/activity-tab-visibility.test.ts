// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import type { ActivityTabDefinition } from "../registry/types";
import {
	defaultHiddenBuiltinTabIds,
	effectiveHiddenActivityTabKeys,
	hideActivityTabKeys,
	revealActivityTabKeys,
	shownBuiltinTabKey,
} from "./activity-tab-visibility";

function def(
	partial: Partial<ActivityTabDefinition> & Pick<ActivityTabDefinition, "id" | "source">,
): ActivityTabDefinition {
	return {
		useMeta: () => ({ label: partial.id }),
		component: () => null,
		...partial,
	};
}

describe("defaultHiddenBuiltinTabIds", () => {
	it("只收集默认不上栏的内置 tab", () => {
		expect(
			defaultHiddenBuiltinTabIds([
				def({ id: "file", source: "builtin" }),
				def({ id: "terminal", source: "builtin", initiallyVisible: false }),
				def({ id: "plugin:x:y", source: "plugin", initiallyVisible: false }),
			]),
		).toEqual(["terminal"]);
	});
});

describe("effectiveHiddenActivityTabKeys", () => {
	const defaults = ["terminal"];

	it("从未写过记录时，默认隐藏的 tab 出现在 hiddenKeys", () => {
		expect(effectiveHiddenActivityTabKeys(undefined, defaults)).toEqual(["terminal"]);
		expect(effectiveHiddenActivityTabKeys([], defaults)).toEqual(["terminal"]);
	});

	it("已有其它 hidden 记录时，仍把未挂出的默认隐藏 tab 补进去", () => {
		expect(effectiveHiddenActivityTabKeys(["todo"], defaults)).toEqual(["todo", "terminal"]);
	});

	it("用户从「+」挂出后不再视为 hidden", () => {
		expect(effectiveHiddenActivityTabKeys([shownBuiltinTabKey("terminal")], defaults)).toEqual([]);
		expect(effectiveHiddenActivityTabKeys(["todo", shownBuiltinTabKey("terminal")], defaults)).toEqual(["todo"]);
	});

	it("默认上栏的 tab 仍按显式 hidden 条目隐藏", () => {
		expect(effectiveHiddenActivityTabKeys(["todo"], [])).toEqual(["todo"]);
	});
});

describe("reveal / hide activity tab keys", () => {
	const defaults = ["terminal"];

	it("挂出默认隐藏 tab 会写下 shown 标记，再次隐藏只撤标记", () => {
		const shown = revealActivityTabKeys(["todo"], "terminal", defaults);
		expect(shown).toEqual(["todo", shownBuiltinTabKey("terminal")]);
		expect(effectiveHiddenActivityTabKeys(shown, defaults)).toEqual(["todo"]);

		const hidden = hideActivityTabKeys(shown, "terminal", defaults);
		expect(hidden).toEqual(["todo"]);
		expect(effectiveHiddenActivityTabKeys(hidden, defaults)).toEqual(["todo", "terminal"]);
	});

	it("默认上栏 tab 的隐藏/恢复仍是加减自身 id", () => {
		const hidden = hideActivityTabKeys(undefined, "todo", defaults);
		expect(hidden).toEqual(["todo"]);
		expect(revealActivityTabKeys(hidden, "todo", defaults)).toEqual([]);
	});
});
