// Copyright The Open Forge contributors.

/**
 * Web Crypto 与 Blob 在 TS 5.7+ 要求 `ArrayBuffer` 支撑的视图
 * （`Uint8Array<ArrayBuffer>`）；本模块的公开签名保持通用 `Uint8Array`，
 * 因为调用方可能传入 Node Buffer 视图。常规来源（TextEncoder、`new Uint8Array(n)`、
 * `Buffer.slice()`）都是 ArrayBuffer 支撑，因此这里零拷贝返回；只有
 * SharedArrayBuffer 支撑的视图才复制一次。
 */
export function toArrayBufferBacked(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	if (bytes.buffer instanceof ArrayBuffer) return bytes as Uint8Array<ArrayBuffer>;
	return new Uint8Array(bytes);
}
