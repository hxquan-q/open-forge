// Copyright The Open Forge contributors.
import type { CanvasPreviewKind } from "./canvas-preview-kind";

/**
 * Canvas 划选快捷宏：把「选区 + 结构化指令」一键送进输入框，省掉用户手写提示词。
 *
 * 这里只有纯数据与选择规则，文案由宿主按 i18n key 解析；点击后的副作用（写附件、
 * 写输入框）留在 `useCanvasTabModel`，便于脱离 React 树测试可用宏集合。
 */
export type CanvasMacroId =
	| "add-comments"
	| "add-logs"
	| "fix-bugs"
	| "generate-tests"
	| "make-shorter"
	| "make-longer"
	| "polish";

export type CanvasMacroScope = "code" | "document";

export interface CanvasMacroDefinition {
	readonly id: CanvasMacroId;
	readonly scope: CanvasMacroScope;
	readonly icon: string;
}

export const CANVAS_MACROS: readonly CanvasMacroDefinition[] = [
	{ id: "add-comments", scope: "code", icon: "icon-[solar--chat-round-line-linear]" },
	{ id: "add-logs", scope: "code", icon: "icon-[solar--document-add-linear]" },
	{ id: "fix-bugs", scope: "code", icon: "icon-[solar--bug-linear]" },
	{ id: "generate-tests", scope: "code", icon: "icon-[solar--list-check-linear]" },
	{ id: "make-shorter", scope: "document", icon: "icon-[solar--minimize-square-linear]" },
	{ id: "make-longer", scope: "document", icon: "icon-[solar--arrow-right-up-linear]" },
	{ id: "polish", scope: "document", icon: "icon-[solar--magic-stick-3-linear]" },
];

/**
 * 可用宏跟随预览类型：代码 artifact 只给代码类宏，Markdown 只给文档类宏。
 * HTML 与 data-grid 没有就地编辑，也就不提供宏——避免用户点了一个改不了内容的按钮。
 */
export function availableCanvasMacros(kind: CanvasPreviewKind): readonly CanvasMacroDefinition[] {
	const scope: CanvasMacroScope | undefined = kind === "code" ? "code" : kind === "markdown" ? "document" : undefined;
	if (!scope) return [];
	return CANVAS_MACROS.filter((macro) => macro.scope === scope);
}

/** 只有 Markdown / 代码走就地编辑；HTML 走沙箱、data-grid 只读，都不提供编辑器。 */
export function isCanvasPreviewEditable(kind: CanvasPreviewKind): boolean {
	return kind === "markdown" || kind === "code";
}
