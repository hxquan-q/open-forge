// Copyright The Open Forge contributors.
import { setImmediate } from "node:timers";
import { describe, expect, it } from "vitest";
import { killNodeProcessTree, resolveWindowsTaskkillCommand } from "./process-tree.js";

describe("resolveWindowsTaskkillCommand", () => {
	it("resolves taskkill from SystemRoot without relying on PATH", () => {
		const resolved = resolveWindowsTaskkillCommand({ SystemRoot: "C:\\Windows" } as NodeJS.ProcessEnv);
		expect(resolved.startsWith("C:\\Windows")).toBe(true);
		expect(resolved.toLowerCase()).toContain("system32");
		expect(resolved.toLowerCase()).toContain("taskkill.exe");
	});

	it("falls back to windir and then to the bare command", () => {
		expect(resolveWindowsTaskkillCommand({ windir: "C:\\Win" } as NodeJS.ProcessEnv).startsWith("C:\\Win")).toBe(
			true,
		);
		expect(resolveWindowsTaskkillCommand({} as NodeJS.ProcessEnv)).toBe("taskkill");
	});
});

describe("killNodeProcessTree", () => {
	it("never throws synchronously for an already-exited pid", () => {
		expect(() => killNodeProcessTree(999_999)).not.toThrow();
	});

	if (process.platform === "win32") {
		it("survives an async spawn failure instead of crashing on an unhandled error event", async () => {
			expect(() =>
				killNodeProcessTree(999_999, { SystemRoot: "Z:\\definitely-missing-root" } as NodeJS.ProcessEnv),
			).not.toThrow();
			// ENOENT is delivered asynchronously on the child's 'error' event;
			// without a listener the unhandled event would take down the process.
			for (let tick = 0; tick < 4; tick++) {
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
		});
	}
});
