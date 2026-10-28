// Modified by The Open Forge contributors.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AsyncExecutionGate,
	type AsyncExecutionGateRunOptions,
	createAsyncExecutionGate,
} from "@vetta/runtime-tools";
import { afterEach, describe, expect, it } from "vitest";
import {
	createExtractTextFromImageToolRegistration,
	createExtractTextFromPdfToolRegistration,
	type DesktopCommandPort,
} from "../../src/coding/index.js";

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("OCR shared resource admission", () => {
	it.each(["image", "pdf"] as const)(
		"cancels a waiting %s request without running OCR, then processes later work",
		async (kind) => {
			const cwd = await mkdtemp(join(tmpdir(), "of-ocr-admission-"));
			directories.push(cwd);
			const fileName = kind === "image" ? "scan.png" : "scan.pdf";
			const imagePath = join(cwd, fileName);
			const outputPath = `${imagePath}.ocr.json`;
			await writeFile(imagePath, "image");
			await writeFile(
				outputPath,
				JSON.stringify({
					version: 1,
					meta: {},
					pages: [{ page: 1, text: "recognized", source: "ocr", width: 1, height: 1 }],
				}),
			);
			const shared = createAsyncExecutionGate(1);
			const held = deferred<void>();
			const holder = shared.run(() => held.promise);
			const entered = deferred<void>();
			let observedOptions: AsyncExecutionGateRunOptions | undefined;
			const gate: AsyncExecutionGate = {
				run(operation, options) {
					observedOptions = options;
					const result = shared.run(operation, options);
					entered.resolve();
					return result;
				},
			};
			let processCalls = 0;
			const desktop: DesktopCommandPort = {
				locate: async () => ({ path: "ocr-helper" }),
				async run() {
					processCalls += 1;
					return { code: 0, stdout: JSON.stringify({ ok: true, output: outputPath }), stderr: "" };
				},
			};
			const tool = createTool(kind, cwd, desktop, gate);
			const controller = new AbortController();
			const input = { sessionId: "session-2", turnId: "turn-2", toolCallId: "call-2", input: { input: fileName } };
			const waiting = tool.execute({ ...input, signal: controller.signal }).catch((error: unknown) => error);
			await entered.promise;
			try {
				expect(observedOptions).toMatchObject({
					signal: controller.signal,
					ownerId: "session-2",
					requestId: "call-2",
				});
				controller.abort();
				expect(await waiting).toMatchObject({ message: "Operation aborted" });
				expect(processCalls).toBe(0);
			} finally {
				controller.abort();
				held.resolve();
				await Promise.all([holder, waiting]);
			}
			const result = await tool.execute({ ...input, toolCallId: "call-3", signal: new AbortController().signal });
			expect(result.content[0]).toMatchObject({ text: expect.stringContaining("recognized") });
			expect(processCalls).toBe(1);
		},
	);

	it.each(["image", "pdf"] as const)(
		"retains %s capacity after cancellation until its command actually settles",
		async (kind) => {
			const cwd = await mkdtemp(join(tmpdir(), "of-ocr-draining-"));
			directories.push(cwd);
			const fileName = kind === "image" ? "scan.png" : "scan.pdf";
			const outputPath = `${join(cwd, fileName)}.ocr.json`;
			await writeFile(join(cwd, fileName), "input");
			await writeFile(
				outputPath,
				JSON.stringify({
					version: 1,
					meta: {},
					pages: [{ page: 1, text: "recognized", source: "ocr", width: 1, height: 1 }],
				}),
			);
			const shared = createAsyncExecutionGate(1);
			const commandStarted = deferred<void>();
			const queued = deferred<void>();
			const release = deferred<void>();
			const gate: AsyncExecutionGate = {
				run: (operation, options) =>
					shared.run(operation, {
						...options,
						onEvent(event) {
							if (event.phase === "queued") queued.resolve();
						},
					}),
			};
			const timeouts: number[] = [];
			let processCalls = 0;
			const desktop: DesktopCommandPort = {
				locate: async () => ({ path: "ocr-helper" }),
				async run(_executable, _args, options) {
					processCalls += 1;
					timeouts.push(options.timeoutMs);
					if (processCalls === 1) {
						commandStarted.resolve();
						await release.promise;
					}
					return { code: 0, stdout: JSON.stringify({ ok: true, output: outputPath }), stderr: "" };
				},
			};
			const tool = createTool(kind, cwd, desktop, gate);
			const controller = new AbortController();
			const input = { sessionId: "session-1", turnId: "turn-1", toolCallId: "call-1", input: { input: fileName } };
			const first = tool.execute({ ...input, signal: controller.signal }).catch((error: unknown) => error);
			await commandStarted.promise;
			const second = tool.execute({
				...input,
				sessionId: "session-2",
				toolCallId: "call-2",
				signal: new AbortController().signal,
			});
			await queued.promise;
			try {
				controller.abort();
				expect(await first).toMatchObject({ message: "Operation aborted" });
				expect(processCalls).toBe(1);
			} finally {
				release.resolve();
				await first;
			}
			expect((await second).content[0]).toMatchObject({ text: expect.stringContaining("recognized") });
			expect(timeouts).toEqual([kind === "image" ? 300_000 : 1_800_000, kind === "image" ? 300_000 : 1_800_000]);
		},
	);
});

function createTool(
	kind: "image" | "pdf",
	cwd: string,
	desktop: DesktopCommandPort,
	executionGate: AsyncExecutionGate,
) {
	return kind === "image"
		? createExtractTextFromImageToolRegistration(cwd, { desktop, executionGate }).tool
		: createExtractTextFromPdfToolRegistration(cwd, {
				desktop,
				executionGate,
				process: { run: async () => ({ code: 0, stdout: "", stderr: "" }) },
			}).tool;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
