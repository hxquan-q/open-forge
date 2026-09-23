// Copyright The Open Forge contributors.

export interface InAppBrowserPickPointEvent {
	readonly target: EventTarget | null;
	readonly clientX?: number;
	readonly clientY?: number;
}

export interface InAppBrowserPickDocument {
	elementsFromPoint?(x: number, y: number): Element[];
}

/**
 * Guest 与单测共用的点选目标选择。函数体必须能 `.toString()` 注入 WebView：
 * 不引用模块绑定，辅助逻辑全部内联。
 */
export function chooseInAppBrowserPickTarget(
	event: InAppBrowserPickPointEvent,
	document: InAppBrowserPickDocument,
	overlayRootId: string,
): Element | null {
	const interactiveTags = new Set(["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "SUMMARY", "LABEL", "OPTION"]);
	const interactiveRoles = new Set([
		"button",
		"link",
		"textbox",
		"checkbox",
		"radio",
		"combobox",
		"menuitem",
		"tab",
		"switch",
		"slider",
		"option",
		"listbox",
	]);
	const asElement = (node: EventTarget | null): Element | null => {
		if (!node) return null;
		if (typeof Element !== "undefined" && node instanceof Element) return node;
		if (typeof Node !== "undefined" && node instanceof Node) {
			const parent = (node as Node & { parentElement?: Element | null }).parentElement;
			return parent ?? null;
		}
		return null;
	};
	const isOverlay = (element: Element): boolean => Boolean(element.closest(`#${overlayRootId}`));
	const tagName = (element: Element): string => element.tagName.toUpperCase();
	const isDocumentRoot = (element: Element): boolean => {
		const tag = tagName(element);
		return tag === "HTML" || tag === "BODY";
	};
	const isInteractive = (element: Element): boolean => {
		if (interactiveTags.has(tagName(element))) return true;
		const role = element.getAttribute("role")?.trim();
		if (role && interactiveRoles.has(role)) return true;
		return element.hasAttribute("contenteditable");
	};
	const viewportArea = (): number => {
		const width = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1;
		const height = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 1;
		return width * height;
	};
	const isOversizedContainer = (element: Element): boolean => {
		if (isInteractive(element)) return false;
		try {
			const rect = element.getBoundingClientRect();
			const area = Math.max(0, rect.width) * Math.max(0, rect.height);
			return area >= viewportArea() * 0.8;
		} catch {
			return false;
		}
	};
	const accept = (element: Element | null): Element | null => {
		if (!element || isOverlay(element) || isDocumentRoot(element) || isOversizedContainer(element)) {
			return null;
		}
		return element;
	};
	const walk = (start: Element | null): Element | null => {
		let current: Element | null = start;
		while (current) {
			const chosen = accept(current);
			if (chosen) return chosen;
			current = current.parentElement;
		}
		return null;
	};

	const stack: Element[] = [];
	const pointX = event.clientX;
	const pointY = event.clientY;
	if (typeof document.elementsFromPoint === "function" && typeof pointX === "number" && typeof pointY === "number") {
		for (const node of document.elementsFromPoint(pointX, pointY)) {
			if (node instanceof Element) stack.push(node);
		}
	}
	const fallback = asElement(event.target);
	if (fallback && !stack.includes(fallback)) stack.push(fallback);

	for (const candidate of stack) {
		if (isOverlay(candidate) || isDocumentRoot(candidate)) continue;
		if (isInteractive(candidate)) return candidate;
	}
	for (const candidate of stack) {
		const chosen = walk(candidate);
		if (chosen) return chosen;
	}
	return null;
}
