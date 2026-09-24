// Copyright The Open Forge contributors.
import { canvasDataGridExtension, resolveCanvasDataGridFormat } from "./canvas-data-grid";

/** 声明式原生组件的 contentType：模型输出结构化 JSON 即可获得高带宽呈现。 */
export const CANVAS_CHART_CONTENT_TYPE = "application/vnd.vetta.chart+json";
export const CANVAS_CHECKLIST_CONTENT_TYPE = "application/vnd.vetta.checklist+json";
export const CANVAS_DIFF_CONTENT_TYPE = "text/x-diff";

/**
 * 预览分支：
 * - `data-grid`：CSV / TSV / 行列 JSON 表格
 * - `chart`：声明式图表（line / bar / pie / area）
 * - `diff`：Unified Diff（`text/x-diff` 或 `kind: "code-change"`）
 * - `checklist`：任务 / 评测清单
 *
 * 判定只认显式 contentType（`.json` 后缀仍走 `code`），未知类型一律回落 `code`。
 */
export type CanvasPreviewKind = "markdown" | "html" | "code" | "data-grid" | "chart" | "diff" | "checklist";

export function resolveCanvasPreviewKind(input: {
	readonly contentType?: string;
	readonly title?: string;
	readonly uri?: string;
	readonly kind?: string;
}): CanvasPreviewKind {
	const contentType = input.contentType?.toLowerCase() ?? "";
	const name = `${input.title ?? ""} ${input.uri ?? ""}`.toLowerCase();
	if (
		contentType === "text/html" ||
		contentType === "application/xhtml+xml" ||
		name.includes(".html") ||
		name.includes(".htm")
	) {
		return "html";
	}
	if (
		contentType.startsWith("text/markdown") ||
		contentType === "text/md" ||
		name.includes(".md") ||
		name.includes(".markdown")
	) {
		return "markdown";
	}
	if (resolveCanvasDataGridFormat(input)) return "data-grid";
	if (contentType === CANVAS_CHART_CONTENT_TYPE) return "chart";
	if (contentType === CANVAS_CHECKLIST_CONTENT_TYPE) return "checklist";
	if (contentType === CANVAS_DIFF_CONTENT_TYPE || input.kind === "code-change") return "diff";
	return "code";
}

export function canvasPreviewExtension(input: {
	readonly contentType?: string;
	readonly title?: string;
	readonly uri?: string;
	readonly kind?: string;
}): string {
	const named = extensionOf(input.title) ?? extensionOf(input.uri);
	if (named) return named;
	const kind = resolveCanvasPreviewKind(input);
	if (kind === "html") return ".html";
	if (kind === "data-grid") return canvasDataGridExtension(resolveCanvasDataGridFormat(input));
	if (kind === "diff") return ".diff";
	if (kind === "chart" || kind === "checklist") return ".json";
	if (kind === "code") return contentTypeExtension(input.contentType) ?? ".txt";
	return ".md";
}

function extensionOf(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const match = /\.([A-Za-z0-9]+)$/.exec(value.split(/[\\/]/).pop() ?? "");
	return match ? `.${match[1]}` : undefined;
}

function contentTypeExtension(contentType: string | undefined): string | undefined {
	if (contentType === "application/json") return ".json";
	if (contentType === "text/css") return ".css";
	if (contentType === "text/javascript" || contentType === "application/javascript") return ".js";
	if (contentType === "text/typescript" || contentType === "application/typescript") return ".ts";
	if (contentType === "text/plain") return ".txt";
	return undefined;
}
