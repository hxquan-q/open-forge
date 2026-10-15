// Modified by The Open Forge contributors.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SpeechModelDefinition } from "./model-catalog.js";
import { WINDOWS_ZIPFORMER_MODEL } from "./model-catalog.js";
import { SpeechModelManager } from "./model-manager.js";

const temporaryRoots: string[] = [];
const TEST_MODEL: SpeechModelDefinition = {
	id: "test-speech-model",
	sampleRate: 16_000,
	totalBytes: 3,
	files: [
		{
			name: "tokens.txt",
			size: 3,
			sha256: createHash("sha256").update("abc").digest("hex"),
			url: "https://example.invalid/tokens.txt",
		},
	],
};

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-speech-test-"));
	temporaryRoots.push(root);
	return root;
}

describe("SpeechModelManager", () => {
	it("does not inspect model files when the build disables speech input", async () => {
		const manager = new SpeechModelManager({
			enabled: false,
			platform: "win32",
			arch: "x64",
			bundleRoot: "Z:/path-that-must-not-be-read",
			userRoot: "Z:/path-that-must-not-be-read",
			model: TEST_MODEL,
		});

		await expect(manager.getStatus()).resolves.toEqual({
			supported: false,
			phase: "unsupported",
			modelId: TEST_MODEL.id,
		});
	});

	it("only reports support on Windows x64", async () => {
		const manager = new SpeechModelManager({
			platform: "darwin",
			arch: "arm64",
			userRoot: await createDir(),
		});

		await expect(manager.getStatus()).resolves.toMatchObject({
			supported: false,
			phase: "unsupported",
			errorCode: "unsupported-platform",
		});
	});

	it("prefers a complete bundled model over the user directory", async () => {
		const bundleRoot = await createDir();
		const userRoot = await createDir();
		const bundled = join(bundleRoot, TEST_MODEL.id);
		await mkdir(bundled);
		await writeFile(join(bundled, "tokens.txt"), "abc");
		const manager = new SpeechModelManager({
			platform: "win32",
			arch: "x64",
			bundleRoot,
			userRoot,
			model: TEST_MODEL,
		});

		await expect(manager.getStatus()).resolves.toMatchObject({ phase: "ready" });
		expect(manager.modelDirectory).toBe(bundled);
	});

	it("reports a missing model as downloadable instead of an install failure", async () => {
		const manager = new SpeechModelManager({
			platform: "win32",
			arch: "x64",
			bundleRoot: await createDir(),
			userRoot: await createDir(),
			model: TEST_MODEL,
		});

		await expect(manager.getStatus()).resolves.toMatchObject({
			phase: "not-downloaded",
			errorCode: "model-missing",
		});
	});

	it("reports leftover partial files as repairable", async () => {
		const userRoot = await createDir();
		const dir = join(userRoot, TEST_MODEL.id);
		await mkdir(dir);
		await writeFile(join(dir, "tokens.txt"), "xx");
		const manager = new SpeechModelManager({
			platform: "win32",
			arch: "x64",
			userRoot,
			model: TEST_MODEL,
		});

		await expect(manager.getStatus()).resolves.toMatchObject({
			phase: "not-downloaded",
			errorCode: "model-invalid",
		});
	});

	it("downloads the model on demand and turns ready", async () => {
		const userRoot = await createDir();
		const manager = new SpeechModelManager({
			platform: "win32",
			arch: "x64",
			userRoot,
			model: TEST_MODEL,
			fetchImpl: async () => new Response("abc"),
		});

		await manager.ensureModel();
		await expect(manager.getStatus()).resolves.toMatchObject({ phase: "ready" });
		expect(manager.modelDirectory).toBe(join(userRoot, TEST_MODEL.id));
	});

	it("keeps a failed download retryable", async () => {
		const userRoot = await createDir();
		let fail = true;
		const manager = new SpeechModelManager({
			platform: "win32",
			arch: "x64",
			userRoot,
			model: TEST_MODEL,
			fetchImpl: async () => new Response(fail ? "bad" : "abc"),
		});

		await expect(manager.ensureModel()).rejects.toThrow();
		await expect(manager.getStatus()).resolves.toMatchObject({ phase: "not-downloaded" });
		fail = false;
		await manager.ensureModel();
		await expect(manager.getStatus()).resolves.toMatchObject({ phase: "ready" });
	});

	it("keeps the catalog total in sync with its files", () => {
		expect(WINDOWS_ZIPFORMER_MODEL.totalBytes).toBe(
			WINDOWS_ZIPFORMER_MODEL.files.reduce((total, file) => total + file.size, 0),
		);
	});
});
