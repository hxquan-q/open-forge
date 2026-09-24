/**
 * RFC 7914 scrypt (platform-neutral). Used only to derive AES-256 keys for archives.
 */

import { toArrayBufferBacked } from "./bytes.js";

function rotl(a: number, b: number): number {
	return (a << b) | (a >>> (32 - b));
}

/** salsa20/8 core on 16 little-endian words (in-place). */
function salsa20_8(B: Uint32Array): void {
	const x0 = B[0]!,
		x1 = B[1]!,
		x2 = B[2]!,
		x3 = B[3]!,
		x4 = B[4]!,
		x5 = B[5]!,
		x6 = B[6]!,
		x7 = B[7]!,
		x8 = B[8]!,
		x9 = B[9]!,
		x10 = B[10]!,
		x11 = B[11]!,
		x12 = B[12]!,
		x13 = B[13]!,
		x14 = B[14]!,
		x15 = B[15]!;
	let z0 = x0,
		z1 = x1,
		z2 = x2,
		z3 = x3,
		z4 = x4,
		z5 = x5,
		z6 = x6,
		z7 = x7,
		z8 = x8,
		z9 = x9,
		z10 = x10,
		z11 = x11,
		z12 = x12,
		z13 = x13,
		z14 = x14,
		z15 = x15;

	for (let i = 0; i < 8; i += 2) {
		z4 ^= rotl((z0 + z12) | 0, 7);
		z8 ^= rotl((z4 + z0) | 0, 9);
		z12 ^= rotl((z8 + z4) | 0, 13);
		z0 ^= rotl((z12 + z8) | 0, 18);
		z9 ^= rotl((z5 + z1) | 0, 7);
		z13 ^= rotl((z9 + z5) | 0, 9);
		z1 ^= rotl((z13 + z9) | 0, 13);
		z5 ^= rotl((z1 + z13) | 0, 18);
		z14 ^= rotl((z10 + z6) | 0, 7);
		z2 ^= rotl((z14 + z10) | 0, 9);
		z6 ^= rotl((z2 + z14) | 0, 13);
		z10 ^= rotl((z6 + z2) | 0, 18);
		z3 ^= rotl((z15 + z11) | 0, 7);
		z7 ^= rotl((z3 + z15) | 0, 9);
		z11 ^= rotl((z7 + z3) | 0, 13);
		z15 ^= rotl((z11 + z7) | 0, 18);
		z1 ^= rotl((z0 + z3) | 0, 7);
		z2 ^= rotl((z1 + z0) | 0, 9);
		z3 ^= rotl((z2 + z1) | 0, 13);
		z0 ^= rotl((z3 + z2) | 0, 18);
		z6 ^= rotl((z5 + z4) | 0, 7);
		z7 ^= rotl((z6 + z5) | 0, 9);
		z4 ^= rotl((z7 + z6) | 0, 13);
		z5 ^= rotl((z4 + z7) | 0, 18);
		z11 ^= rotl((z10 + z9) | 0, 7);
		z8 ^= rotl((z11 + z10) | 0, 9);
		z9 ^= rotl((z8 + z11) | 0, 13);
		z10 ^= rotl((z9 + z8) | 0, 18);
		z12 ^= rotl((z15 + z14) | 0, 7);
		z13 ^= rotl((z12 + z15) | 0, 9);
		z14 ^= rotl((z13 + z12) | 0, 13);
		z15 ^= rotl((z14 + z13) | 0, 18);
	}

	B[0] = (z0 + x0) | 0;
	B[1] = (z1 + x1) | 0;
	B[2] = (z2 + x2) | 0;
	B[3] = (z3 + x3) | 0;
	B[4] = (z4 + x4) | 0;
	B[5] = (z5 + x5) | 0;
	B[6] = (z6 + x6) | 0;
	B[7] = (z7 + x7) | 0;
	B[8] = (z8 + x8) | 0;
	B[9] = (z9 + x9) | 0;
	B[10] = (z10 + x10) | 0;
	B[11] = (z11 + x11) | 0;
	B[12] = (z12 + x12) | 0;
	B[13] = (z13 + x13) | 0;
	B[14] = (z14 + x14) | 0;
	B[15] = (z15 + x15) | 0;
}

function blockMix(B: Uint32Array, r: number, Y: Uint32Array): void {
	const X = new Uint32Array(16);
	X.set(B.subarray((2 * r - 1) * 16, 2 * r * 16));
	for (let i = 0; i < 2 * r; i++) {
		for (let j = 0; j < 16; j++) {
			X[j]! ^= B[i * 16 + j];
		}
		salsa20_8(X);
		Y.set(X, i * 16);
	}
	for (let i = 0; i < r; i++) {
		B.set(Y.subarray(i * 2 * 16, i * 2 * 16 + 16), i * 16);
	}
	for (let i = 0; i < r; i++) {
		B.set(Y.subarray((i * 2 + 1) * 16, (i * 2 + 1) * 16 + 16), (i + r) * 16);
	}
}

function integerify(B: Uint32Array, r: number): number {
	return B[(2 * r - 1) * 16]! >>> 0;
}

function smix(B: Uint8Array, N: number, r: number): void {
	const blockWords = 32 * r;
	const X = new Uint32Array(blockWords);
	const Y = new Uint32Array(blockWords);
	const V = new Uint32Array(N * blockWords);
	const view = new DataView(B.buffer, B.byteOffset, B.byteLength);

	for (let i = 0; i < blockWords; i++) {
		X[i] = view.getUint32(i * 4, true);
	}

	for (let i = 0; i < N; i++) {
		V.set(X, i * blockWords);
		blockMix(X, r, Y);
	}
	for (let i = 0; i < N; i++) {
		const j = integerify(X, r) % N;
		const vOff = j * blockWords;
		for (let k = 0; k < blockWords; k++) {
			X[k]! ^= V[vOff + k];
		}
		blockMix(X, r, Y);
	}

	for (let i = 0; i < blockWords; i++) {
		view.setUint32(i * 4, X[i]!, true);
	}
}

async function pbkdf2Sha256(
	password: Uint8Array,
	salt: Uint8Array,
	iterations: number,
	dkLen: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", toArrayBufferBacked(password), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: toArrayBufferBacked(salt), iterations },
		key,
		dkLen * 8,
	);
	return new Uint8Array(bits);
}

export interface ScryptParams {
	readonly N: number;
	readonly r: number;
	readonly p: number;
	readonly dkLen: number;
}

/** Interactive archive defaults (≈16 MiB memory). */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
	N: 16_384,
	r: 8,
	p: 1,
	dkLen: 32,
};

export async function scrypt(
	password: Uint8Array,
	salt: Uint8Array,
	params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<Uint8Array> {
	const { N, r, p, dkLen } = params;
	if (N < 2 || (N & (N - 1)) !== 0) {
		throw new Error("scrypt N must be a power of two >= 2");
	}
	const blockSize = 128 * r;
	const B = await pbkdf2Sha256(password, salt, 1, blockSize * p);
	for (let i = 0; i < p; i++) {
		smix(B.subarray(i * blockSize, (i + 1) * blockSize), N, r);
	}
	return pbkdf2Sha256(password, B, 1, dkLen);
}
