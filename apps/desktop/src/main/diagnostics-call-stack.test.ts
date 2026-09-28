import { describe, expect, it, vi } from "vitest";
import { sampleJavaScriptCallStack } from "./diagnostics.js";

function webContents(collect?: () => Promise<string>) {
	return {
		id: 7,
		...(collect ? { mainFrame: { collectJavaScriptCallStack: collect } } : {}),
	};
}

describe("renderer js call stack sampling", () => {
	it("collects and logs the bounded stack for an unresponsive renderer", async () => {
		const warn = vi.fn();
		const stack = `    at tick (${"x".repeat(40_000)})`;
		sampleJavaScriptCallStack(
			webContents(async () => stack),
			"unresponsive",
			{ warn },
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(warn).toHaveBeenCalledWith(
			"renderer js call stack",
			expect.objectContaining({ reason: "unresponsive", id: 7 }),
		);
		const logged = warn.mock.calls[0]?.[1] as { stack: string };
		expect(logged.stack.length).toBeLessThanOrEqual(32_000);
	});

	it("degrades to a warn log when the renderer is already gone", async () => {
		const warn = vi.fn();
		sampleJavaScriptCallStack(
			webContents(() => Promise.reject(new Error("frame gone"))),
			"render-process-gone",
			{
				warn,
			},
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(warn).toHaveBeenCalledWith(
			"renderer js call stack sampling failed",
			expect.objectContaining({ reason: "render-process-gone" }),
			expect.any(Error),
		);
	});

	it("does not throw when sampling fails synchronously", () => {
		const warn = vi.fn();
		expect(() =>
			sampleJavaScriptCallStack(
				webContents(() => {
					throw new Error("no frame");
				}),
				"unresponsive",
				{ warn },
			),
		).not.toThrow();
		expect(warn).toHaveBeenCalledWith("renderer js call stack sampling failed", expect.anything(), expect.any(Error));
	});

	it("is a no-op when the frame does not expose sampling", () => {
		const warn = vi.fn();
		sampleJavaScriptCallStack(webContents(), "unresponsive", { warn });
		expect(warn).not.toHaveBeenCalled();
	});
});
