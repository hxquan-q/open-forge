// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SpeechModelDefinition } from "./model-catalog.js";
import { downloadSpeechModel, verifySpeechModelFile } from "./model-downloader.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-speech-dl-test-"));
	temporaryRoots.push(root);
	return root;
}

function modelFor(content: string): SpeechModelDefinition {
	return {
		id: "test-model",
		sampleRate: 16_000,
		totalBytes: content.length,
		files: [
			{
				name: "tokens.txt",
				size: content.length,
				sha256: createHash("sha256").update(content).digest("hex"),
				url: "https://example.invalid/tokens.txt",
			},
		],
	};
}

describe("downloadSpeechModel", () => {
	it("writes verified files into the model directory and reports progress", async () => {
		const root = await createDir();
		const model = modelFor("hello");
		const progress: number[] = [];

		await downloadSpeechModel(model, join(root, model.id), {
			fetchImpl: async () => new Response("hello"),
			onProgress: (done, total) => progress.push(done / total),
		});

		await expect(stat(join(root, model.id, "tokens.txt"))).resolves.toMatchObject({ size: 5 });
		expect(progress.at(-1)).toBe(1);
	});

	it("skips files that already verify and resumes the rest", async () => {
		const root = await createDir();
		const model: SpeechModelDefinition = {
			id: "m",
			sampleRate: 16_000,
			totalBytes: 6,
			files: [
				{
					name: "tokens.txt",
					size: 3,
					sha256: createHash("sha256").update("abc").digest("hex"),
					url: "https://example.invalid/tokens.txt",
				},
				{
					name: "decoder.onnx",
					size: 3,
					sha256: createHash("sha256").update("def").digest("hex"),
					url: "https://example.invalid/decoder.onnx",
				},
			],
		};
		const dir = join(root, model.id);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "tokens.txt"), "abc");

		let requests = 0;
		await downloadSpeechModel(model, dir, {
			fetchImpl: async (url) => {
				requests += 1;
				return new Response(url.endsWith("decoder.onnx") ? "def" : "???");
			},
		});

		expect(requests).toBe(1);
		await expect(stat(join(dir, "decoder.onnx"))).resolves.toBeTruthy();
	});

	it("rejects corrupt downloads without publishing the file", async () => {
		const root = await createDir();
		const model = modelFor("good");
		const dir = join(root, model.id);

		await expect(downloadSpeechModel(model, dir, { fetchImpl: async () => new Response("bad") })).rejects.toThrow(
			/Integrity check failed/,
		);
		await expect(stat(join(dir, "tokens.txt"))).rejects.toThrow();
	});
});

describe("verifySpeechModelFile", () => {
	it("accepts size- and hash-matching files only", async () => {
		const root = await createDir();
		const file = join(root, "tokens.txt");
		await writeFile(file, "abc");
		const model = modelFor("abc");

		await expect(verifySpeechModelFile(file, model.files[0])).resolves.toBe(true);
		await writeFile(file, "abd");
		await expect(verifySpeechModelFile(file, model.files[0])).resolves.toBe(false);
	});
});
