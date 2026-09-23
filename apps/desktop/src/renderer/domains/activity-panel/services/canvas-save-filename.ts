// Copyright The Open Forge contributors.
import { canvasPreviewExtension } from "./canvas-preview-kind";

const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function suggestedCanvasSaveFileName(input: {
	readonly title: string;
	readonly contentType?: string;
	readonly uri?: string;
}): string {
	const raw = input.title.trim() || "artifact";
	const extension = canvasPreviewExtension(input);
	const base = raw.replace(UNSAFE_FILE_CHARS, "-").replace(/\.+$/, "");
	if (base.toLowerCase().endsWith(extension.toLowerCase())) return base;
	return `${base}${extension}`;
}

export function joinCanvasTargetPath(folder: string, fileName: string): string {
	const windows = folder.includes("\\") && !folder.includes("/");
	const trimmed = windows ? folder.replace(/\\+$/, "") : folder.replace(/\/+$/, "");
	return windows ? `${trimmed}\\${fileName}` : `${trimmed}/${fileName}`;
}
