// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readInstalledFonts } from "./installed-fonts";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
describe("installed font boundary", () => {
	it("deduplicates valid metadata, measures monospace without name heuristics, and never reads blobs", async () => {
		const blob = vi.fn(() => {
			throw Error("must not read font bytes");
		});
		vi.stubGlobal("queryLocalFonts", async () => [
			{ family: "Fixed Face", blob },
			{ family: "Fixed Face" },
			{ family: "Misleading Mono" },
			{ family: "bad; color:red" },
			{ family: 42 },
			null,
		]);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
			const ctx = {
				font: "",
				measureText(text: string) {
					return { width: ctx.font.includes("Fixed Face") ? 80 : text === "iiiiiiii" ? 20 : 80 };
				},
			};
			return ctx as unknown as CanvasRenderingContext2D;
		});
		const result = await readInstalledFonts(new AbortController().signal);
		expect(result).toEqual([
			{ family: "Fixed Face", monospace: true },
			{ family: "Misleading Mono", monospace: false },
		]);
		expect(blob).not.toHaveBeenCalled();
	});
	it("cancels an outstanding permission request and releases its timeout", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("queryLocalFonts", () => new Promise(() => {}));
		const controller = new AbortController();
		const pending = readInstalledFonts(controller.signal);
		const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await rejected;
		expect(vi.getTimerCount()).toBe(0);
	});
	it("times out without retaining a timer or awaiting a late result", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("queryLocalFonts", () => new Promise(() => {}));
		const pending = readInstalledFonts(new AbortController().signal);
		const rejected = expect(pending).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(15000);
		await rejected;
		expect(vi.getTimerCount()).toBe(0);
	});
	it("rejects a malformed external result", async () => {
		vi.stubGlobal("queryLocalFonts", async () => ({ family: "Not an array" }));
		await expect(readInstalledFonts(new AbortController().signal)).rejects.toThrow("Invalid font list");
	});
});
