import { extractVettaUserMessageClipboardImages } from "@/shared/clipboard";
import type { Base64Image } from "../persistImages";

interface ClipboardDataLike {
	readonly items: ArrayLike<DataTransferItem>;
	getData(format: string): string;
}

export interface VettaMessageClipboardImages {
	kind: "vetta-message";
	images: Base64Image[];
	messageText: string;
}

export type ClipboardImages = VettaMessageClipboardImages | { kind: "files"; files: File[] };

export function readVettaMessageClipboardImages(html: string, text: string): VettaMessageClipboardImages | null {
	const images = extractVettaUserMessageClipboardImages(html);
	return images.length > 0 ? { kind: "vetta-message", images, messageText: text } : null;
}

export function readClipboardImageFiles(clipboardData: Pick<ClipboardDataLike, "items">): File[] {
	return Array.from(clipboardData.items)
		.filter((item) => item.kind === "file" && item.type.startsWith("image/"))
		.map((item) => item.getAsFile())
		.filter((file): file is File => file !== null);
}

/**
 * 剪贴板里「不是图片」的文件项：资源管理器里复制的 pdf / md / 代码文件都是这种形态。
 *
 * 与 readClipboardImageFiles 互斥：图片有自己的落盘 + 缩略图 token 路径，
 * 两边各插一次同一份 File 会重复引用，所以这里显式把 image/* 排除掉。
 */
export function readClipboardReferenceFiles(clipboardData: Pick<ClipboardDataLike, "items">): File[] {
	return Array.from(clipboardData.items)
		.filter((item) => item.kind === "file" && !item.type.startsWith("image/"))
		.map((item) => item.getAsFile())
		.filter((file): file is File => file !== null);
}

export function readClipboardImages(clipboardData: ClipboardDataLike): ClipboardImages {
	// The native clipboard also exposes the first image as a file. Prefer the marked
	// HTML entry so a multi-image message does not duplicate that first image.
	const richMessage = readVettaMessageClipboardImages(
		clipboardData.getData("text/html"),
		clipboardData.getData("text/plain"),
	);
	if (richMessage) return richMessage;
	return { kind: "files", files: readClipboardImageFiles(clipboardData) };
}
