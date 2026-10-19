// Modified by The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodingToolInspection } from "@vetta/runtime-node/coding";
import { describe, expect, it } from "vitest";
import { parseDoctorCommand, renderDoctorReport, runDoctorCommand } from "../src/doctor-command.js";

function inspection(overrides: Partial<CodingToolInspection>): CodingToolInspection {
	return { tool: "fd", source: "missing", offline: false, ...overrides };
}

describe("doctor command parsing", () => {
	it("accepts bare doctor and help flags, rejects anything else", () => {
		expect(parseDoctorCommand(["doctor"])).toEqual({ type: "run" });
		expect(parseDoctorCommand(["doctor", "--help"])).toEqual({ type: "help" });
		expect(parseDoctorCommand(["doctor", "-h"])).toEqual({ type: "help" });
		expect(parseDoctorCommand(["agent"])).toBeUndefined();
		expect(parseDoctorCommand(["doctor", "extra"])).toEqual({
			type: "error",
			message: "Unexpected argument: extra",
			exitCode: 2,
		});
	});

	it("prints help and exits 0", async () => {
		const output: string[] = [];
		await expect(runDoctorCommand({ type: "help" }, { write: (text) => output.push(text) })).resolves.toBe(0);
		expect(output.join("")).toContain("Open Forge doctor");
	});

	it("reports argument errors on stdout with the given exit code", async () => {
		const output: string[] = [];
		await expect(
			runDoctorCommand(
				{ type: "error", message: "Unexpected argument: extra", exitCode: 2 },
				{ write: (text) => output.push(text) },
			),
		).resolves.toBe(2);
		expect(output.join("")).toContain("Unexpected argument: extra");
	});
});

describe("doctor report rendering", () => {
	it("renders one row per tool with source, version, path and status", () => {
		const report = renderDoctorReport(
			[
				inspection({ tool: "fd", source: "cache", path: "C:/tools/fd.exe", version: "9.0.0" }),
				inspection({ tool: "rg", source: "path", path: "rg", version: "14.1.0" }),
			],
			"C:/tools",
		);
		expect(report).toContain("Tools directory: C:/tools");
		expect(report).toContain("fd    cache   9.0.0    C:/tools/fd.exe");
		expect(report).toContain("rg    path    14.1.0   rg");
	});

	it("marks missing tools and surfaces offline plus download failures", () => {
		const report = renderDoctorReport(
			[
				inspection({ tool: "fd", source: "missing", offline: true }),
				inspection({ tool: "rg", source: "download-failed", lastError: "socket hang up", offline: false }),
			],
			"C:/tools",
		);
		expect(report).toContain("fd    missing");
		expect(report).toContain("offline mode enabled");
		expect(report).toContain("last download failed: socket hang up");
	});
});

describe("doctor command execution", () => {
	it("prints the report from injected inspections", async () => {
		const output: string[] = [];
		const exitCode = await runDoctorCommand(
			{ type: "run" },
			{
				toolsDirectory: "C:/injected",
				inspect: async (tool) =>
					tool === "fd"
						? inspection({ tool: "fd", source: "cache", path: "C:/injected/fd", version: "8.3.1" })
						: inspection({ tool: "rg", source: "missing", offline: true }),
				write: (text) => output.push(text),
			},
		);
		expect(exitCode).toBe(0);
		const text = output.join("");
		expect(text).toContain("Tools directory: C:/injected");
		expect(text).toContain("fd");
		expect(text).toContain("cache");
		expect(text).toContain("8.3.1");
	});

	it("resolves the default agent tools directory against a fixture without downloading", async () => {
		const directory = mkdtempSync(join(tmpdir(), "doctor-cli-"));
		try {
			const binDirectory = join(directory, "bin");
			mkdirSync(binDirectory);
			// fd 缓存 + 标记：命中免 spawn 分支，断言值确定。
			writeFileSync(join(binDirectory, process.platform === "win32" ? "fd.exe" : "fd"), "");
			writeFileSync(join(binDirectory, "fd.version"), "9.9.9");
			const result = spawnSync("bun", [join(import.meta.dirname, "../src/cli.ts"), "doctor"], {
				cwd: resolveRepoRoot(),
				env: { ...process.env, VETTA_CODING_AGENT_DIR: directory, PI_OFFLINE: "1" },
				encoding: "utf8",
				timeout: 60_000,
				windowsHide: true,
			});
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("Tools directory:");
			expect(result.stdout).toContain("fd");
			expect(result.stdout).toContain("cache");
			expect(result.stdout).toContain("9.9.9");
			// PI_OFFLINE=1 时 rg 即便缺失也不允许触发下载路径的输出提示。
			expect(result.stdout).toContain("rg");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

function resolveRepoRoot(): string {
	return join(import.meta.dirname, "../../..");
}
