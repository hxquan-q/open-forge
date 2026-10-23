// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { TabBar } from "@shared/components/ui/tab-bar";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock("motion/react", () => ({ motion: { span: () => null }, useReducedMotion: () => reducedMotion.value }));

class ResizeObserverStub {
	disconnect(): void {}
	observe(): void {}
}

const items = [
	{ key: "files", label: "文件" },
	{ key: "browser", label: "浏览器" },
	{ key: "canvas", label: "画布" },
	{ key: "terminal", label: "终端" },
];

function keyEvent(key: string): KeyboardEvent {
	return new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
}

function activeTabButton(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector<HTMLButtonElement>('[role="tab"][tabindex="0"]');
	if (!button) throw new Error("no active tab stop");
	return button;
}

describe("TabBar keyboard navigation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		reducedMotion.value = false;
		vi.stubGlobal("ResizeObserver", ResizeObserverStub);
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("仅激活页签是 Tab 停靠点（roving tabindex）", () => {
		act(() => {
			root.render(createElement(TabBar, { items, value: "browser", onChange: vi.fn() }));
		});
		const stops = Array.from(container.querySelectorAll('[role="tab"]')).filter(
			(button) => (button as HTMLButtonElement).tabIndex === 0,
		);
		expect(stops).toHaveLength(1);
		expect(stops[0]).toBe(container.querySelector('[data-tabkey="browser"] button'));
	});

	it("方向键循环移动并跟随激活，Home/End 跳到两端", () => {
		let frame: FrameRequestCallback | undefined;
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			frame = callback;
			return 1;
		});
		const onChange = vi.fn();
		function Harness(): ReturnType<typeof createElement> {
			const [value, setValue] = useState("browser");
			return createElement(TabBar, {
				items,
				value,
				onChange: (next: string) => {
					onChange(next);
					setValue(next);
				},
			});
		}
		act(() => {
			root.render(createElement(Harness));
		});
		const tablist = container.querySelector('[role="tablist"]');
		if (!tablist) throw new Error("tablist not found");
		const step = (key: string, expectKey: string): void => {
			act(() => {
				tablist.dispatchEvent(keyEvent(key));
				frame?.(0);
			});
			expect(onChange).toHaveBeenLastCalledWith(expectKey);
			expect(activeTabButton(container).closest("[data-tabkey]")?.getAttribute("data-tabkey")).toBe(expectKey);
			expect(document.activeElement).toBe(container.querySelector(`[data-tabkey="${expectKey}"] button`));
		};
		step("ArrowRight", "canvas");
		step("ArrowRight", "terminal");
		step("ArrowRight", "files");
		step("ArrowLeft", "terminal");
		step("End", "terminal");
		step("Home", "files");
	});

	it("其他按键不劫持焦点与激活", () => {
		const onChange = vi.fn();
		act(() => {
			root.render(createElement(TabBar, { items, value: "browser", onChange }));
		});
		const tablist = container.querySelector('[role="tablist"]');
		if (!tablist) throw new Error("tablist not found");
		act(() => tablist.dispatchEvent(keyEvent("ArrowDown")));
		act(() => tablist.dispatchEvent(keyEvent("Enter")));
		expect(onChange).not.toHaveBeenCalled();
		expect(activeTabButton(container).closest("[data-tabkey]")?.getAttribute("data-tabkey")).toBe("browser");
	});
});
