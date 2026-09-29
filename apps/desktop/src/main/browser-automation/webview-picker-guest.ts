// Copyright The Open Forge contributors.
import {
	BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS,
	BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS,
} from "@vetta/coding-agent/function-extensions";
import { assembleGuestScript } from "./guest-script-shim.js";
import {
	applyInAppBrowserLiveEdit,
	type InAppBrowserLiveEditEntry,
	revertInAppBrowserLiveEditEntries,
	revertInAppBrowserLiveEditEntry,
} from "./webview-live-edit.js";
import { chooseInAppBrowserPickTarget } from "./webview-picker-target.js";

export const IN_APP_BROWSER_PICKER_ROOT_ID = "__vetta-in-app-browser-picker";
export const IN_APP_BROWSER_DOM_MUTATION_SENTINEL = "vetta-browser-dom-mutation";

export type InAppBrowserPickerCommand =
	| "start"
	| "stop"
	| "hide-overlay"
	| "show-overlay"
	| "install-observer"
	| "apply-edit"
	| "revert-edit"
	| "revert-all-edits"
	| "edit-state";

/**
 * guest runtime 的全部外部依赖。注入时经 `.toString()` 逐个内联成函数值/JSON 字面量，
 * 测试直调时传真实绑定——runtime 函数体只能引用 `deps.*` 与全局对象，不得引用模块裸标识符
 * （打包器/vitest SSR 会改写模块绑定名，裸引用在注入脚本里必然 ReferenceError）。
 */
interface InAppBrowserGuestDeps {
	readonly choosePickTarget: typeof chooseInAppBrowserPickTarget;
	readonly applyLiveEdit: typeof applyInAppBrowserLiveEdit;
	readonly revertLiveEditEntry: typeof revertInAppBrowserLiveEditEntry;
	readonly revertLiveEditEntries: typeof revertInAppBrowserLiveEditEntries;
	readonly styleKeys: readonly string[];
	readonly maxEdits: number;
}

const guestDepsLiteral = `{choosePickTarget:${chooseInAppBrowserPickTarget.toString()},applyLiveEdit:${applyInAppBrowserLiveEdit.toString()},revertLiveEditEntry:${revertInAppBrowserLiveEditEntry.toString()},revertLiveEditEntries:${revertInAppBrowserLiveEditEntries.toString()},styleKeys:${JSON.stringify([...BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS])},maxEdits:${JSON.stringify(BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS)}}`;

export function buildInAppBrowserGuestScript(command: InAppBrowserPickerCommand, arg?: unknown): string {
	// runtime 源码与 deps 字面量都要交给垫片扫描：两者都可能被 keepNames 插入辅助函数调用。
	const runtimeSource = inAppBrowserGuestRuntime.toString();
	return assembleGuestScript({
		sources: [runtimeSource, guestDepsLiteral],
		parameters: "command,arg,deps",
		expression: `(${runtimeSource})(command,arg,deps)`,
		arguments: `${JSON.stringify(command)},${JSON.stringify(arg ?? null)},${guestDepsLiteral}`,
	});
}

function inAppBrowserGuestRuntime(
	command: InAppBrowserPickerCommand,
	arg: unknown,
	deps: InAppBrowserGuestDeps,
): unknown {
	const rootId = "__vetta-in-app-browser-picker";
	const stateKey = "__vettaInAppBrowserPicker";
	const observerKey = "__vettaInAppBrowserObserver";
	const editKey = "__vettaInAppBrowserLiveEdit";
	const mutationSentinel = "vetta-browser-dom-mutation";
	const store = window as unknown as Record<string, unknown>;
	const cssEscape = (value: string): string => {
		const css = (window as unknown as { CSS?: { escape?: (input: string) => string } }).CSS;
		if (typeof css?.escape === "function") return css.escape(value);
		return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
	};

	type PickerState = {
		overlay: HTMLDivElement;
		highlight: HTMLDivElement;
		promise: Promise<unknown>;
		resolve: (value: unknown) => void;
		disposed: boolean;
		onMove: (event: Event) => void;
		onClick: (event: Event) => void;
		onKey: (event: Event) => void;
	};

	const current = store[stateKey] as PickerState | undefined;

	type LiveEditStore = { current: Element | null; entries: InAppBrowserLiveEditEntry[] };
	// 函数声明提升：stop 分支与命令分发都先于函数体其余 const 执行。
	function editStore(): LiveEditStore {
		let entry = store[editKey] as LiveEditStore | undefined;
		if (!entry) {
			entry = { current: null, entries: [] };
			store[editKey] = entry;
		}
		return entry;
	}
	function publicEdits(entries: readonly InAppBrowserLiveEditEntry[]): unknown[] {
		return entries.map(({ kind, property, before, after, target }) =>
			property === undefined ? { kind, before, after, target } : { kind, property, before, after, target },
		);
	}
	function revertAllLiveEdits(): void {
		const entry = editStore();
		deps.revertLiveEditEntries(entry.entries);
		entry.entries = [];
	}
	function describeEditTarget(element: Element): string {
		return buildDomPath(element);
	}

	if (command === "apply-edit") {
		const entry = editStore();
		const edit = (arg && typeof arg === "object" ? arg : {}) as {
			kind?: "style" | "text";
			property?: string;
			value?: string;
		};
		const result = deps.applyLiveEdit(
			entry.current,
			{
				kind: edit.kind === "text" ? "text" : "style",
				property: edit.property,
				value: typeof edit.value === "string" ? edit.value : "",
			},
			deps.styleKeys,
			entry.entries.length,
			deps.maxEdits,
		);
		if (!result.ok) return { ok: false, code: result.code };
		entry.entries.push({
			element: entry.current as Element,
			target: describeEditTarget(entry.current as Element),
			...result.record,
		});
		return { ok: true, edits: publicEdits(entry.entries) };
	}
	if (command === "revert-edit") {
		const entry = editStore();
		const index = typeof (arg as { index?: unknown })?.index === "number" ? (arg as { index: number }).index : -1;
		const target = index >= 0 && index < entry.entries.length ? entry.entries[index] : undefined;
		if (!target) return { ok: false, code: "invalid_index" };
		deps.revertLiveEditEntry(target);
		entry.entries.splice(index, 1);
		return { ok: true, edits: publicEdits(entry.entries) };
	}
	if (command === "revert-all-edits") {
		revertAllLiveEdits();
		return { ok: true, edits: [] };
	}
	if (command === "edit-state") {
		const entry = editStore();
		return {
			ok: true,
			hasElement: Boolean(entry.current && entry.current.isConnected !== false),
			edits: publicEdits(entry.entries),
		};
	}

	if (command === "install-observer") {
		if (store[observerKey]) return { ok: true, already: true };
		let timer: ReturnType<typeof setTimeout> | undefined;
		const observer = new MutationObserver((records) => {
			if (
				records.every((record) => {
					const target = record.target instanceof Element ? record.target : record.target.parentElement;
					return Boolean(target?.closest(`#${rootId}`));
				})
			) {
				return;
			}
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				console.debug(mutationSentinel);
			}, 200);
		});
		observer.observe(document.documentElement, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		store[observerKey] = observer;
		return { ok: true };
	}

	if (command === "hide-overlay") {
		if (current) current.overlay.style.display = "none";
		return { ok: true };
	}
	if (command === "show-overlay") {
		if (current) current.overlay.style.display = "";
		return { ok: true };
	}
	if (command === "stop") {
		revertAllLiveEdits();
		store[editKey] = undefined;
		if (!current) return { ok: true, stopped: true };
		current.disposed = true;
		window.removeEventListener("mousemove", current.onMove, true);
		window.removeEventListener("pointerdown", current.onClick, true);
		window.removeEventListener("mousedown", current.onClick, true);
		window.removeEventListener("click", current.onClick, true);
		window.removeEventListener("dblclick", current.onClick, true);
		window.removeEventListener("auxclick", current.onClick, true);
		window.removeEventListener("keydown", current.onKey, true);
		current.overlay.remove();
		current.resolve({ cancelled: true });
		store[stateKey] = undefined;
		return { ok: true, stopped: true };
	}

	if (current) return current.promise;

	const overlay = document.createElement("div");
	overlay.id = rootId;
	overlay.setAttribute("aria-hidden", "true");
	overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:transparent;";
	const highlight = document.createElement("div");
	highlight.style.cssText =
		"position:fixed;pointer-events:none;border:1px solid rgba(59,130,246,0.9);background:rgba(59,130,246,0.12);border-radius:2px;";
	overlay.append(highlight);
	document.documentElement.append(overlay);

	const pickTarget = (event: Event): Element | null => {
		const point = event as MouseEvent;
		return deps.choosePickTarget(point, document, rootId);
	};

	function describeNode(element: Element): string {
		const tag = element.tagName.toLowerCase();
		if (element.id && document.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
			return `${tag}#${element.id}`;
		}
		const parent = element.parentElement;
		if (!parent) return tag;
		const typed = Array.from(parent.children).filter((node) => node.tagName === element.tagName);
		return typed.length > 1 ? `${tag}:nth-of-type(${typed.indexOf(element) + 1})` : tag;
	}

	function buildDomPath(element: Element): string {
		const parts: string[] = [];
		let currentNode: Element | null = element;
		while (currentNode && currentNode !== document.documentElement) {
			parts.unshift(describeNode(currentNode));
			if (currentNode.id && document.querySelectorAll(`#${cssEscape(currentNode.id)}`).length === 1) break;
			currentNode = currentNode.parentElement;
		}
		return (parts.join(" > ") || element.tagName.toLowerCase()).slice(0, 2048);
	}

	const buildXPath = (element: Element): string => {
		if (element.id && document.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
			return `//*[@id=${JSON.stringify(element.id)}]`.slice(0, 2048);
		}
		const parts: string[] = [];
		let currentNode: Element | null = element;
		while (currentNode) {
			const tag = currentNode.tagName.toLowerCase();
			const parent: Element | null = currentNode.parentElement;
			if (!parent) {
				parts.unshift(`/${tag}`);
				break;
			}
			const siblings = Array.from(parent.children).filter((node) => node.tagName === currentNode?.tagName);
			parts.unshift(`/${tag}[${siblings.indexOf(currentNode) + 1}]`);
			currentNode = parent;
		}
		return parts.join("").slice(0, 2048);
	};

	const collect = (element: Element): Record<string, unknown> => {
		const allowedAttrs = [
			"id",
			"name",
			"type",
			"role",
			"href",
			"src",
			"alt",
			"title",
			"placeholder",
			"aria-label",
			"aria-labelledby",
			"aria-describedby",
			"for",
			"autocomplete",
		];
		const allowedStyles = [
			"display",
			"position",
			"width",
			"height",
			"margin",
			"padding",
			"color",
			"backgroundColor",
			"fontSize",
			"fontWeight",
			"fontFamily",
			"lineHeight",
			"textAlign",
			"overflow",
			"zIndex",
		];
		const attributes: Record<string, string> = {};
		for (const key of allowedAttrs) {
			const value = element.getAttribute(key)?.trim();
			if (!value) continue;
			if ((key === "href" || key === "src") && /^\s*(javascript:|data:)/i.test(value)) continue;
			attributes[key] = value.slice(0, 512);
		}
		const style = window.getComputedStyle(element);
		const computedStyle: Record<string, string> = {};
		for (const key of allowedStyles) {
			const value = (style as unknown as Record<string, string>)[key];
			if (typeof value === "string" && value) computedStyle[key] = value.slice(0, 256);
		}
		const type = (element.getAttribute("type") ?? "").toLowerCase();
		const sensitive =
			type === "password" ||
			/password|cc-|card|cvv|csc|ssn|one-time/i.test(element.getAttribute("autocomplete") ?? "") ||
			/^(password|passwd|secret|token|cookie|authorization|auth|ssn|credit|card|cvv|pin)$/i.test(
				element.getAttribute("name") ?? element.getAttribute("id") ?? "",
			);
		let outerHTML = element.outerHTML
			.replace(/<script\b[\s\S]*?<\/script>/gi, "")
			.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
			.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
		if (sensitive) outerHTML = outerHTML.replace(/\svalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' value="••••"');
		const labelledBy = element.getAttribute("aria-labelledby")?.trim();
		const fromIds = labelledBy
			? labelledBy
					.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
					.filter(Boolean)
					.join(" ")
			: "";
		const label = element.id
			? (document.querySelector(`label[for="${cssEscape(element.id)}"]`)?.textContent?.trim() ?? "")
			: "";
		const accessibleName = (
			element.getAttribute("aria-label")?.trim() ||
			fromIds ||
			element.getAttribute("alt")?.trim() ||
			label ||
			element.getAttribute("title")?.trim() ||
			element.getAttribute("placeholder")?.trim() ||
			(element.textContent ?? "").replace(/\s+/g, " ").trim()
		).slice(0, 512);
		const tag = element.tagName.toLowerCase();
		let role = element.getAttribute("role")?.trim() || "";
		if (!role) {
			if (tag === "input") {
				const inputType = (element.getAttribute("type") ?? "text").toLowerCase();
				role =
					inputType === "button" || inputType === "submit" || inputType === "reset"
						? "button"
						: inputType === "checkbox"
							? "checkbox"
							: inputType === "radio"
								? "radio"
								: "textbox";
			} else {
				role = tag === "a" ? "link" : tag === "button" ? "button" : tag === "textarea" ? "textbox" : tag;
			}
		}
		const rect = element.getBoundingClientRect();
		return {
			role: role.slice(0, 128),
			accessibleName,
			attributes,
			domPath: buildDomPath(element),
			xpath: buildXPath(element),
			computedStyle,
			outerHTML: outerHTML.slice(0, 8 * 1024),
			surroundingText: (element.parentElement?.textContent ?? element.textContent ?? "")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 2 * 1024),
			boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			devicePixelRatio: window.devicePixelRatio || 1,
		};
	};

	let resolvePick: (value: unknown) => void = () => undefined;
	const promise = new Promise((resolve) => {
		resolvePick = resolve;
	});
	const state: PickerState = {
		overlay,
		highlight,
		promise,
		resolve: resolvePick,
		disposed: false,
		onMove: (event) => {
			const target = pickTarget(event);
			if (!target) return;
			const rect = target.getBoundingClientRect();
			highlight.style.left = `${rect.left}px`;
			highlight.style.top = `${rect.top}px`;
			highlight.style.width = `${rect.width}px`;
			highlight.style.height = `${rect.height}px`;
		},
		onClick: (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
			if (event.type !== "click") return;
			const target = pickTarget(event);
			if (!target || state.disposed) return;
			state.disposed = true;
			window.removeEventListener("mousemove", state.onMove, true);
			window.removeEventListener("pointerdown", state.onClick, true);
			window.removeEventListener("mousedown", state.onClick, true);
			window.removeEventListener("click", state.onClick, true);
			window.removeEventListener("dblclick", state.onClick, true);
			window.removeEventListener("auxclick", state.onClick, true);
			window.removeEventListener("keydown", state.onKey, true);
			overlay.remove();
			editStore().current = target;
			store[stateKey] = undefined;
			state.resolve(collect(target));
		},
		onKey: (event) => {
			const keyEvent = event as KeyboardEvent;
			if (keyEvent.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			void inAppBrowserGuestRuntime("stop", null, deps);
		},
	};
	store[stateKey] = state;
	window.addEventListener("mousemove", state.onMove, true);
	window.addEventListener("pointerdown", state.onClick, true);
	window.addEventListener("mousedown", state.onClick, true);
	window.addEventListener("click", state.onClick, true);
	window.addEventListener("dblclick", state.onClick, true);
	window.addEventListener("auxclick", state.onClick, true);
	window.addEventListener("keydown", state.onKey, true);
	return promise;
}

/**
 * 单测入口：直接调用真实 runtime + 真实依赖绑定，与注入路径执行同一份函数体
 * （注入脚本只是把同样的函数按 `.toString()` 值传进 `deps`）。
 */
export function runInAppBrowserGuestCommand(command: InAppBrowserPickerCommand, arg?: unknown): unknown {
	return inAppBrowserGuestRuntime(command, arg ?? null, {
		choosePickTarget: chooseInAppBrowserPickTarget,
		applyLiveEdit: applyInAppBrowserLiveEdit,
		revertLiveEditEntry: revertInAppBrowserLiveEditEntry,
		revertLiveEditEntries: revertInAppBrowserLiveEditEntries,
		styleKeys: BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS,
		maxEdits: BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS,
	});
}
