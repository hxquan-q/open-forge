// Copyright The Open Forge contributors.
import {
	BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS,
	BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS,
} from "@vetta/coding-agent/function-extensions";
import { assembleGuestScript } from "./guest-script-shim.js";
import { readBrowserElementSourceHint } from "./webview-element-extract.js";
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
	readonly readSourceHint: typeof readBrowserElementSourceHint;
}

const guestDepsLiteral = `{choosePickTarget:${chooseInAppBrowserPickTarget.toString()},applyLiveEdit:${applyInAppBrowserLiveEdit.toString()},revertLiveEditEntry:${revertInAppBrowserLiveEditEntry.toString()},revertLiveEditEntries:${revertInAppBrowserLiveEditEntries.toString()},styleKeys:${JSON.stringify([...BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS])},maxEdits:${JSON.stringify(BROWSER_ELEMENT_LIVE_EDIT_MAX_ITEMS)},readSourceHint:${readBrowserElementSourceHint.toString()}}`;

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
		annotation: HTMLElement | null;
		selected: Element | null;
		selections: Element[];
		marks: HTMLDivElement[];
		promise: Promise<unknown>;
		resolve: (value: unknown) => void;
		disposed: boolean;
		onMove: (event: Event) => void;
		onClick: (event: Event) => void;
		onKey: (event: Event) => void;
		reposition: () => void;
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
		window.removeEventListener("scroll", current.reposition, true);
		window.removeEventListener("resize", current.reposition);
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
		const sourceHint = deps.readSourceHint(element);
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
			...(sourceHint ? { sourceHint } : {}),
		};
	};

	function annotationCopy(value: unknown): { placeholder: string; send: string } {
		if (value && typeof value === "object") {
			const record = value as Record<string, unknown>;
			if (
				typeof record.placeholder === "string" &&
				record.placeholder &&
				typeof record.send === "string" &&
				record.send
			) {
				return { placeholder: record.placeholder, send: record.send };
			}
		}
		return { placeholder: "Describe the change", send: "Send" };
	}

	function placeAnnotation(box: HTMLElement, rect: DOMRect): void {
		const margin = 8;
		const width = Math.min(280, Math.max(160, window.innerWidth - margin * 2));
		box.style.width = `${width}px`;
		const height = box.offsetHeight || 96;
		let left = rect.right + margin;
		let top = rect.top;
		if (left + width > window.innerWidth - margin) left = rect.left - width - margin;
		if (left < margin) {
			left = margin;
			top = rect.bottom + margin;
		}
		if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
		box.style.left = `${Math.max(margin, left)}px`;
		box.style.top = `${Math.max(margin, top)}px`;
	}

	let resolvePick: (value: unknown) => void = () => undefined;
	const promise = new Promise((resolve) => {
		resolvePick = resolve;
	});
	const state: PickerState = {
		overlay,
		highlight,
		annotation: null,
		selected: null,
		selections: [],
		marks: [],
		promise,
		resolve: resolvePick,
		disposed: false,
		onMove: (event) => {
			if (state.annotation) return;
			const target = pickTarget(event);
			if (!target) return;
			placeHighlight(target);
		},
		onClick: (event) => {
			const eventTarget = event.target;
			if (eventTarget instanceof Node && state.annotation?.contains(eventTarget)) return;
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
			if (event.type !== "click") return;
			const target = pickTarget(event);
			if (!target || state.disposed) return;
			const point = event as MouseEvent;
			if (point.altKey) {
				finishPick(target, "input", []);
				return;
			}
			if (point.shiftKey) {
				toggleSelection(target);
				return;
			}
			openAnnotation(target);
		},
		reposition: () => {
			syncHighlights();
			const anchor = state.selections[state.selections.length - 1];
			if (!anchor || !state.annotation) return;
			placeAnnotation(state.annotation, anchor.getBoundingClientRect());
		},
		onKey: (event) => {
			const keyEvent = event as KeyboardEvent;
			if (keyEvent.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			void inAppBrowserGuestRuntime("stop", null, deps);
		},
	};
	const maxSelections = 4;

	function placeMark(mark: HTMLElement, element: Element): void {
		const rect = element.getBoundingClientRect();
		mark.style.left = `${rect.left}px`;
		mark.style.top = `${rect.top}px`;
		mark.style.width = `${rect.width}px`;
		mark.style.height = `${rect.height}px`;
	}

	function syncHighlights(): void {
		for (const mark of state.marks) mark.remove();
		state.marks = [];
		const [first, ...rest] = state.selections;
		if (!first) {
			highlight.style.width = "0px";
			highlight.style.height = "0px";
			return;
		}
		placeMark(highlight, first);
		for (const element of rest) {
			const mark = document.createElement("div");
			mark.style.cssText = highlight.style.cssText;
			overlay.append(mark);
			placeMark(mark, element);
			state.marks.push(mark);
		}
	}

	function finishPick(selected: Element, placement: "input" | "annotation", companions: readonly Element[]): void {
		if (state.disposed) return;
		const field = placement === "annotation" ? state.annotation?.querySelector("textarea") : null;
		const comment = field instanceof HTMLTextAreaElement ? field.value.slice(0, 2000) : undefined;
		const companionPayload = companions.map((element) => collect(element));
		state.disposed = true;
		window.removeEventListener("mousemove", state.onMove, true);
		window.removeEventListener("pointerdown", state.onClick, true);
		window.removeEventListener("mousedown", state.onClick, true);
		window.removeEventListener("click", state.onClick, true);
		window.removeEventListener("dblclick", state.onClick, true);
		window.removeEventListener("auxclick", state.onClick, true);
		window.removeEventListener("keydown", state.onKey, true);
		window.removeEventListener("scroll", state.reposition, true);
		window.removeEventListener("resize", state.reposition);
		overlay.remove();
		editStore().current = selected;
		store[stateKey] = undefined;
		state.resolve({
			...collect(selected),
			placement,
			...(comment === undefined ? {} : { comment }),
			...(companionPayload.length > 0 ? { companions: companionPayload } : {}),
		});
	}

	function finishAnnotation(): void {
		const primary = state.selections[0];
		if (!primary) return;
		finishPick(primary, "annotation", state.selections.slice(1));
	}

	function toggleSelection(target: Element): void {
		const index = state.selections.indexOf(target);
		if (index >= 0) state.selections.splice(index, 1);
		else if (state.selections.length < maxSelections) state.selections.push(target);
		const anchor = state.selections[state.selections.length - 1] ?? null;
		state.selected = anchor;
		syncHighlights();
		if (!anchor) {
			state.annotation?.remove();
			state.annotation = null;
			return;
		}
		if (!state.annotation) {
			openAnnotation(anchor, true);
			return;
		}
		placeAnnotation(state.annotation, anchor.getBoundingClientRect());
	}

	function openAnnotation(target: Element, keepGroup = false): void {
		if (!keepGroup) state.selections = [target];
		state.selected = target;
		const previous = state.annotation?.querySelector("textarea");
		const previousText = previous instanceof HTMLTextAreaElement ? previous.value : "";
		state.annotation?.remove();
		const copy = annotationCopy(arg);
		const box = document.createElement("form");
		box.setAttribute("data-vetta-annotation", "");
		box.style.cssText =
			"position:fixed;z-index:2147483647;pointer-events:auto;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;padding:8px;border:1px solid rgba(59,130,246,0.45);border-radius:8px;background:#fff;color:#111;box-shadow:0 8px 24px rgba(0,0,0,0.16);font:12px/1.4 sans-serif;";
		const field = document.createElement("textarea");
		field.rows = 2;
		field.placeholder = copy.placeholder;
		field.setAttribute("aria-label", copy.placeholder);
		field.style.cssText =
			"width:100%;box-sizing:border-box;resize:none;border:1px solid #d0d0d0;border-radius:6px;padding:6px;font:inherit;color:inherit;background:#fff;";
		const send = document.createElement("button");
		send.type = "submit";
		send.textContent = copy.send;
		send.style.cssText =
			"align-self:flex-end;border:0;border-radius:6px;padding:4px 10px;background:#2563eb;color:#fff;font:inherit;cursor:pointer;";
		box.append(field, send);
		box.addEventListener("submit", (submitEvent) => {
			submitEvent.preventDefault();
			finishAnnotation();
		});
		overlay.setAttribute("aria-hidden", "false");
		overlay.append(box);
		state.annotation = box;
		if (keepGroup && previousText) field.value = previousText;
		syncHighlights();
		placeAnnotation(box, target.getBoundingClientRect());
		field.focus();
	}

	store[stateKey] = state;
	window.addEventListener("mousemove", state.onMove, true);
	window.addEventListener("pointerdown", state.onClick, true);
	window.addEventListener("mousedown", state.onClick, true);
	window.addEventListener("click", state.onClick, true);
	window.addEventListener("dblclick", state.onClick, true);
	window.addEventListener("auxclick", state.onClick, true);
	window.addEventListener("keydown", state.onKey, true);
	window.addEventListener("scroll", state.reposition, true);
	window.addEventListener("resize", state.reposition);
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
		readSourceHint: readBrowserElementSourceHint,
	});
}
