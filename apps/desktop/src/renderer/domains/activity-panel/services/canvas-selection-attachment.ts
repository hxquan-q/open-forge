// Copyright The Open Forge contributors.
import type { PluginPromptAttachment } from "@vetta-org/plugin-sdk";
import { definePluginPromptContext } from "@vetta-org/plugin-sdk";

export const CANVAS_ARTIFACT_SELECTION_SCHEMA = "vetta.canvas.artifact-selection";
export const CANVAS_ATTACHMENT_OWNER_ID = "builtin.canvas";
export const CANVAS_SELECTION_EXCERPT_LIMIT = 240;

export interface CanvasArtifactSelectionPayload {
	readonly artifactId: string;
	readonly version: number;
	readonly excerpt: string;
	readonly title: string;
	readonly kind: string;
	readonly contentType?: string;
	/**
	 * 表格选区在「过滤 + 排序结果」中的行列范围摘要，例如「第 3-7 行 · 第 2-4 列」。
	 * 可选且必须整体省略：PluginPromptContext 的 JSON 守卫不接受 `undefined` 值。
	 */
	readonly range?: string;
}

export function excerptCanvasSelection(text: string, limit = CANVAS_SELECTION_EXCERPT_LIMIT): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function createCanvasSelectionAttachment(
	payload: CanvasArtifactSelectionPayload,
): PluginPromptAttachment<CanvasArtifactSelectionPayload> {
	const excerpt = excerptCanvasSelection(payload.excerpt);
	const context = definePluginPromptContext({
		schema: CANVAS_ARTIFACT_SELECTION_SCHEMA,
		version: 1,
		payload: { ...payload, excerpt },
	});
	return {
		id: `canvas:${payload.artifactId}:v${payload.version}`,
		label: excerpt || payload.title,
		labels: excerpt ? [excerpt] : [payload.title],
		icon: "icon-[solar--notes-linear]",
		lifecycle: "once",
		context,
		instructions: [
			`The user attached a text selection from canvas artifact "${payload.title}" (artifactId=${payload.artifactId}, version=${payload.version}). Use the artifact tool to read or update this artifact. Do not recreate it as a new file.`,
		],
	};
}

export function readCanvasSelectionFromTarget(target: EventTarget | null): string {
	const selection = typeof window === "undefined" ? null : window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
	const root = target instanceof Element ? target : null;
	if (root && !selectionLivesInside(selection, root)) return "";
	return excerptCanvasSelection(selection.toString());
}

function selectionLivesInside(selection: Selection, root: Element): boolean {
	const range = selection.getRangeAt(0);
	return root.contains(range.commonAncestorContainer);
}
