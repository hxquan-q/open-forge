// Copyright The Open Forge contributors.

export const IN_APP_BROWSER_PICKER_ROOT_ID = "__vetta-in-app-browser-picker";
export const IN_APP_BROWSER_DOM_MUTATION_SENTINEL = "vetta-browser-dom-mutation";

export type InAppBrowserPickerCommand = "start" | "stop" | "hide-overlay" | "show-overlay" | "install-observer";

export function buildInAppBrowserGuestScript(command: InAppBrowserPickerCommand): string {
	return `void 0;(${inAppBrowserGuestRuntime.toString()})(${JSON.stringify(command)})`;
}

function inAppBrowserGuestRuntime(command: InAppBrowserPickerCommand): unknown {
	const rootId = "__vetta-in-app-browser-picker";
	const stateKey = "__vettaInAppBrowserPicker";
	const observerKey = "__vettaInAppBrowserObserver";
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
		const fallback = event.target;
		if (fallback instanceof Element && !fallback.closest(`#${rootId}`)) return fallback;
		const point = event as MouseEvent;
		const stack =
			typeof document.elementsFromPoint === "function" && typeof point.clientX === "number"
				? document.elementsFromPoint(point.clientX, point.clientY)
				: [];
		return stack.find((node) => !node.closest(`#${rootId}`)) ?? null;
	};

	const describeNode = (element: Element): string => {
		const tag = element.tagName.toLowerCase();
		if (element.id && document.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
			return `${tag}#${element.id}`;
		}
		const parent = element.parentElement;
		if (!parent) return tag;
		const typed = Array.from(parent.children).filter((node) => node.tagName === element.tagName);
		return typed.length > 1 ? `${tag}:nth-of-type(${typed.indexOf(element) + 1})` : tag;
	};

	const buildDomPath = (element: Element): string => {
		const parts: string[] = [];
		let currentNode: Element | null = element;
		while (currentNode && currentNode !== document.documentElement) {
			parts.unshift(describeNode(currentNode));
			if (currentNode.id && document.querySelectorAll(`#${cssEscape(currentNode.id)}`).length === 1) break;
			currentNode = currentNode.parentElement;
		}
		return (parts.join(" > ") || element.tagName.toLowerCase()).slice(0, 2048);
	};

	const buildXPath = (element: Element): string => {
		if (element.id && document.querySelectorAll(`#${cssEscape(element.id)}`).length === 1) {
			return `//*[@id=${JSON.stringify(element.id)}]`.slice(0, 2048);
		}
		const parts: string[] = [];
		let currentNode: Element | null = element;
		while (currentNode) {
			const tag = currentNode.tagName.toLowerCase();
			const parent = currentNode.parentElement;
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
			store[stateKey] = undefined;
			state.resolve(collect(target));
		},
		onKey: (event) => {
			const keyEvent = event as KeyboardEvent;
			if (keyEvent.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			void inAppBrowserGuestRuntime("stop");
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

export function runInAppBrowserGuestCommand(command: InAppBrowserPickerCommand): unknown {
	return inAppBrowserGuestRuntime(command);
}
