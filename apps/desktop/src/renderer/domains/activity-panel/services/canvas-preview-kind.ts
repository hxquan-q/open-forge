// Copyright The Open Forge contributors.
import { canvasDataGridExtension, resolveCanvasDataGridFormat } from "./canvas-data-grid";

/**
 * `data-grid` 只由 `text/csv`、`text/tab-separated-values`、`application/vnd.vetta.data-grid+json`
 * 与 `.csv` / `.tsv` 后缀触发；普通 `application/json` 与 `.json` 仍走 `code`。
 */
export type CanvasPreviewKind = "markdown" | "html" | "code" | "data-grid";

export function resolveCanvasPreviewKind(input: {
	readonly contentType?: string;
	readonly title?: string;
	readonly uri?: string;
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
	return "code";
}

export function canvasPreviewExtension(input: {
	readonly contentType?: string;
	readonly title?: string;
	readonly uri?: string;
}): string {
	const named = extensionOf(input.title) ?? extensionOf(input.uri);
	if (named) return named;
	const kind = resolveCanvasPreviewKind(input);
	if (kind === "html") return ".html";
	if (kind === "data-grid") return canvasDataGridExtension(resolveCanvasDataGridFormat(input));
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
