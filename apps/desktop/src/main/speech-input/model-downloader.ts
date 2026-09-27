// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { SpeechModelDefinition, SpeechModelFile } from "./model-catalog.js";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** 已落盘文件按 manifest 的 size + sha256 校验，损坏视为缺失。 */
export async function verifySpeechModelFile(path: string, file: SpeechModelFile): Promise<boolean> {
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size !== file.size) return false;
		const hash = createHash("sha256");
		for await (const chunk of createReadStream(path)) hash.update(chunk);
		return hash.digest("hex") === file.sha256;
	} catch {
		return false;
	}
}

export interface SpeechModelDownloadOptions {
	fetchImpl?: FetchLike;
	/** 全模型维度的累计进度：completedBytes / totalBytes。 */
	onProgress?: (completedBytes: number, totalBytes: number) => void;
	signal?: AbortSignal;
}

/**
 * 按 manifest 把模型文件下载到 modelDirectory（不存在则创建）。
 * 已存在且校验通过的文件直接跳过，支持部分完成后续传；每个文件先写
 * `*.part`、校验通过再原子改名，失败不留半个文件。
 */
export async function downloadSpeechModel(
	model: SpeechModelDefinition,
	modelDirectory: string,
	options: SpeechModelDownloadOptions = {},
): Promise<void> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const totalBytes = model.files.reduce((sum, file) => sum + file.size, 0);
	let completedBytes = 0;

	for (const file of model.files) {
		const destination = join(modelDirectory, file.name);
		if (await verifySpeechModelFile(destination, file)) {
			completedBytes += file.size;
			options.onProgress?.(completedBytes, totalBytes);
			continue;
		}

		await mkdir(dirname(destination), { recursive: true });
		const partial = `${destination}.${process.pid}.part`;
		await rm(partial, { force: true });
		try {
			const response = await fetchImpl(file.url, { signal: options.signal });
			if (!response.ok || !response.body) {
				throw new Error(`HTTP ${response.status} while downloading ${file.name}`);
			}
			const report = options.onProgress;
			let fileBytes = 0;
			const counted = report
				? new ReadableStream<Uint8Array>({
						async start(controller) {
							const reader = response.body!.getReader();
							for (;;) {
								const { done, value } = await reader.read();
								if (done) break;
								fileBytes += value.byteLength;
								report(completedBytes + fileBytes, totalBytes);
								controller.enqueue(value);
							}
							controller.close();
						},
					})
				: response.body;
			await pipeline(
				Readable.fromWeb(counted as unknown as NodeReadableStream),
				createWriteStream(partial, { flags: "wx" }),
			);
			if (!(await verifySpeechModelFile(partial, file))) {
				throw new Error(`Integrity check failed for ${file.name}`);
			}
			await rm(destination, { force: true });
			await rename(partial, destination);
			completedBytes += file.size;
		} catch (error) {
			await rm(partial, { force: true });
			throw error;
		}
	}
}
