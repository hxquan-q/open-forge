// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	GPU_PROCESS_FALLBACK_SWITCHES,
	isGpuProcessFailureOutput,
	resolveGpuLaunchFlags,
	shouldRetryElectronWithGpuSandboxFallback,
} from "./run-dev-electron.mjs";

describe("resolveGpuLaunchFlags", () => {
	it("VETTA_DESKTOP_DISABLE_GPU=1 时返回 --disable-gpu --no-sandbox", () => {
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "1" })).toEqual(["--disable-gpu", "--no-sandbox"]);
	});

	it("未设置、空或非 1 值时不加任何旗标（缺省路径零变化）", () => {
		expect(resolveGpuLaunchFlags({})).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "" })).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "0" })).toEqual([]);
		expect(resolveGpuLaunchFlags({ VETTA_DESKTOP_DISABLE_GPU: "true" })).toEqual([]);
	});
});

describe("isGpuProcessFailureOutput", () => {
	it("识别 Chromium GPU 进程 FATAL 输出", () => {
		expect(isGpuProcessFailureOutput("FATAL: GPU process isn't usable. Goodbye.")).toBe(true);
		expect(isGpuProcessFailureOutput("ERROR: GPU process launch failed: error_code=18")).toBe(true);
	});

	it("普通启动错误不触发回退", () => {
		expect(isGpuProcessFailureOutput("Error: Cannot find module './main'")).toBe(false);
	});
});

describe("shouldRetryElectronWithGpuSandboxFallback", () => {
	const failed = { code: 3, signal: null, sawGpuFailure: true };

	it("code 3 且确认 GPU 失败时回退一次", () => {
		expect(shouldRetryElectronWithGpuSandboxFallback(failed, {})).toBe(true);
	});

	it("其它退出码、未见到 GPU FATAL 或被信号终止时不回退", () => {
		expect(shouldRetryElectronWithGpuSandboxFallback({ ...failed, code: 1 }, {})).toBe(false);
		expect(shouldRetryElectronWithGpuSandboxFallback({ ...failed, sawGpuFailure: false }, {})).toBe(false);
		expect(shouldRetryElectronWithGpuSandboxFallback({ ...failed, signal: "SIGTERM" }, {})).toBe(false);
	});

	it("已显式禁用 GPU 时不再重试", () => {
		expect(shouldRetryElectronWithGpuSandboxFallback(failed, { VETTA_DESKTOP_DISABLE_GPU: "1" })).toBe(false);
	});

	it("回退关闭整个进程沙箱（renderer 同样会因 error 18 启动失败）", () => {
		expect(GPU_PROCESS_FALLBACK_SWITCHES).toEqual(["--no-sandbox"]);
	});
});
