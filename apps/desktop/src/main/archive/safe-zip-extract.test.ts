// Copyright The Open Forge contributors.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertSafeZipEntryAttributes,
	extractZipArchiveSafely,
	isPathContained,
	normalizeZipEntryPath,
	UnsafeZipArchiveError,
} from "./safe-zip-extract.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) await rm(dir, { recursive: true, force: true });
	}
});

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "safe-zip-extract-"));
	tempDirs.push(dir);
	return dir;
}

function crc32(data: Buffer): number {
	let value = ~0;
	for (let i = 0; i < data.length; i += 1) {
		value ^= data[i];
		for (let bit = 0; bit < 8; bit += 1) {
			value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
		}
	}
	return ~value >>> 0;
}

/** Build a stored (uncompressed) ZIP that preserves attacker-controlled entry names. */
function craftStoredZip(entries: Array<{ name: string; content: string }>): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, "utf8");
		const data = Buffer.from(entry.content);
		const checksum = crc32(data);
		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		name.copy(local, 30);
		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		name.copy(central, 46);
		locals.push(local, data);
		centrals.push(central);
		offset += local.length + data.length;
	}
	const centralDirectory = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(centralDirectory.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, centralDirectory, eocd]);
}

function zipWithEntry(entryName: string, content = "payload"): Buffer {
	const archive = new AdmZip();
	archive.addFile(entryName, Buffer.from(content));
	return archive.toBuffer();
}

describe("normalizeZipEntryPath", () => {
	it("accepts nested relative paths", () => {
		expect(normalizeZipEntryPath("demo/plugin.json")).toBe("demo/plugin.json");
		expect(normalizeZipEntryPath("demo\\plugin.json")).toBe("demo/plugin.json");
	});

	it("rejects Zip Slip traversal and absolute entry names", () => {
		expect(() => normalizeZipEntryPath("../escape.txt")).toThrow(UnsafeZipArchiveError);
		expect(() => normalizeZipEntryPath("a/../../escape.txt")).toThrow(UnsafeZipArchiveError);
		expect(() => normalizeZipEntryPath("/etc/passwd")).toThrow(UnsafeZipArchiveError);
		expect(() => normalizeZipEntryPath("C:/Windows/System32/evil.dll")).toThrow(UnsafeZipArchiveError);
		expect(() => normalizeZipEntryPath("evil\0.txt")).toThrow(UnsafeZipArchiveError);
	});
});

describe("isPathContained", () => {
	it("keeps destinations inside the extraction root", () => {
		const root = join(tmpdir(), "zip-root");
		expect(isPathContained(root, join(root, "ok.txt"))).toBe(true);
		expect(isPathContained(root, join(root, "nested", "ok.txt"))).toBe(true);
		expect(isPathContained(root, join(root, "..", "outside.txt"))).toBe(false);
	});
});

describe("assertSafeZipEntryAttributes", () => {
	it("rejects encrypted entries and Unix symlink mode bits", () => {
		expect(() => assertSafeZipEntryAttributes({ entryName: "secret", attr: 0, header: { flags: 1 } })).toThrow(
			/Encrypted/,
		);
		expect(() =>
			assertSafeZipEntryAttributes({
				entryName: "escape-link",
				attr: (0o120000 << 16) | 0o777,
				header: { flags: 0 },
			}),
		).toThrow(/Symlink/);
		expect(() =>
			assertSafeZipEntryAttributes({
				entryName: "ok.txt",
				attr: (0o100644 << 16) | 0o644,
				header: { flags: 0 },
			}),
		).not.toThrow();
	});
});

describe("extractZipArchiveSafely", () => {
	it("extracts a legitimate plugin-style archive under the destination directory", async () => {
		const targetDir = await createTempDir();
		const buffer = zipWithEntry("demo/plugin.json", '{"id":"demo"}');

		await extractZipArchiveSafely(buffer, targetDir);

		await expect(readFile(join(targetDir, "demo", "plugin.json"), "utf8")).resolves.toBe('{"id":"demo"}');
	});

	it("rejects Zip Slip entries that would write outside the destination", async () => {
		const targetDir = await createTempDir();
		const outside = join(targetDir, "..", `zip-slip-sentinel-${Date.now()}.txt`);
		const buffer = craftStoredZip([{ name: "../zip-slip-sentinel.txt", content: "pwned" }]);

		await expect(extractZipArchiveSafely(buffer, targetDir)).rejects.toThrow(UnsafeZipArchiveError);
		await expect(readFile(outside, "utf8")).rejects.toThrow();
	});

	it("rejects duplicate entry names", async () => {
		const targetDir = await createTempDir();
		const buffer = craftStoredZip([
			{ name: "same.txt", content: "one" },
			{ name: "same.txt", content: "two" },
		]);

		await expect(extractZipArchiveSafely(buffer, targetDir)).rejects.toThrow(/Duplicate/);
	});

	it("rejects archives that declare more uncompressed bytes than the configured cap", async () => {
		const targetDir = await createTempDir();
		const buffer = zipWithEntry("big.txt", "tiny");

		await expect(extractZipArchiveSafely(buffer, targetDir, { maxUncompressedBytes: 1 })).rejects.toThrow(
			/size limit/,
		);
	});
});
