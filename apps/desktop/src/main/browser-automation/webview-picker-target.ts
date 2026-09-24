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

	// 用户物理点击的元素是点选意图的最强信号（TASK-0082）：只拒 picker overlay 与
	// 文档根，不做面积拒绝——全屏表格、canvas、带 onclick 的全屏容器都是合法 pick。
	const clickTarget = asElement(event.target);

	// 面积启发式（≥80% 视口的非交互元素）只作用于 walk 祖先链上的元素：
	// 链中遇到物理点击目标时豁免面积拒绝；其余 oversized 祖先跳过并继续向上，
	// 文档根与 overlay 仍被拒（BUG-0006 修复保持不变）。
	const walk = (start: Element): Element | null => {
		let current: Element | null = start;
		while (current) {
			if (!isOverlay(current) && !isDocumentRoot(current)) {
				if (current === clickTarget || !isOversizedContainer(current)) {
					return current;
				}
			}
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
	if (clickTarget && !stack.includes(clickTarget)) stack.push(clickTarget);

	// pass 1：elementsFromPoint 栈里最深的交互元素优先——透明全屏捕获层下的按钮
	// 仍按用户视觉意图选中按钮。
	for (const candidate of stack) {
		if (isOverlay(candidate) || isDocumentRoot(candidate)) continue;
		if (isInteractive(candidate)) return candidate;
	}
	// pass 2：沿祖先链回退。面积启发式只在这里拒祖先；点击目标自身豁免，
	// 因此空白容器区域回落到最深非 overlay 元素（含 oversized 容器），
	// 不再静默返回 null，文档根兜底拒绝。
	for (const candidate of stack) {
		const chosen = walk(candidate);
		if (chosen) return chosen;
	}
	return null;
}
