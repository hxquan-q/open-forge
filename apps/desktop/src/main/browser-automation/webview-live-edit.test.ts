// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { afterEach, describe, expect, it } from "vitest";
import {
	applyInAppBrowserLiveEdit,
	revertInAppBrowserLiveEditEntries,
	revertInAppBrowserLiveEditEntry,
} from "./webview-live-edit.js";
import { runInAppBrowserGuestCommand } from "./webview-picker-guest.js";

const STYLE_KEYS = ["color", "fontSize", "display"] as const;

afterEach(async () => {
	await runInAppBrowserGuestCommand("stop");
	document.body.innerHTML = "";
});

describe("applyInAppBrowserLiveEdit", () => {
	it("应用内联样式并记录 inline before/after", () => {
		const el = document.createElement("button");
		el.style.setProperty("color", "blue");
		document.body.append(el);
		const result = applyInAppBrowserLiveEdit(
			el,
			{ kind: "style", property: "color", value: "red" },
			STYLE_KEYS,
			0,
			64,
		);
		expect(result).toEqual({ ok: true, record: { kind: "style", property: "color", before: "blue", after: "red" } });
		expect(el.style.getPropertyValue("color")).toBe("red");
	});

	it("空值等价于移除内联属性", () => {
		const el = document.createElement("div");
		el.style.setProperty("display", "none");
		document.body.append(el);
		const result = applyInAppBrowserLiveEdit(
			el,
			{ kind: "style", property: "display", value: "" },
			STYLE_KEYS,
			0,
			64,
		);
		expect(result).toMatchObject({ ok: true, record: { before: "none", after: "" } });
		expect(el.style.getPropertyValue("display")).toBe("");
	});

	it("拒绝白名单外属性、无元素、超上限", () => {
		const el = document.createElement("div");
		document.body.append(el);
		expect(
			applyInAppBrowserLiveEdit(el, { kind: "style", property: "position", value: "fixed" }, STYLE_KEYS, 0, 64),
		).toEqual({ ok: false, code: "unknown_property" });
		expect(applyInAppBrowserLiveEdit(null, { kind: "text", value: "x" }, STYLE_KEYS, 0, 64)).toEqual({
			ok: false,
			code: "no_element",
		});
		expect(
			applyInAppBrowserLiveEdit(el, { kind: "style", property: "color", value: "red" }, STYLE_KEYS, 64, 64),
		).toEqual({ ok: false, code: "limit_reached" });
	});

	it("text 只作用于叶子元素并截断 2048", () => {
		const leaf = document.createElement("span");
		leaf.textContent = "旧文本";
		document.body.append(leaf);
		const ok = applyInAppBrowserLiveEdit(leaf, { kind: "text", value: "新文本" }, STYLE_KEYS, 0, 64);
		expect(ok).toMatchObject({ ok: true, record: { kind: "text", before: "旧文本", after: "新文本" } });
		expect(leaf.textContent).toBe("新文本");

		const parent = document.createElement("div");
		parent.innerHTML = "<b>child</b>";
		document.body.append(parent);
		expect(applyInAppBrowserLiveEdit(parent, { kind: "text", value: "x" }, STYLE_KEYS, 0, 64)).toEqual({
			ok: false,
			code: "not_leaf_text",
		});
	});

	it("撤销回放 before；逆序撤销整份日志", () => {
		const el = document.createElement("div");
		el.style.setProperty("color", "black");
		el.textContent = "原文";
		document.body.append(el);
		const e1 = applyInAppBrowserLiveEdit(el, { kind: "style", property: "color", value: "red" }, STYLE_KEYS, 0, 64);
		const e2 = applyInAppBrowserLiveEdit(el, { kind: "text", value: "改后" }, STYLE_KEYS, 1, 64);
		if (!e1.ok || !e2.ok) throw new Error("apply failed");
		const entries = [
			{ element: el, ...e1.record },
			{ element: el, ...e2.record },
		];
		expect(revertInAppBrowserLiveEditEntry(entries[1])).toBe(true);
		expect(el.textContent).toBe("原文");
		expect(revertInAppBrowserLiveEditEntries(entries)).toBe(2);
		expect(el.style.getPropertyValue("color")).toBe("black");
	});
});

describe("guest live-edit commands", () => {
	// b5e601a61 起点中元素先打开批注卡，点选在批注提交时才完成（finishPick resolve）。
	const pickButton = async (): Promise<void> => {
		document.body.innerHTML = `<button id="go">Go</button>`;
		const pick = runInAppBrowserGuestCommand("start") as Promise<unknown>;
		document
			.getElementById("go")!
			.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }));
		const box = document.querySelector("[data-vetta-annotation]");
		if (!(box instanceof HTMLFormElement)) throw new Error("missing annotation");
		box.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await pick;
	};

	it("选中元素后 apply-edit 即时生效并回报日志，revert-edit 单条撤销", async () => {
		await pickButton();
		const button = document.getElementById("go")!;
		const applied = runInAppBrowserGuestCommand("apply-edit", {
			kind: "style",
			property: "color",
			value: "rgb(255, 0, 0)",
		}) as {
			ok: boolean;
			edits: { kind: string; property?: string; before: string; after: string; target?: string }[];
		};
		expect(applied.ok).toBe(true);
		expect(button.style.getPropertyValue("color")).toBe("rgb(255, 0, 0)");
		expect(applied.edits).toHaveLength(1);
		expect(applied.edits[0]).toMatchObject({
			kind: "style",
			property: "color",
			after: "rgb(255, 0, 0)",
			target: "button#go",
		});

		const reverted = runInAppBrowserGuestCommand("revert-edit", { index: 0 }) as { ok: boolean; edits: unknown[] };
		expect(reverted.ok).toBe(true);
		expect(reverted.edits).toHaveLength(0);
		expect(button.style.getPropertyValue("color")).toBe("");
	});

	it("未选中元素时 apply-edit 拒绝；stop 自动还原全部改动", async () => {
		expect(runInAppBrowserGuestCommand("apply-edit", { kind: "text", value: "x" })).toEqual({
			ok: false,
			code: "no_element",
		});
		await pickButton();
		const button = document.getElementById("go")!;
		runInAppBrowserGuestCommand("apply-edit", { kind: "style", property: "color", value: "red" });
		runInAppBrowserGuestCommand("apply-edit", { kind: "text", value: "改过的按钮" });
		expect(button.textContent).toBe("改过的按钮");
		await runInAppBrowserGuestCommand("stop");
		expect(button.textContent).toBe("Go");
		expect(button.style.getPropertyValue("color")).toBe("");
	});

	it("edit-state 回报当前元素与日志；连续选中切换 current 且日志不清空", async () => {
		await pickButton();
		const state = runInAppBrowserGuestCommand("edit-state") as { ok: boolean; hasElement: boolean; edits: unknown[] };
		expect(state).toMatchObject({ ok: true, hasElement: true, edits: [] });
		runInAppBrowserGuestCommand("apply-edit", { kind: "style", property: "color", value: "red" });
		document.body.innerHTML = `<button id="go">Go</button><button id="next">Next</button>`;
		const pick = runInAppBrowserGuestCommand("start") as Promise<unknown>;
		document
			.getElementById("next")!
			.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }));
		const box = document.querySelector("[data-vetta-annotation]");
		if (!(box instanceof HTMLFormElement)) throw new Error("missing annotation");
		box.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await pick;
		const after = runInAppBrowserGuestCommand("edit-state") as { hasElement: boolean; edits: { target?: string }[] };
		expect(after.hasElement).toBe(true);
		expect(after.edits).toHaveLength(1);
		expect(after.edits[0].target).toBe("button#go");
	});
});
