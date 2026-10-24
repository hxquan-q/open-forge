// Copyright The Open Forge contributors.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadToFile } from "./download.js";

afterEach(() => vi.unstubAllGlobals());

describe("runtime download cancellation", () => {
	it("does not write a late response after preparation is cancelled", async () => {
		const root = await mkdtemp(join(tmpdir(), "runtime-download-cancel-"));
		const destination = join(root, "runtime.zip");
		const controller = new AbortController();
		let finishBody!: (body: ArrayBuffer) => void;
		let bodyStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			bodyStarted = resolve;
		});
		const response = new Response();
		vi.spyOn(response, "arrayBuffer").mockImplementation(
			() =>
				new Promise<ArrayBuffer>((resolve) => {
					finishBody = resolve;
					bodyStarted();
				}),
		);
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
		const download = downloadToFile("https://runtime.invalid/fixture", destination, 5_000, controller.signal);
		const cancelled = expect(download).rejects.toMatchObject({ name: "AbortError" });
		try {
			await started;
			controller.abort();
			finishBody(new ArrayBuffer(8));
			await cancelled;
			expect(existsSync(destination)).toBe(false);
		} finally {
			controller.abort();
			finishBody?.(new ArrayBuffer(0));
			await download.catch(() => undefined);
			await rm(root, { recursive: true, force: true });
		}
	});
});
