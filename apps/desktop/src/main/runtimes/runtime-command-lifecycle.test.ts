// Copyright The Open Forge contributors.
import type { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeCommandRunner } from "./runtime-command.js";

interface Pipe {
	destroyed: boolean;
	destroy(): void;
}
interface FixtureProcess extends EventEmitter {
	stdin: Pipe;
	stdout: Pipe;
	stderr: Pipe;
	exitCode: number | null;
	exited: boolean;
	kill(signal: string): boolean;
	exitWithInheritedPipes(): void;
	forceCleanup(): void;
}

const fixture = vi.hoisted(() => ({ child: undefined as FixtureProcess | undefined }));

// Model the OS process boundary: SIGTERM is ignored, and descendants may keep
// pipes open after the direct process exits. This also runs on Windows.
vi.mock("node:child_process", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		execFile: (
			_command: string,
			_args: readonly string[],
			options: { signal?: AbortSignal },
			callback: (error: Error | null, stdout: string, stderr: string) => void,
		) => {
			const child = new EventEmitter() as FixtureProcess;
			let closed = false;
			let delivered = false;
			child.exited = false;
			child.exitCode = null;
			const deliver = (error: Error | null) => {
				if (delivered) return;
				delivered = true;
				callback(error, "partial output", "");
			};
			const closeIfReady = () => {
				if (closed || !child.exited || ![child.stdin, child.stdout, child.stderr].every((pipe) => pipe.destroyed))
					return;
				closed = true;
				options.signal?.removeEventListener("abort", nativeAbort);
				deliver(child.exitCode === 0 ? null : new Error("terminated"));
				child.emit("close", child.exitCode);
			};
			const pipe = (): Pipe => ({
				destroyed: false,
				destroy() {
					this.destroyed = true;
					closeIfReady();
				},
			});
			child.stdin = pipe();
			child.stdout = pipe();
			child.stderr = pipe();
			child.kill = (signal) => {
				if (child.exited) return false;
				if (signal === "SIGKILL")
					queueMicrotask(() => {
						child.exited = true;
						child.emit("exit", null, "SIGKILL");
						closeIfReady();
					});
				return true;
			};
			function nativeAbort() {
				child.kill("SIGTERM");
				const error = new Error("aborted");
				error.name = "AbortError";
				deliver(error);
			}
			options.signal?.addEventListener("abort", nativeAbort, { once: true });
			child.exitWithInheritedPipes = () => {
				child.exited = true;
				child.exitCode = 0;
				options.signal?.removeEventListener("abort", nativeAbort);
				child.emit("exit", 0, null);
			};
			child.forceCleanup = () => {
				child.exited = true;
				child.stdin.destroy();
				child.stdout.destroy();
				child.stderr.destroy();
			};
			fixture.child = child;
			return child;
		},
	};
});

let runner = new RuntimeCommandRunner();
afterEach(async () => {
	fixture.child?.forceCleanup();
	await runner.shutdown();
	runner = new RuntimeCommandRunner();
	fixture.child = undefined;
});

describe("runtime cancellation lifecycle", () => {
	it("forces termination and releases owned pipes when SIGTERM is ignored", async () => {
		const controller = new AbortController();
		const command = runner.run("fixture", [], { timeout: 5_000, signal: controller.signal });
		controller.abort();
		await Promise.resolve();
		expect(fixture.child?.exited).toBe(true);
		expect(fixture.child?.stdout.destroyed).toBe(true);
		expect((await command).error).toMatchObject({ name: "AbortError" });
	});
	it("finishes shutdown when an exited process leaves inherited output pipes open", async () => {
		const command = runner.run("fixture", [], { timeout: 5_000 });
		fixture.child?.exitWithInheritedPipes();
		const shutdown = runner.shutdown();
		expect(fixture.child?.stdout.destroyed).toBe(true);
		expect(fixture.child?.stderr.destroyed).toBe(true);
		await shutdown;
		expect((await command).error).toMatchObject({ name: "AbortError" });
	});
});
