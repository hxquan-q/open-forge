// Modified by The Open Forge contributors.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	GPU_PROCESS_FALLBACK_SWITCHES,
	INTEGRITY_LABEL_REPAIR_ARGS,
	hasLowIntegrityLabel,
	isGpuProcessFailureOutput,
	repairElectronIntegrityLabelIfNeeded,
	resolveGpuLaunchFlags,
	shouldRepairElectronIntegrityLabel,
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

describe("hasLowIntegrityLabel", () => {
	it("识别 icacls /save 的 Low 标签 SDDL", () => {
		expect(hasLowIntegrityLabel("S:AI(ML;;NW;;;LW)")).toBe(true);
		expect(hasLowIntegrityLabel("D:AI(A;OICI;FA;;;SY)\r\nS:AI(ML;;NW;;;LW)\r\n")).toBe(true);
	});

	it("Medium、无标签或非字符串输入不触发", () => {
		expect(hasLowIntegrityLabel("S:AI(ML;;NW;;;ME)")).toBe(false);
		expect(hasLowIntegrityLabel("D:AI(A;OICI;FA;;;SY)")).toBe(false);
		expect(hasLowIntegrityLabel("")).toBe(false);
		expect(hasLowIntegrityLabel(undefined)).toBe(false);
	});
});

describe("shouldRepairElectronIntegrityLabel", () => {
	it("仅 Windows + Low 触发修复，Medium/无标签或非 Windows 不触发", () => {
		expect(
			shouldRepairElectronIntegrityLabel({ platform: "win32", savedAclText: "S:AI(ML;;NW;;;LW)" }),
		).toBe(true);
		expect(
			shouldRepairElectronIntegrityLabel({ platform: "win32", savedAclText: "S:AI(ML;;NW;;;ME)" }),
		).toBe(false);
		expect(
			shouldRepairElectronIntegrityLabel({ platform: "linux", savedAclText: "S:AI(ML;;NW;;;LW)" }),
		).toBe(false);
	});
});

function createRepairHarness({
	platform = "win32",
	savedAclText = "",
	probeStatus = 0,
	repairStatus = 0,
} = {}) {
	const calls = [];
	const warnings = [];
	const tempDirs = [];
	const tempDir = join("temp", "openforge-label");
	const result = repairElectronIntegrityLabelIfNeeded(join("electron-dist", "electron.exe"), {
		platform,
		runCommand: (command, args) => {
			calls.push({ command, args });
			const status = args.includes("/save") ? probeStatus : repairStatus;
			return { status };
		},
		makeTempDir: () => {
			tempDirs.push(tempDir);
			return tempDir;
		},
		removeTempDir: (directory) => tempDirs.push(`removed:${directory}`),
		readTextFile: () => savedAclText,
		log: { warn: (message) => warnings.push(message) },
	});
	return { result, calls, warnings, tempDirs };
}

describe("repairElectronIntegrityLabelIfNeeded", () => {
	it("检测到 Low 后把 Electron dist 恢复为 Medium，探针与修复只作用于 dist", () => {
		const { result, calls, tempDirs } = createRepairHarness({
			savedAclText: "S:AI(ML;;NW;;;LW)",
		});
		const distDir = join("electron-dist");
		const tempDir = join("temp", "openforge-label");
		expect(result.status).toBe("repaired");
		expect(calls).toEqual([
			{
				command: "icacls.exe",
				args: [distDir, "/save", join(tempDir, "electron-dist-acl.txt"), "/T", "/C", "/Q"],
			},
			{ command: "icacls.exe", args: [distDir, ...INTEGRITY_LABEL_REPAIR_ARGS] },
		]);
		expect(INTEGRITY_LABEL_REPAIR_ARGS).toEqual(["/setintegritylevel", "Medium", "/T", "/C", "/Q"]);
		expect(tempDirs).toEqual([tempDir, `removed:${tempDir}`]);
	});

	it("Medium 或无标签时只探测，不发修复命令", () => {
		const { result, calls, warnings } = createRepairHarness({
			savedAclText: "S:AI(ML;;NW;;;ME)",
		});
		expect(result.status).toBe("not-needed");
		expect(calls).toHaveLength(1);
		expect(warnings).toEqual([]);
	});

	it("非 Windows 平台零命令、零临时目录", () => {
		const { result, calls, tempDirs } = createRepairHarness({
			platform: "darwin",
			savedAclText: "S:AI(ML;;NW;;;LW)",
		});
		expect(result.status).toBe("skipped");
		expect(calls).toEqual([]);
		expect(tempDirs).toEqual([]);
	});

	it("探针失败只告警并清理临时目录，不阻断启动", () => {
		const tempDir = join("temp", "openforge-label");
		const { result, calls, warnings, tempDirs } = createRepairHarness({ probeStatus: 5 });
		expect(result.status).toBe("probe-failed");
		expect(calls).toHaveLength(1);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("无法检查");
		expect(tempDirs).toEqual([tempDir, `removed:${tempDir}`]);
	});

	it("修复被拒绝时保留原始启动路径并说明原因", () => {
		const { result, calls, warnings } = createRepairHarness({
			savedAclText: "S:AI(ML;;NW;;;LW)",
			repairStatus: 1,
		});
		expect(result.status).toBe("repair-failed");
		expect(calls).toHaveLength(2);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("自愈失败");
	});

	it("临时目录或 icacls 启动异常时不抛出", () => {
		const warnings = [];
		const result = repairElectronIntegrityLabelIfNeeded(join("electron-dist", "electron.exe"), {
			platform: "win32",
			makeTempDir: () => {
				throw new Error("temp unavailable");
			},
			log: { warn: (message) => warnings.push(message) },
		});
		expect(result.status).toBe("probe-failed");
		expect(warnings[0]).toContain("temp unavailable");
	});

	it("读取保存文件失败时仍清理临时目录", () => {
		const tempDir = join("temp", "openforge-label");
		const removed = [];
		const result = repairElectronIntegrityLabelIfNeeded(join("electron-dist", "electron.exe"), {
			platform: "win32",
			runCommand: () => ({ status: 0 }),
			makeTempDir: () => tempDir,
			removeTempDir: (directory) => removed.push(directory),
			readTextFile: () => {
				throw new Error("decode failed");
			},
			log: { warn: () => {} },
		});
		expect(result.status).toBe("probe-failed");
		expect(removed).toEqual([tempDir]);
	});
});
