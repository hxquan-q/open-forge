// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { resolveGpuLaunchFlags } from "./run-dev-electron.mjs";

describe("resolveGpuLaunchFlags", () => {
	it("VETTA_DESKTOP_DISABLE_GPU=1 时返回 --disable-gpu", () => {
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "1" })).toEqual(["--disable-gpu"]);
	});

	it("未设置、空或非 1 值时不加任何旗标（缺省路径零变化）", () => {
		expect(resolveGpuLaunchFlags({})).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "" })).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "0" })).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "true" })).toEqual([]);
	});
});
