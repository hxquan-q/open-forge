import { toArrayBufferBacked } from "./bytes.js";
import { SESSION_ARCHIVE_ERROR_CODES, SessionArchiveError } from "./errors.js";
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams, scrypt } from "./scrypt.js";

export const IV_LENGTH = 12;
export const SALT_LENGTH = 16;

export { DEFAULT_SCRYPT_PARAMS, type ScryptParams };

function utf8(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

export function defaultRandomBytes(size: number): Uint8Array {
	const out = new Uint8Array(size);
	crypto.getRandomValues(out);
	return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, params: ScryptParams) {
	const raw = await scrypt(utf8(passphrase), salt, params);
	return crypto.subtle.importKey("raw", toArrayBufferBacked(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** gzip then AES-256-GCM; authentication covers the compressed payload. */
export async function encryptGzipPayload(
	plain: Uint8Array,
	passphrase: string,
	options?: {
		readonly salt?: Uint8Array;
		readonly iv?: Uint8Array;
		readonly scryptParams?: ScryptParams;
		readonly randomBytes?: (size: number) => Uint8Array;
	},
): Promise<{ readonly salt: Uint8Array; readonly iv: Uint8Array; readonly ciphertext: Uint8Array }> {
	const randomBytes = options?.randomBytes ?? defaultRandomBytes;
	const salt = options?.salt ?? randomBytes(SALT_LENGTH);
	const iv = options?.iv ?? randomBytes(IV_LENGTH);
	const params = options?.scryptParams ?? DEFAULT_SCRYPT_PARAMS;
	const compressed = await gzipBytes(plain);
	const key = await deriveAesKey(passphrase, salt, params);
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: toArrayBufferBacked(iv) },
		key,
		toArrayBufferBacked(compressed),
	);
	return { salt, iv, ciphertext: new Uint8Array(sealed) };
}

export async function decryptGzipPayload(
	ciphertext: Uint8Array,
	passphrase: string,
	salt: Uint8Array,
	iv: Uint8Array,
	scryptParams: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<Uint8Array> {
	const key = await deriveAesKey(passphrase, salt, scryptParams);
	let decrypted: ArrayBuffer;
	try {
		decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: toArrayBufferBacked(iv) },
			key,
			toArrayBufferBacked(ciphertext),
		);
	} catch (error) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.AUTH_FAILED,
			"Session archive authentication failed (wrong passphrase or tampered bytes)",
			{ cause: error },
		);
	}
	try {
		return await gunzipBytes(new Uint8Array(decrypted));
	} catch (error) {
		throw new SessionArchiveError(
			SESSION_ARCHIVE_ERROR_CODES.DECOMPRESS_FAILED,
			"Session archive gzip payload could not be decompressed",
			{ cause: error },
		);
	}
}

async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([toArrayBufferBacked(input)]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(input: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([toArrayBufferBacked(input)]).stream().pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
