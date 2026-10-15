// Copyright The Open Forge contributors.
import { assembleGuestScript } from "./guest-script-shim.js";

export const BROWSER_TAB_SNAPSHOT_LIMIT = 80;

export interface BrowserTabGuestSnapshotNode {
	readonly role: string;
	readonly name: string;
	readonly xpath: string;
	readonly boundingRect: { x: number; y: number; width: number; height: number };
}

export function collectInAppBrowserSnapshotNodes(
	document: Document,
	interactiveOnly: boolean,
	limit = BROWSER_TAB_SNAPSHOT_LIMIT,
): { readonly nodes: BrowserTabGuestSnapshotNode[]; readonly truncated: boolean } {
	const selector = [
		"a[href]",
		"button",
		"input",
		"textarea",
		"select",
		"summary",
		"[role='button']",
		"[role='link']",
		"[role='textbox']",
		"[role='checkbox']",
		"[role='radio']",
		"[role='combobox']",
		"[contenteditable]",
	].join(",");
	const found = Array.from(document.querySelectorAll(selector));
	const nodes: BrowserTabGuestSnapshotNode[] = [];
	for (const element of found) {
		if (!(element instanceof Element)) continue;
		if (interactiveOnly && !isVisibleSnapshotTarget(element)) continue;
		nodes.push({
			role: snapshotRole(element),
			name: snapshotName(element),
			xpath: snapshotXPath(element),
			boundingRect: snapshotRect(element),
		});
		if (nodes.length >= limit) {
			return { nodes, truncated: found.length > nodes.length };
		}
	}
	return { nodes, truncated: false };
}

export function findInAppBrowserElementByXPath(document: Document, xpath: string): Element | null {
	try {
		const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
		const node = result.singleNodeValue;
		return node instanceof Element ? node : null;
	} catch {
		return null;
	}
}

function isVisibleSnapshotTarget(element: Element): boolean {
	const rect = element.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}

function snapshotRole(element: Element): string {
	const explicit = element.getAttribute("role")?.trim();
	if (explicit) return explicit.slice(0, 128);
	const tag = element.tagName.toLowerCase();
	if (tag === "a") return "link";
	if (tag === "button") return "button";
	if (tag === "textarea") return "textbox";
	if (tag === "select") return "combobox";
	if (tag === "input") {
		const type = (element.getAttribute("type") ?? "text").toLowerCase();
		if (type === "checkbox") return "checkbox";
		if (type === "radio") return "radio";
		if (type === "button" || type === "submit" || type === "reset") return "button";
		return "textbox";
	}
	return tag;
}

function snapshotName(element: Element): string {
	return (
		element.getAttribute("aria-label")?.trim() ||
		element.getAttribute("placeholder")?.trim() ||
		element.getAttribute("title")?.trim() ||
		(element.textContent ?? "").replace(/\s+/g, " ").trim()
	).slice(0, 512);
}

function snapshotXPath(element: Element): string {
	const ownerDocument = element.ownerDocument ?? document;
	if (element.id && ownerDocument.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
		return `//*[@id=${JSON.stringify(element.id)}]`;
	}
	const parts: string[] = [];
	let current: Element | null = element;
	while (current) {
		const tag = current.tagName.toLowerCase();
		const parent: Element | null = current.parentElement;
		if (!parent) {
			parts.unshift(`/${tag}`);
			break;
		}
		const siblings = Array.from(parent.children).filter((node: Element) => node.tagName === current?.tagName);
		parts.unshift(`/${tag}[${siblings.indexOf(current) + 1}]`);
		current = parent;
	}
	return parts.join("").slice(0, 2048);
}

function snapshotRect(element: Element): { x: number; y: number; width: number; height: number } {
	const rect = element.getBoundingClientRect();
	return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function cssEscape(value: string): string {
	const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
	if (typeof css?.escape === "function") return css.escape(value);
	return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function buildBrowserTabGuestScript(command: {
	readonly kind: "snapshot" | "click" | "fill" | "press" | "scroll" | "wait" | "inspect";
	readonly interactiveOnly?: boolean;
	readonly xpath?: string;
	readonly value?: string;
	readonly key?: string;
	readonly deltaX?: number;
	readonly deltaY?: number;
	readonly timeoutMs?: number;
	readonly state?: "visible" | "hidden" | "stable";
}): string {
	const runtimeSource = browserTabGuestRuntime.toString();
	return assembleGuestScript({
		sources: [runtimeSource],
		parameters: "command",
		expression: `(${runtimeSource})(command)`,
		arguments: JSON.stringify(command),
	});
}

function browserTabGuestRuntime(command: {
	kind: "snapshot" | "click" | "fill" | "press" | "scroll" | "wait" | "inspect";
	interactiveOnly?: boolean;
	xpath?: string;
	value?: string;
	key?: string;
	deltaX?: number;
	deltaY?: number;
	timeoutMs?: number;
	state?: "visible" | "hidden" | "stable";
}): unknown {
	const find = (xpath: string | undefined): Element | null => {
		if (!xpath) return null;
		try {
			const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
		} catch {
			return null;
		}
	};
	const cssEscapeLocal = (value: string): string => {
		const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
		if (typeof css?.escape === "function") return css.escape(value);
		return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
	};
	const buildXPath = (element: Element): string => {
		const ownerDocument = element.ownerDocument ?? document;
		if (element.id && ownerDocument.querySelectorAll(`#${cssEscapeLocal(element.id)}`).length === 1) {
			return `//*[@id=${JSON.stringify(element.id)}]`;
		}
		const parts: string[] = [];
		let current: Element | null = element;
		while (current) {
			const tag = current.tagName.toLowerCase();
			const parent: Element | null = current.parentElement;
			if (!parent) {
				parts.unshift(`/${tag}`);
				break;
			}
			const siblings = Array.from(parent.children).filter((node: Element) => node.tagName === current?.tagName);
			parts.unshift(`/${tag}[${siblings.indexOf(current) + 1}]`);
			current = parent;
		}
		return parts.join("").slice(0, 2048);
	};
	if (command.kind === "snapshot") {
		const selector =
			"a[href],button,input,textarea,select,summary,[role='button'],[role='link'],[role='textbox'],[role='checkbox'],[role='radio'],[role='combobox'],[contenteditable]";
		const found = Array.from(document.querySelectorAll(selector));
		const nodes: Array<Record<string, unknown>> = [];
		for (const element of found) {
			if (!(element instanceof Element)) continue;
			const rect = element.getBoundingClientRect();
			if (command.interactiveOnly !== false && (rect.width <= 0 || rect.height <= 0)) continue;
			const tag = element.tagName.toLowerCase();
			let role = element.getAttribute("role")?.trim() || "";
			if (!role) {
				role =
					tag === "a"
						? "link"
						: tag === "button"
							? "button"
							: tag === "textarea"
								? "textbox"
								: tag === "select"
									? "combobox"
									: tag === "input"
										? (element.getAttribute("type") ?? "text").toLowerCase() === "checkbox"
											? "checkbox"
											: "textbox"
										: tag;
			}
			nodes.push({
				role: role.slice(0, 128),
				name: (
					element.getAttribute("aria-label")?.trim() ||
					element.getAttribute("placeholder")?.trim() ||
					(element.textContent ?? "").replace(/\s+/g, " ").trim()
				).slice(0, 512),
				xpath: buildXPath(element),
				boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			});
			if (nodes.length >= 80) break;
		}
		return { nodes, truncated: found.length > nodes.length };
	}
	if (command.kind === "click") {
		const target = find(command.xpath);
		if (!target || !("click" in target)) return { ok: false };
		(target as HTMLElement).click();
		return { ok: true };
	}
	if (command.kind === "fill") {
		const target = find(command.xpath);
		if (!target) return { ok: false };
		if ("focus" in target) (target as HTMLElement).focus();
		if ("value" in target) (target as HTMLInputElement).value = command.value ?? "";
		else if (target instanceof HTMLElement && target.isContentEditable) target.innerText = command.value ?? "";
		target.dispatchEvent(new Event("input", { bubbles: true }));
		target.dispatchEvent(new Event("change", { bubbles: true }));
		return { ok: true };
	}
	if (command.kind === "press") {
		const target =
			find(command.xpath) ?? (document.activeElement instanceof Element ? document.activeElement : document.body);
		const init = { key: command.key ?? "", bubbles: true, cancelable: true };
		target.dispatchEvent(new KeyboardEvent("keydown", init));
		target.dispatchEvent(new KeyboardEvent("keyup", init));
		return { ok: true };
	}
	if (command.kind === "scroll") {
		const target = find(command.xpath);
		if (target) target.scrollIntoView({ block: "center" });
		else window.scrollBy(command.deltaX ?? 0, command.deltaY ?? 0);
		return { ok: true };
	}
	if (command.kind === "wait") {
		const timeoutMs = command.timeoutMs ?? 3000;
		const start = Date.now();
		const state = command.state ?? "visible";
		if (state === "stable") {
			return new Promise((resolve) => {
				let quietSince = Date.now();
				const observer = new MutationObserver(() => {
					quietSince = Date.now();
				});
				observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});
				const tick = (): void => {
					if (Date.now() - quietSince >= 300 || Date.now() - start >= timeoutMs) {
						observer.disconnect();
						resolve({ ok: Date.now() - quietSince >= 300 });
						return;
					}
					setTimeout(tick, 50);
				};
				tick();
			});
		}
		return new Promise((resolve) => {
			const tick = (): void => {
				const el = find(command.xpath);
				const visible = Boolean(el && el.getBoundingClientRect().width > 0);
				const ok = state === "hidden" ? !visible : visible;
				if (ok || Date.now() - start >= timeoutMs) resolve({ ok });
				else setTimeout(tick, 50);
			};
			tick();
		});
	}
	if (command.kind === "inspect") {
		const target = find(command.xpath);
		if (!target) return { ok: false };
		const rect = target.getBoundingClientRect();
		return {
			ok: true,
			inspect: {
				role: target.getAttribute("role") ?? target.tagName.toLowerCase(),
				name: (target.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 512),
				attributes: { id: target.id, name: target.getAttribute("name") ?? "" },
				boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			},
		};
	}
	return { ok: true };
}
