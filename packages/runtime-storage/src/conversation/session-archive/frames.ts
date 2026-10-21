import { SESSION_ARCHIVE_ERROR_CODES, SessionArchiveError } from "./errors.js";
import { SESSION_ARCHIVE_FRAME, type SessionArchiveFrameKind } from "./types.js";

const TEXT = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export interface EncodedFrame {
	readonly kind: SessionArchiveFrameKind;
	readonly payload: Uint8Array;
}

export function encodeFrames(frames: readonly EncodedFrame[]): Uint8Array {
	let total = 0;
	for (const frame of frames) {
		total += 1 + 4 + frame.payload.byteLength;
	}
	const out = new Uint8Array(total);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	let offset = 0;
	for (const frame of frames) {
		out[offset] = frame.kind;
		view.setUint32(offset + 1, frame.payload.byteLength, false);
		out.set(frame.payload, offset + 5);
		offset += 5 + frame.payload.byteLength;
	}
	return out;
}

export function decodeFrames(bytes: Uint8Array): EncodedFrame[] {
	const frames: EncodedFrame[] = [];
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;
	while (offset < bytes.byteLength) {
		if (offset + 5 > bytes.byteLength) {
			throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Truncated frame header");
		}
		const kind = bytes[offset]! as SessionArchiveFrameKind;
		const length = view.getUint32(offset + 1, false);
		offset += 5;
		if (offset + length > bytes.byteLength) {
			throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Truncated frame payload");
		}
		if (
			kind !== SESSION_ARCHIVE_FRAME.SESSION &&
			kind !== SESSION_ARCHIVE_FRAME.RECORD &&
			kind !== SESSION_ARCHIVE_FRAME.ATTACHMENT &&
			kind !== SESSION_ARCHIVE_FRAME.WORKSPACE_FILE
		) {
			throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, `Unknown frame kind: ${kind}`);
		}
		frames.push({ kind, payload: bytes.subarray(offset, offset + length) });
		offset += length;
	}
	return frames;
}

export function encodeJsonFrame(kind: SessionArchiveFrameKind, value: unknown): EncodedFrame {
	return { kind, payload: TEXT.encode(JSON.stringify(value)) };
}

export function decodeJsonPayload(payload: Uint8Array): unknown {
	try {
		return JSON.parse(TEXT_DECODER.decode(payload)) as unknown;
	} catch (error) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Frame JSON is invalid", {
			cause: error,
		});
	}
}

/** Attachment frame: u32 BE metaLen + meta JSON + raw bytes. */
export function encodeAttachmentFrame(
	meta: {
		readonly id: string;
		readonly relativePath: string;
		readonly mimeType?: string;
		readonly byteLength: number;
	},
	bytes: Uint8Array,
): EncodedFrame {
	if (meta.byteLength !== bytes.byteLength) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			"Attachment meta byteLength does not match payload",
		);
	}
	const metaBytes = TEXT.encode(JSON.stringify(meta));
	const payload = new Uint8Array(4 + metaBytes.byteLength + bytes.byteLength);
	new DataView(payload.buffer).setUint32(0, metaBytes.byteLength, false);
	payload.set(metaBytes, 4);
	payload.set(bytes, 4 + metaBytes.byteLength);
	return { kind: SESSION_ARCHIVE_FRAME.ATTACHMENT, payload };
}

export function decodeAttachmentFrame(payload: Uint8Array): {
	readonly meta: {
		readonly id: string;
		readonly relativePath: string;
		readonly mimeType?: string;
		readonly byteLength: number;
	};
	readonly bytes: Uint8Array;
} {
	if (payload.byteLength < 4) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Attachment frame too short");
	}
	const metaLen = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, false);
	if (4 + metaLen > payload.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Attachment meta truncated");
	}
	const metaRaw = decodeJsonPayload(payload.subarray(4, 4 + metaLen));
	if (!isAttachmentMeta(metaRaw)) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Attachment meta shape invalid");
	}
	const bytes = payload.subarray(4 + metaLen);
	if (bytes.byteLength !== metaRaw.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Attachment bytes length mismatch");
	}
	return { meta: metaRaw, bytes };
}

function isAttachmentMeta(value: unknown): value is {
	readonly id: string;
	readonly relativePath: string;
	readonly mimeType?: string;
	readonly byteLength: number;
} {
	if (value === null || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.relativePath === "string" &&
		typeof record.byteLength === "number" &&
		Number.isInteger(record.byteLength) &&
		record.byteLength >= 0 &&
		(record.mimeType === undefined || typeof record.mimeType === "string")
	);
}

/**
 * Workspace file frame (v2 migration): same u32 BE metaLen + meta JSON + raw bytes
 * layout as the attachment frame, but the meta carries only relativePath/byteLength.
 */
export function encodeWorkspaceFileFrame(
	meta: {
		readonly relativePath: string;
		readonly byteLength: number;
	},
	bytes: Uint8Array,
): EncodedFrame {
	if (meta.byteLength !== bytes.byteLength) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME,
			"Workspace file meta byteLength does not match payload",
		);
	}
	const metaBytes = TEXT.encode(JSON.stringify(meta));
	const payload = new Uint8Array(4 + metaBytes.byteLength + bytes.byteLength);
	new DataView(payload.buffer).setUint32(0, metaBytes.byteLength, false);
	payload.set(metaBytes, 4);
	payload.set(bytes, 4 + metaBytes.byteLength);
	return { kind: SESSION_ARCHIVE_FRAME.WORKSPACE_FILE, payload };
}

export function decodeWorkspaceFileFrame(payload: Uint8Array): {
	readonly meta: {
		readonly relativePath: string;
		readonly byteLength: number;
	};
	readonly bytes: Uint8Array;
} {
	if (payload.byteLength < 4) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Workspace file frame too short");
	}
	const metaLen = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, false);
	if (4 + metaLen > payload.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Workspace file meta truncated");
	}
	const metaRaw = decodeJsonPayload(payload.subarray(4, 4 + metaLen));
	if (!isWorkspaceFileMeta(metaRaw)) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Workspace file meta shape invalid");
	}
	const bytes = payload.subarray(4 + metaLen);
	if (bytes.byteLength !== metaRaw.byteLength) {
		throw new SessionArchiveError(SESSION_ARCHIVE_ERROR_CODES.INVALID_FRAME, "Workspace file bytes length mismatch");
	}
	return { meta: metaRaw, bytes };
}

function isWorkspaceFileMeta(value: unknown): value is {
	readonly relativePath: string;
	readonly byteLength: number;
} {
	if (value === null || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.relativePath === "string" &&
		typeof record.byteLength === "number" &&
		Number.isInteger(record.byteLength) &&
		record.byteLength >= 0
	);
}
