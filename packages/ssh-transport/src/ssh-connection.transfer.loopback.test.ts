// Copyright The Open Forge contributors.
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SshOperationAbortedError, SshRemoteCommandError } from "./errors.js";
import { createLoopbackSshConnection, toLoopbackRemotePath } from "./testing.js";

/** 「远端」路径统一 MSYS 根形式，与其它回环套件一致。 */
function remote(path: string): string {
	return toLoopbackRemotePath(path);
}

function createLocalDirectory(): string {
	return realpathSync(mkdtempSync(join(tmpdir(), "vetta-transfer-")));
}

/** 真实文件读侧：桌面服务的上传最终就是这样按 offset 读块的。 */
async function openReader(path: string): Promise<{
	readChunk: (offset: number, length: number) => Promise<Uint8Array>;
	close: () => Promise<void>;
}> {
	const handle = await open(path, "r");
	return {
		readChunk: async (offset, length) => {
			const buffer = new Uint8Array(new ArrayBuffer(length));
			const { bytesRead } = await handle.read(buffer, 0, length, offset);
			return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
		},
		close: () => handle.close(),
	};
}

const MEGABYTE = 1024 * 1024;

describe("SshConnection 流式文件传输（回环 SSH）", () => {
	it("大文件下载逐字节一致，进度单调递增到总长", async () => {
		const dir = createLocalDirectory();
		const content = randomBytes(4 * MEGABYTE + 12345); // 跨多个 1 MiB 通道写块，还有不齐的尾巴
		const source = join(dir, "download.bin");
		writeFileSync(source, content);
		const connection = createLoopbackSshConnection("transfer-dl");

		const chunks: Buffer[] = [];
		const progress: number[] = [];
		await connection.downloadFile(remote(source), (chunk) => chunks.push(Buffer.from(chunk)), {
			onProgress: (bytes) => progress.push(bytes),
		});
		expect(Buffer.concat(chunks).equals(content)).toBe(true);
		expect(progress.at(-1)).toBe(content.byteLength);
		expect(progress).toEqual([...progress].sort((a, b) => a - b));
	});

	it("大文件上传逐字节一致，进度单调递增到总长", async () => {
		const dir = createLocalDirectory();
		const content = randomBytes(4 * MEGABYTE + 12345);
		const source = join(dir, "upload.bin");
		writeFileSync(source, content);
		const targetDir = createLocalDirectory();
		const connection = createLoopbackSshConnection("transfer-ul");

		const progress: number[] = [];
		const reader = await openReader(source);
		try {
			await connection.uploadFile(remote(join(targetDir, "上传 测试.bin")), {
				totalBytes: content.byteLength,
				readChunk: reader.readChunk,
				onProgress: (bytes) => progress.push(bytes),
			});
		} finally {
			await reader.close();
		}
		expect(readFileSync(join(targetDir, "上传 测试.bin")).equals(content)).toBe(true);
		expect(progress.at(-1)).toBe(content.byteLength);
		expect(progress).toEqual([...progress].sort((a, b) => a - b));
	});

	it("空文件上传按 0 字节落盘，读侧一次都不被调", async () => {
		const targetDir = createLocalDirectory();
		const connection = createLoopbackSshConnection("transfer-empty");
		await expect(
			connection.uploadFile(remote(join(targetDir, "empty.bin")), {
				totalBytes: 0,
				readChunk: async () => {
					throw new Error("0 字节上传不应读源");
				},
			}),
		).resolves.toEqual({ bytes: 0 });
		expect(readdirSync(targetDir)).toEqual(["empty.bin"]);
	});

	it("源比声明的字节数短时远端 wc 校验拒绝，目标保持原样", async () => {
		const targetDir = createLocalDirectory();
		const target = join(targetDir, "keep.txt");
		writeFileSync(target, "original");
		const connection = createLoopbackSshConnection("transfer-short");

		let given = false;
		await expect(
			connection.uploadFile(remote(target), {
				totalBytes: 10,
				readChunk: async () => {
					if (given) return new Uint8Array();
					given = true;
					return new TextEncoder().encode("half");
				},
			}),
		).rejects.toBeInstanceOf(SshRemoteCommandError);
		expect(readFileSync(target, "utf8")).toBe("original");
		expect(readdirSync(targetDir)).toEqual(["keep.txt"]);
	});

	it("上传中途取消：目标保持原样，报取消", async () => {
		const dir = createLocalDirectory();
		const source = join(dir, "big.bin");
		writeFileSync(source, randomBytes(8 * MEGABYTE));
		const targetDir = createLocalDirectory();
		const target = join(targetDir, "keep.txt");
		writeFileSync(target, "original");
		const connection = createLoopbackSshConnection("transfer-cancel-ul");

		const controller = new AbortController();
		const reader = await openReader(source);
		try {
			const outcome = await connection
				.uploadFile(remote(target), {
					totalBytes: 8 * MEGABYTE,
					readChunk: reader.readChunk,
					signal: controller.signal,
					onProgress: (bytes) => {
						if (bytes > 0) controller.abort();
					},
				})
				.then(
					() => "completed" as const,
					(error: unknown) => error,
				);
			expect(outcome).toBeInstanceOf(SshOperationAbortedError);
		} finally {
			await reader.close();
		}
		expect(readFileSync(target, "utf8")).toBe("original");
	});

	it("下载中途取消：报取消，且取消后不再有新块", async () => {
		const dir = createLocalDirectory();
		const source = join(dir, "big.bin");
		writeFileSync(source, randomBytes(8 * MEGABYTE));
		const connection = createLoopbackSshConnection("transfer-cancel-dl");

		const controller = new AbortController();
		let aborted = false;
		const outcome = await connection
			.downloadFile(
				remote(source),
				() => {
					if (aborted) throw new Error("取消后仍在交付数据块");
				},
				{
					signal: controller.signal,
					onProgress: () => {
						aborted = true;
						controller.abort();
					},
				},
			)
			.then(
				() => "completed" as const,
				(error: unknown) => error,
			);
		expect(outcome).toBeInstanceOf(SshOperationAbortedError);
	});
});
