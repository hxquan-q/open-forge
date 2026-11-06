// Copyright The Open Forge contributors.
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createIsolatedEnv, parseCliArgs, registerTerminationHandlers } from "./desktop-baseline.mjs";

describe("desktop baseline termination", () => {
	it.each([
		["SIGINT", 130],
		["SIGTERM", 143],
	])("waits for cleanup before exiting on %s", async (signal, exitCode) => {
		const target = Object.assign(new EventEmitter(), { exit: vi.fn() });
		const exited = new Promise((resolve) => target.exit.mockImplementation(resolve));
		let finishCleanup;
		const pending = new Promise((resolve) => {
			finishCleanup = resolve;
		});
		const cleanup = vi.fn(() => pending);
		const remove = registerTerminationHandlers(() => cleanup, target);
		try {
			target.emit(signal);
			await Promise.resolve();
			expect(cleanup).toHaveBeenCalledOnce();
			expect(target.exit).not.toHaveBeenCalled();
			finishCleanup();
			await exited;
			expect(target.exit).toHaveBeenCalledWith(exitCode);
		} finally {
			remove();
		}
	});

	it("shares pending cleanup across repeated termination signals", async () => {
		const target = Object.assign(new EventEmitter(), { exit: vi.fn() });
		const exited = new Promise((resolve) => target.exit.mockImplementation(resolve));
		let finishCleanup;
		const pending = new Promise((resolve) => {
			finishCleanup = resolve;
		});
		const cleanup = vi.fn(() => pending);
		const remove = registerTerminationHandlers(() => cleanup, target);
		try {
			target.emit("SIGTERM");
			target.emit("SIGINT");
			target.emit("SIGTERM");
			await Promise.resolve();
			expect(cleanup).toHaveBeenCalledOnce();
			expect(target.exit).not.toHaveBeenCalled();
			finishCleanup();
			await exited;
			expect(target.exit).toHaveBeenCalledExactlyOnceWith(143);
		} finally {
			remove();
		}
		expect(target.listenerCount("SIGINT")).toBe(0);
		expect(target.listenerCount("SIGTERM")).toBe(0);
	});
});

describe("desktop baseline cli args", () => {
	it("applies defaults", () => {
		const options = parseCliArgs(["--data-dir", "/tmp/perf"]);
		expect(options).toMatchObject({
			runs: 3,
			sessions: 0,
			dataDir: "/tmp/perf",
			app: null,
			out: null,
			scanRoot: null,
			keyword: "TODO",
			help: false,
		});
	});

	it("accepts both --flag value and --flag=value forms", () => {
		const options = parseCliArgs([
			"--runs=5",
			"--sessions",
			"2",
			"--app=C:\\Apps\\OpenForge.exe",
			"--out",
			"/tmp/out.json",
			"--scan-root=/work/sample",
			"--keyword=needle",
			"--idle-ms=0",
			"--max-relative-range",
			"0.15",
		]);
		expect(options).toMatchObject({
			runs: 5,
			sessions: 2,
			app: "C:\\Apps\\OpenForge.exe",
			out: "/tmp/out.json",
			scanRoot: "/work/sample",
			keyword: "needle",
			idleMs: 0,
			maxRelativeRange: 0.15,
		});
	});

	it("enforces the minimum run count and integer values", () => {
		expect(() => parseCliArgs(["--runs", "2"])).toThrow("at least 3");
		expect(() => parseCliArgs(["--runs", "3.5"])).toThrow("non-negative integer");
		expect(() => parseCliArgs(["--sessions", "-1"])).toThrow("non-negative integer");
		expect(() => parseCliArgs(["--sessions=-1"])).toThrow("non-negative integer");
		expect(() => parseCliArgs(["--startup-timeout-ms", "0"])).toThrow("positive");
		expect(() => parseCliArgs(["--max-relative-range", "abc"])).toThrow("non-negative number");
	});

	it("rejects timer values above the setTimeout limit", () => {
		expect(() => parseCliArgs(["--idle-ms", "2147483648"])).toThrow("--idle-ms must be <= 2147483647");
		expect(() => parseCliArgs(["--startup-timeout-ms=2147483648"])).toThrow(
			"--startup-timeout-ms must be <= 2147483647",
		);
		expect(parseCliArgs(["--idle-ms", "2147483647"]).idleMs).toBe(2147483647);
	});

	it("rejects unknown flags and missing values", () => {
		expect(() => parseCliArgs(["--bogus"])).toThrow("unknown argument");
		expect(() => parseCliArgs(["--data-dir"])).toThrow("requires a value");
		expect(() => parseCliArgs(["--data-dir", "--runs"])).toThrow("requires a value");
		expect(() => parseCliArgs(["--data-dir="])).toThrow("requires a value");
		expect(parseCliArgs(["-h"]).help).toBe(true);
	});
});

describe("isolated child env", () => {
	it("drops host VETTA_/ELECTRON_ keys and points state at the run directory", () => {
		const env = createIsolatedEnv(
			{
				PATH: "/usr/bin",
				HOME: "/home/dev",
				VETTA_HOME: "/home/dev/.openforge",
				VETTA_CONFIG_DIR: ".openforge-dev",
				VETTA_DESKTOP_DEV_URL: "http://127.0.0.1:3020",
				ELECTRON_RUN_AS_NODE: "1",
				UNDEFINED_KEY: undefined,
			},
			{ vettaHome: "/tmp/p/vh", userDataDir: "/tmp/p/ud", homeDir: "/tmp/p/home", platform: "linux" },
		);
		expect(env).toEqual({
			PATH: "/usr/bin",
			HOME: "/tmp/p/home",
			VETTA_HOME: "/tmp/p/vh",
			VETTA_DESKTOP_USER_DATA_DIR: "/tmp/p/ud",
			XDG_CONFIG_HOME: "/tmp/p/home/.config",
			XDG_DATA_HOME: "/tmp/p/home/.local/share",
			XDG_CACHE_HOME: "/tmp/p/home/.cache",
			XDG_STATE_HOME: "/tmp/p/home/.local/state",
		});
	});

	it("overrides USERPROFILE and app data roots on win32 regardless of key case", () => {
		const env = createIsolatedEnv(
			{
				Path: "C:\\Windows",
				UserProfile: "C:\\Users\\dev",
				vetta_home: "C:\\Users\\dev\\.openforge",
				AppData: "C:\\Users\\dev\\AppData\\Roaming",
				LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
				Node_Options: "--require C:\\hook.js",
			},
			{ vettaHome: "D:\\p\\vh", userDataDir: "D:\\p\\ud", homeDir: "D:\\p\\home", platform: "win32" },
		);
		expect(env).toEqual({
			Path: "C:\\Windows",
			HOME: "D:\\p\\home",
			USERPROFILE: "D:\\p\\home",
			VETTA_HOME: "D:\\p\\vh",
			VETTA_DESKTOP_USER_DATA_DIR: "D:\\p\\ud",
			APPDATA: "D:\\p\\home\\AppData\\Roaming",
			LOCALAPPDATA: "D:\\p\\home\\AppData\\Local",
		});
	});

	it("removes NODE_OPTIONS and host XDG_* roots on linux", () => {
		const env = createIsolatedEnv(
			{
				PATH: "/usr/bin",
				NODE_OPTIONS: "--require /tmp/hook.js",
				XDG_CONFIG_HOME: "/home/dev/.config",
				XDG_RUNTIME_DIR: "/run/user/1000",
			},
			{ vettaHome: "/tmp/p/vh", userDataDir: "/tmp/p/ud", homeDir: "/tmp/p/home", platform: "linux" },
		);
		expect(env).not.toHaveProperty("NODE_OPTIONS");
		expect(env.XDG_CONFIG_HOME).toBe("/tmp/p/home/.config");
		// 不在隔离清单内的 XDG 变量原样保留。
		expect(env.XDG_RUNTIME_DIR).toBe("/run/user/1000");
	});

	it("sets no APPDATA / XDG_* on darwin and still strips host values", () => {
		const env = createIsolatedEnv(
			{
				PATH: "/usr/bin",
				HOME: "/Users/dev",
				NODE_OPTIONS: "--inspect",
				APPDATA: "/should/not/leak",
				XDG_CONFIG_HOME: "/Users/dev/.config",
			},
			{ vettaHome: "/tmp/p/vh", userDataDir: "/tmp/p/ud", homeDir: "/tmp/p/home", platform: "darwin" },
		);
		expect(env).toEqual({
			PATH: "/usr/bin",
			HOME: "/tmp/p/home",
			VETTA_HOME: "/tmp/p/vh",
			VETTA_DESKTOP_USER_DATA_DIR: "/tmp/p/ud",
		});
	});
});
