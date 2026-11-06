// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	aggregateByType,
	classifyProcess,
	collectProcessTree,
	dataDirIsolationProblem,
	evaluateVariation,
	findLogMarker,
	flattenMemory,
	LOG_MARKERS,
	mergeRuns,
	parseLogLine,
	parsePsOutput,
	parseWin32ProcessJson,
	percentile,
	redactHomePath,
	relativeRange,
	summarize,
	summarizeValues,
} from "./baseline-stats.mjs";

describe("percentile (nearest-rank)", () => {
	it("returns real sample values without interpolation", () => {
		const values = [15, 20, 35, 40, 50];
		expect(percentile(values, 30)).toBe(20);
		expect(percentile(values, 40)).toBe(20);
		expect(percentile(values, 50)).toBe(35);
		expect(percentile(values, 100)).toBe(50);
	});

	it("maps p = 0 to the minimum and ignores input order", () => {
		expect(percentile([3, 1, 2], 0)).toBe(1);
		expect(percentile([3, 1, 2], 95)).toBe(3);
	});

	it("handles exact ranks without floating-point drift", () => {
		const values = Array.from({ length: 20 }, (_, index) => index + 1);
		expect(percentile(values, 95)).toBe(19);
		expect(percentile([7], 95)).toBe(7);
	});

	it("does not mutate the input", () => {
		const values = [3, 1, 2];
		percentile(values, 50);
		expect(values).toEqual([3, 1, 2]);
	});

	it("rejects empty arrays, non-finite values and out-of-range p", () => {
		expect(() => percentile([], 50)).toThrow("non-empty");
		expect(() => percentile([1, Number.NaN], 50)).toThrow("finite");
		expect(() => percentile([1, Number.POSITIVE_INFINITY], 50)).toThrow("finite");
		expect(() => percentile([1, "2"], 50)).toThrow("finite");
		expect(() => percentile([1], 101)).toThrow("[0, 100]");
		expect(() => percentile([1], -1)).toThrow("[0, 100]");
	});
});

describe("summarize", () => {
	it("summarizes one metric", () => {
		expect(summarizeValues([4, 2, 6])).toEqual({ n: 3, min: 2, p50: 4, p95: 6, max: 6, mean: 4 });
	});

	it("groups by metric and skips missing values", () => {
		const summary = summarize([
			{ startupMs: 1000, "idle.total.privateBytes": null },
			{ startupMs: 1200, "idle.total.privateBytes": null },
			{ startupMs: 1100 },
		]);
		expect(Object.keys(summary)).toEqual(["startupMs"]);
		expect(summary.startupMs).toMatchObject({ n: 3, min: 1000, p50: 1100, max: 1200 });
	});

	it("rejects empty input and invalid samples", () => {
		expect(() => summarize([])).toThrow("non-empty");
		expect(() => summarize([null])).toThrow("plain object");
		expect(() => summarize([{ startupMs: Number.NaN }])).toThrow("startupMs");
	});
});

describe("variation", () => {
	it("computes relative range against the mean", () => {
		expect(relativeRange([90, 100, 110])).toBeCloseTo(0.2);
		expect(relativeRange([5, 5, 5])).toBe(0);
		expect(relativeRange([0, 0])).toBe(0);
	});

	it("returns null when the mean is zero but values differ", () => {
		expect(relativeRange([-1, 1])).toBeNull();
	});

	it("flags metrics above the limit", () => {
		const variation = evaluateVariation(
			[
				{ a: 100, b: 100 },
				{ a: 105, b: 200 },
				{ a: 95, b: 150 },
			],
			0.15,
		);
		expect(variation.a.withinLimit).toBe(true);
		expect(variation.b.withinLimit).toBe(false);
		expect(variation.b.n).toBe(3);
	});

	it("rejects invalid limits", () => {
		expect(() => evaluateVariation([{ a: 1 }], -0.1)).toThrow("non-negative");
		expect(() => evaluateVariation([{ a: 1 }], Number.NaN)).toThrow("non-negative");
	});
});

describe("mergeRuns", () => {
	it("merges metrics and counts startup methods", () => {
		const merged = mergeRuns(
			[
				{ startup: { method: "log-marker" }, metrics: { startupMs: 1000 } },
				{ startup: { method: "log-marker" }, metrics: { startupMs: 1100 } },
				{ startup: { method: "first-renderer-process" }, metrics: { startupMs: 900 } },
			],
			{ maxRelativeRange: 0.3 },
		);
		expect(merged.runCount).toBe(3);
		expect(merged.startupMethods).toEqual({ "log-marker": 2, "first-renderer-process": 1 });
		expect(merged.summary.startupMs.p50).toBe(1000);
		expect(merged.variation.startupMs.withinLimit).toBe(true);
	});

	it("rejects empty runs and runs without metrics", () => {
		expect(() => mergeRuns([], { maxRelativeRange: 0.1 })).toThrow("at least one run");
		expect(() => mergeRuns([{}], { maxRelativeRange: 0.1 })).toThrow("run 0 is missing metrics");
	});
});

describe("process classification", () => {
	it("classifies by root pid and --type", () => {
		expect(classifyProcess("electron.exe .", true)).toBe("main");
		expect(classifyProcess("electron.exe --type=renderer --lang=en", false)).toBe("renderer");
		expect(classifyProcess("electron.exe --type=gpu-process", false)).toBe("gpu");
		expect(classifyProcess('"C:\\a b\\electron.exe" --type=utility --utility-sub-type=network', false)).toBe(
			"utility",
		);
		expect(classifyProcess("electron.exe --type=crashpad-handler", false)).toBe("other");
		expect(classifyProcess("node server.js", false)).toBe("other");
		expect(classifyProcess(null, false)).toBe("other");
	});

	it("does not match --type inside another flag value", () => {
		expect(classifyProcess("electron.exe --foo=x--type=renderer", false)).toBe("other");
	});

	it("collects only the descendant tree and tolerates pid cycles", () => {
		const rows = [
			{ pid: 10, ppid: 1, commandLine: "electron .", workingSetBytes: 100, privateBytes: 80 },
			{ pid: 11, ppid: 10, commandLine: "electron --type=renderer", workingSetBytes: 50, privateBytes: 40 },
			{ pid: 12, ppid: 10, commandLine: "electron --type=gpu-process", workingSetBytes: 30, privateBytes: 20 },
			{ pid: 13, ppid: 11, commandLine: "git status", workingSetBytes: 5, privateBytes: 4 },
			{ pid: 20, ppid: 1, commandLine: "unrelated", workingSetBytes: 999, privateBytes: 999 },
			{ pid: 30, ppid: 31, commandLine: "a", workingSetBytes: 1, privateBytes: 1 },
			{ pid: 31, ppid: 30, commandLine: "b", workingSetBytes: 1, privateBytes: 1 },
		];
		const tree = collectProcessTree(rows, 10);
		expect(tree.map((row) => [row.pid, row.type])).toEqual([
			[10, "main"],
			[11, "renderer"],
			[12, "gpu"],
			[13, "other"],
		]);
		expect(collectProcessTree(rows, 30).map((row) => row.pid)).toEqual([30, 31]);
		expect(collectProcessTree(rows, 99)).toEqual([]);
		expect(() => collectProcessTree(rows, 0)).toThrow("positive integer");
	});

	it("skips orphans created before their reused parent pid", () => {
		const rows = [
			{ pid: 10, ppid: 1, commandLine: "electron .", workingSetBytes: 1, privateBytes: 1, createdMs: 5000 },
			{ pid: 11, ppid: 10, commandLine: "--type=renderer", workingSetBytes: 1, privateBytes: 1, createdMs: 6000 },
			{ pid: 12, ppid: 10, commandLine: "stale orphan", workingSetBytes: 1, privateBytes: 1, createdMs: 4000 },
			{ pid: 13, ppid: 10, commandLine: "unknown time", workingSetBytes: 1, privateBytes: 1, createdMs: null },
		];
		expect(collectProcessTree(rows, 10).map((row) => row.pid)).toEqual([10, 11, 13]);
	});

	it("falls back to ppid when createdMs is missing", () => {
		const rows = [
			{ pid: 10, ppid: 1, commandLine: "electron .", workingSetBytes: 1, privateBytes: null, createdMs: null },
			{ pid: 11, ppid: 10, commandLine: "child", workingSetBytes: 1, privateBytes: null, createdMs: 1 },
		];
		expect(collectProcessTree(rows, 10).map((row) => row.pid)).toEqual([10, 11]);
	});

	it("aggregates memory per type and propagates missing private bytes", () => {
		const aggregate = aggregateByType([
			{ pid: 1, type: "main", workingSetBytes: 100, privateBytes: 80 },
			{ pid: 2, type: "renderer", workingSetBytes: 50, privateBytes: 40 },
			{ pid: 3, type: "renderer", workingSetBytes: 60, privateBytes: null },
		]);
		expect(aggregate.main).toEqual({ count: 1, workingSetBytes: 100, privateBytes: 80 });
		expect(aggregate.renderer).toEqual({ count: 2, workingSetBytes: 110, privateBytes: null });
		expect(aggregate.gpu).toEqual({ count: 0, workingSetBytes: 0, privateBytes: 0 });
		expect(aggregate.total).toEqual({ count: 3, workingSetBytes: 210, privateBytes: null });
		expect(flattenMemory(aggregate, "idle")["idle.renderer.workingSetBytes"]).toBe(110);
		expect(() => aggregateByType([{ pid: 1, type: "browser", workingSetBytes: 1, privateBytes: 1 }])).toThrow(
			"unknown process type",
		);
	});

	it("reports null private bytes for every bucket when the platform has none", () => {
		const aggregate = aggregateByType([{ pid: 1, type: "main", workingSetBytes: 100, privateBytes: null }], {
			privateBytesAvailable: false,
		});
		expect(aggregate.main).toEqual({ count: 1, workingSetBytes: 100, privateBytes: null });
		expect(aggregate.gpu).toEqual({ count: 0, workingSetBytes: 0, privateBytes: null });
		expect(aggregate.total).toEqual({ count: 1, workingSetBytes: 100, privateBytes: null });
	});
});

describe("process table parsing", () => {
	it("parses Win32_Process JSON arrays, single objects and empty output", () => {
		const array = JSON.stringify([
			{ ProcessId: 10, ParentProcessId: 1, CommandLine: "electron .", WorkingSetSize: 4096, PrivatePageCount: 2048 },
			{ ProcessId: 11, ParentProcessId: 10, CommandLine: null, WorkingSetSize: "8192", PrivatePageCount: null },
			{ ProcessId: 12, ParentProcessId: 10, WorkingSetSize: null },
		]);
		expect(parseWin32ProcessJson(array)).toEqual([
			{ pid: 10, ppid: 1, commandLine: "electron .", workingSetBytes: 4096, privateBytes: 2048, createdMs: null },
			{ pid: 11, ppid: 10, commandLine: "", workingSetBytes: 8192, privateBytes: null, createdMs: null },
		]);
		const single = JSON.stringify({ ProcessId: 5, ParentProcessId: 4, CommandLine: "x", WorkingSetSize: 1 });
		expect(parseWin32ProcessJson(single)).toHaveLength(1);
		expect(parseWin32ProcessJson("  \r\n")).toEqual([]);
	});

	it("parses CreatedMs and nulls missing or invalid values", () => {
		const text = JSON.stringify([
			{ ProcessId: 10, ParentProcessId: 1, WorkingSetSize: 1, CreatedMs: 1762394400000 },
			{ ProcessId: 11, ParentProcessId: 10, WorkingSetSize: 1, CreatedMs: "1762394400500" },
			{ ProcessId: 12, ParentProcessId: 10, WorkingSetSize: 1, CreatedMs: -1 },
			{ ProcessId: 13, ParentProcessId: 10, WorkingSetSize: 1, CreatedMs: "soon" },
			{ ProcessId: 14, ParentProcessId: 10, WorkingSetSize: 1 },
		]);
		expect(parseWin32ProcessJson(text).map((row) => row.createdMs)).toEqual([
			1762394400000,
			1762394400500,
			null,
			null,
			null,
		]);
	});

	it("throws on malformed JSON", () => {
		expect(() => parseWin32ProcessJson("[{")).toThrow();
	});

	it("parses ps output and converts rss KiB to bytes", () => {
		const output = [
			"   10     1 204800 /opt/app/electron /opt/app/main.js",
			"   11    10  51200 /opt/app/electron --type=renderer --enable-features=a b",
			"garbage line",
			"",
		].join("\n");
		expect(parsePsOutput(output)).toEqual([
			{
				pid: 10,
				ppid: 1,
				commandLine: "/opt/app/electron /opt/app/main.js",
				workingSetBytes: 209715200,
				privateBytes: null,
				createdMs: null,
			},
			{
				pid: 11,
				ppid: 10,
				commandLine: "/opt/app/electron --type=renderer --enable-features=a b",
				workingSetBytes: 52428800,
				privateBytes: null,
				createdMs: null,
			},
		]);
	});
});

describe("log markers", () => {
	const log = [
		"[2026-11-06T10:00:00.000+08:00] [info] [main] app starting",
		"[2026-11-06T10:00:01.250+08:00] [info] [app-lifecycle] renderer boot frame visible { durationMs: 300, result: 'painted' }",
		"[2026-11-06T10:00:02.500+08:00] [info] [app-lifecycle] renderer content frame visible { durationMs: 1550, result: 'painted' }\r",
		"not a log line",
	].join("\n");

	it("parses timestamps with timezone offset into epoch ms", () => {
		const parsed = parseLogLine("[2026-11-06T10:00:00.000+08:00] [warn] [scope] hello { a: 1 }");
		expect(parsed).toEqual({
			atMs: Date.parse("2026-11-06T02:00:00.000Z"),
			level: "warn",
			scope: "scope",
			message: "hello { a: 1 }",
		});
		expect(parseLogLine("[2026-11-06T02:00:00.000Z] [info] [scope] utc")?.atMs).toBe(
			Date.parse("2026-11-06T02:00:00.000Z"),
		);
		expect(parseLogLine("plain text")).toBeNull();
		expect(parseLogLine(undefined)).toBeNull();
	});

	it("finds the first marker and its internal duration", () => {
		expect(findLogMarker(log, LOG_MARKERS.contentVisible)).toEqual({
			atMs: Date.parse("2026-11-06T02:00:02.500Z"),
			internalDurationMs: 1550,
		});
		expect(findLogMarker(log, LOG_MARKERS.bootVisible)?.internalDurationMs).toBe(300);
		expect(findLogMarker(log, LOG_MARKERS.contentTimedOut)).toBeNull();
		expect(findLogMarker("", LOG_MARKERS.contentVisible)).toBeNull();
	});

	it("ignores markers older than the launch time", () => {
		const notBefore = Date.parse("2026-11-06T02:00:02.000Z");
		expect(findLogMarker(log, LOG_MARKERS.bootVisible, notBefore)).toBeNull();
		expect(findLogMarker(log, LOG_MARKERS.contentVisible, notBefore)).not.toBeNull();
	});

	it("reports null duration when the data object has none", () => {
		const line = "[2026-11-06T10:00:02.500+08:00] [info] [x] renderer content frame visible";
		expect(findLogMarker(line, LOG_MARKERS.contentVisible)?.internalDurationMs).toBeNull();
	});
});

describe("data dir isolation", () => {
	const win = {
		platform: "win32",
		homeDir: "C:\\Users\\dev",
		env: { APPDATA: "C:\\Users\\dev\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local" },
		repoRoot: "E:\\open-forge",
	};
	const linux = { platform: "linux", homeDir: "/home/dev", env: {}, repoRoot: "/work/open-forge" };

	it("accepts dedicated temp directories", () => {
		expect(dataDirIsolationProblem("C:\\Users\\dev\\AppData\\Local\\Temp\\of-perf", win)).toBeNull();
		expect(dataDirIsolationProblem("D:\\perf\\run", win)).toBeNull();
		expect(dataDirIsolationProblem("/tmp/of-perf", linux)).toBeNull();
		expect(dataDirIsolationProblem("/home/dev/perf-data", linux)).toBeNull();
	});

	it("requires an absolute, non-root path", () => {
		expect(dataDirIsolationProblem("", win)).toContain("required");
		expect(dataDirIsolationProblem(undefined, win)).toContain("required");
		expect(dataDirIsolationProblem("perf", linux)).toContain("absolute");
		expect(dataDirIsolationProblem("C:\\", win)).toContain("filesystem root");
		expect(dataDirIsolationProblem("/", linux)).toContain("filesystem root");
	});

	it("rejects real data roots, their children and their parents", () => {
		expect(dataDirIsolationProblem("C:\\Users\\dev\\.openforge", win)).toContain("~/.openforge");
		expect(dataDirIsolationProblem("c:\\users\\DEV\\.OpenForge\\perf", win)).toContain("~/.openforge");
		expect(dataDirIsolationProblem("C:\\Users\\dev\\.vetta\\x", win)).toContain("~/.vetta");
		expect(dataDirIsolationProblem("C:\\Users\\dev\\.openforge-dev", win)).toContain("dev data root");
		expect(dataDirIsolationProblem("C:\\Users\\dev\\AppData\\Roaming\\perf", win)).toContain("%APPDATA%");
		expect(dataDirIsolationProblem("C:\\Users\\dev\\AppData", win)).toContain("%APPDATA%");
		expect(dataDirIsolationProblem("/home/dev/.config/perf", linux)).toContain("XDG_CONFIG_HOME");
		expect(
			dataDirIsolationProblem("/Users/dev/Library/Application Support/x", {
				...linux,
				platform: "darwin",
				homeDir: "/Users/dev",
			}),
		).toContain("Electron userData root");
	});

	it("rejects the home directory itself and its ancestors", () => {
		expect(dataDirIsolationProblem("C:\\Users\\dev", win)).toContain("~/.openforge");
		expect(dataDirIsolationProblem("C:\\Users", win)).not.toBeNull();
		expect(dataDirIsolationProblem("/home", linux)).not.toBeNull();
	});

	it("rejects the repository root and the current VETTA_HOME", () => {
		expect(dataDirIsolationProblem("E:\\open-forge\\tmp\\perf", win)).toContain("repository root");
		expect(dataDirIsolationProblem("/srv/state/x", { ...linux, env: { VETTA_HOME: "/srv/state" } })).toContain(
			"VETTA_HOME",
		);
		expect(
			dataDirIsolationProblem("/home/dev/.myforge", { ...linux, env: { VETTA_CONFIG_DIR: ".myforge" } }),
		).toContain("VETTA_CONFIG_DIR");
	});

	it("is case-sensitive on POSIX", () => {
		expect(dataDirIsolationProblem("/home/dev/.OPENFORGE", linux)).toBeNull();
	});

	it("resolves state roots through the injected realpath", () => {
		const realpath = (value) => (value === "/home/dev/.openforge" ? "/srv/state" : value);
		expect(dataDirIsolationProblem("/srv/state/x", { ...linux, realpath })).toContain("~/.openforge");
		expect(dataDirIsolationProblem("/srv/state/x", linux)).toBeNull();
	});

	it("skips the repository root when repoRoot is omitted", () => {
		const { repoRoot: _omitted, ...withoutRepo } = linux;
		expect(dataDirIsolationProblem("/work/open-forge/tmp/perf", withoutRepo)).toBeNull();
		expect(dataDirIsolationProblem("/work/open-forge/tmp/perf", linux)).toContain("repository root");
	});

	it("joins an absolute VETTA_CONFIG_DIR under the home directory like the runtime", () => {
		const context = { ...linux, env: { VETTA_CONFIG_DIR: "/abs/cfg" } };
		expect(dataDirIsolationProblem("/home/dev/abs/cfg/x", context)).toContain("VETTA_CONFIG_DIR");
		expect(dataDirIsolationProblem("/abs/cfg/x", context)).toBeNull();
	});

	it("normalizes win32 forward slashes and trailing separators", () => {
		expect(dataDirIsolationProblem("C:/Users/dev/.openforge/x", win)).toContain("~/.openforge");
		expect(dataDirIsolationProblem("C:\\Users\\dev\\.openforge\\", win)).toContain("~/.openforge");
		expect(dataDirIsolationProblem("/home/dev/.openforge/", linux)).toContain("~/.openforge");
	});
});

describe("redactHomePath", () => {
	it("replaces the home prefix only", () => {
		expect(redactHomePath("C:\\Users\\Dev\\x\\y", "C:\\Users\\dev", "win32")).toBe("~\\x\\y");
		expect(redactHomePath("/home/dev", "/home/dev", "linux")).toBe("~");
		expect(redactHomePath("/home/developer/x", "/home/dev", "linux")).toBe("/home/developer/x");
		expect(redactHomePath("/tmp/x", "/home/dev", "linux")).toBe("/tmp/x");
	});
});
