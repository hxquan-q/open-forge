import { DEFAULT_SCRYPT_PARAMS, encryptGzipPayload, IV_LENGTH, SALT_LENGTH } from "./crypto.js";
import { fingerprintSessionPayload } from "./fingerprint.js";
import { type EncodedFrame, encodeAttachmentFrame, encodeFrames, encodeJsonFrame } from "./frames.js";
import { safePath } from "./safe-path.js";
import {
	SESSION_ARCHIVE_CIPHER,
	SESSION_ARCHIVE_FORMAT,
	SESSION_ARCHIVE_FORMAT_VERSION,
	SESSION_ARCHIVE_FRAME,
	SESSION_ARCHIVE_KDF,
	SESSION_ARCHIVE_MAGIC,
	type SessionArchiveEncodeInput,
	type SessionArchiveFileMetadata,
} from "./types.js";

export async function encodeSessionArchive(input: SessionArchiveEncodeInput): Promise<Uint8Array> {
	if (input.sessions.length === 0) {
		throw new Error("Session archive requires at least one session");
	}

	const frames: EncodedFrame[] = [];
	for (const session of input.sessions) {
		const fingerprint = await fingerprintSessionPayload(session.fingerprintSource);
		frames.push(
			encodeJsonFrame(SESSION_ARCHIVE_FRAME.SESSION, {
				sessionId: session.sessionId,
				conversationId: session.conversationId,
				name: session.name,
				cwd: session.cwd,
				createdAt: session.createdAt,
				fingerprint,
			}),
		);
		for (const record of session.records) {
			frames.push(encodeJsonFrame(SESSION_ARCHIVE_FRAME.RECORD, record));
		}
		for (const attachment of session.attachments ?? []) {
			const relativePath = safePath(attachment.relativePath);
			frames.push(
				encodeAttachmentFrame(
					{
						id: attachment.id,
						relativePath,
						mimeType: attachment.mimeType,
						byteLength: attachment.bytes.byteLength,
					},
					attachment.bytes,
				),
			);
		}
	}

	const plain = encodeFrames(frames);
	const { salt, iv, ciphertext } = await encryptGzipPayload(plain, input.passphrase, {
		randomBytes: input.randomBytes,
		scryptParams: DEFAULT_SCRYPT_PARAMS,
	});

	const metadata: SessionArchiveFileMetadata = {
		format: SESSION_ARCHIVE_FORMAT,
		formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
		cipher: SESSION_ARCHIVE_CIPHER,
		kdf: SESSION_ARCHIVE_KDF,
		appVersion: input.appVersion,
		sessionCount: input.sessions.length,
		createdAt: input.createdAt ?? new Date().toISOString(),
		scrypt: {
			N: DEFAULT_SCRYPT_PARAMS.N,
			r: DEFAULT_SCRYPT_PARAMS.r,
			p: DEFAULT_SCRYPT_PARAMS.p,
			dkLen: DEFAULT_SCRYPT_PARAMS.dkLen,
			saltLength: SALT_LENGTH,
		},
	};

	const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
	const header = new Uint8Array(
		SESSION_ARCHIVE_MAGIC.byteLength + 2 + 4 + metaBytes.byteLength + SALT_LENGTH + IV_LENGTH,
	);
	let offset = 0;
	header.set(SESSION_ARCHIVE_MAGIC, offset);
	offset += SESSION_ARCHIVE_MAGIC.byteLength;
	const view = new DataView(header.buffer);
	view.setUint16(offset, SESSION_ARCHIVE_FORMAT_VERSION, false);
	offset += 2;
	view.setUint32(offset, metaBytes.byteLength, false);
	offset += 4;
	header.set(metaBytes, offset);
	offset += metaBytes.byteLength;
	header.set(salt, offset);
	offset += SALT_LENGTH;
	header.set(iv, offset);

	const out = new Uint8Array(header.byteLength + ciphertext.byteLength);
	out.set(header, 0);
	out.set(ciphertext, header.byteLength);
	return out;
}
