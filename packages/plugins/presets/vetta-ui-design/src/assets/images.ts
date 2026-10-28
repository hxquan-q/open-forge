// Copyright The Open Forge contributors.
import type { PluginNetworkApi } from "@vetta-org/plugin-sdk";
import { type AssetCandidate, AssetError, assetUrl } from "./sources";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 16_384;
const IMPORT_EDGE = 2048;
export interface LocalImage {
	base64: string;
	mime: "image/png" | "image/jpeg" | "image/webp";
	extension: "png" | "jpg" | "webp";
	width: number;
	height: number;
	transformed: boolean;
}
export function bytesFromBase64(value: unknown): Uint8Array {
	if (
		typeof value !== "string" ||
		value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
	)
		throw new AssetError("invalid-image", "Invalid or oversized base64 image response.");
	const binary = atob(value);
	if (!binary.length || binary.length > MAX_IMAGE_BYTES)
		throw new AssetError("image-too-large", "Image must be nonempty and no larger than 8 MiB.");
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export function base64FromBytes(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}
/** Check dimensions before decoding to bound memory use, not just compressed byte count. */
export function rasterHeader(
	bytes: Uint8Array,
	contentType: string,
): { mime: "image/png" | "image/jpeg"; extension: "png" | "jpg"; width: number; height: number } {
	let width = 0;
	let height = 0;
	let mime: "image/png" | "image/jpeg";
	let extension: "png" | "jpg";
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (
		bytes.length >= 33 &&
		[137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
		view.getUint32(8) === 13 &&
		view.getUint32(12) === 0x49484452
	) {
		mime = "image/png";
		extension = "png";
		width = view.getUint32(16);
		height = view.getUint32(20);
	} else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		mime = "image/jpeg";
		extension = "jpg";
		let offset = 2;
		while (offset + 4 <= bytes.length) {
			if (bytes[offset] !== 0xff) break;
			const marker = bytes[offset + 1];
			if (marker === 0xda || marker === 0xd9) break;
			const length = view.getUint16(offset + 2);
			if (length < 2 || offset + length + 2 > bytes.length) break;
			if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
				height = view.getUint16(offset + 5);
				width = view.getUint16(offset + 7);
				break;
			}
			offset += length + 2;
		}
	} else
		throw new AssetError(
			"unsupported-image",
			"Only decoded JPEG/PNG rasters are accepted; SVG, HTML and disguised files are rejected.",
		);
	if (contentType.split(";", 1)[0].trim().toLowerCase() !== mime)
		throw new AssetError("invalid-image-type", "Image MIME type does not match its file signature.");
	if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS)
		throw new AssetError("image-dimensions", "Image dimensions are missing or exceed 16,384 pixels / 40 megapixels.");
	return { mime, extension, width, height };
}
async function normalizeImage(bytes: Uint8Array, contentType: string, maxEdge: number): Promise<LocalImage> {
	const header = rasterHeader(bytes, contentType);
	if (typeof createImageBitmap !== "function")
		throw new AssetError(
			"decoder-unavailable",
			"Image decoding is unavailable. Retry from the design plugin renderer; no file was imported.",
		);
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: header.mime }));
	} catch {
		throw new AssetError("invalid-image", "The raster cannot be decoded; no asset was written.");
	}
	try {
		if (
			!bitmap.width ||
			!bitmap.height ||
			bitmap.width > MAX_EDGE ||
			bitmap.height > MAX_EDGE ||
			bitmap.width * bitmap.height > MAX_PIXELS
		)
			throw new AssetError("image-dimensions", "Decoded dimensions exceed the image limits.");
		const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		if (scale === 1) return { ...header, width, height, base64: base64FromBytes(bytes), transformed: false };
		if (typeof OffscreenCanvas !== "function")
			throw new AssetError("decoder-unavailable", "Image resizing is unavailable; choose a smaller image.");
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new AssetError("decoder-unavailable", "Image resizing is unavailable.");
		context.drawImage(bitmap, 0, 0, width, height);
		const encoded = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
		if (encoded.type !== "image/webp" || !encoded.size || encoded.size > MAX_IMAGE_BYTES)
			throw new AssetError("invalid-image", "Image encoder did not produce a bounded WebP image.");
		return {
			base64: base64FromBytes(new Uint8Array(await encoded.arrayBuffer())),
			mime: "image/webp",
			extension: "webp",
			width,
			height,
			transformed: true,
		};
	} finally {
		bitmap.close();
	}
}
export async function downloadAsset(
	network: PluginNetworkApi,
	candidate: AssetCandidate,
	preview = false,
): Promise<LocalImage> {
	const url =
		candidate.source === "wikimedia"
			? assetUrl(
					preview ? candidate.previewUrl : candidate.downloadUrl,
					["upload.wikimedia.org", "thumb.wikimedia.org"],
					"/wikipedia/commons/",
				)
			: assetUrl(
					preview ? candidate.previewUrl : candidate.downloadUrl,
					["images-assets.nasa.gov"],
					`/image/${candidate.id}/`,
				);
	// Host validates every redirect against the exact manifest hosts and bounds the transport to 32 MiB.
	// The public SDK exposes neither redirect chain nor DNS/IP pinning; never claim those guarantees here.
	const response = await network.request<unknown>({ url, responseType: "base64", timeoutMs: 20_000 });
	if (!response.ok)
		throw new AssetError(
			"download-failed",
			`Image download returned HTTP ${response.status}; search again or retry.`,
		);
	const headers = Object.fromEntries(
		Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	if (Number(headers["content-length"]) > MAX_IMAGE_BYTES)
		throw new AssetError("image-too-large", "Image exceeds the 8 MiB import limit.");
	return normalizeImage(bytesFromBase64(response.body), headers["content-type"] ?? "", preview ? 640 : IMPORT_EDGE);
}
