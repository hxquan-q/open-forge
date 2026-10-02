// Copyright The Open Forge contributors.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeSshProcessRunner } from "./node-process-runner.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
const originalPlatform = process.platform;

function processFixture() {
	const child = Object.assign(new EventEmitter(), {
		pid: 43121,
		exitCode: null as number | null,
		killed: false,
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: vi.fn(() => {
			child.killed = true;
			return true;
		}),
	});
	spawn.mockReturnValue(child);
	return child;
}

beforeEach(() => {
	vi.useFakeTimers();
	Object.defineProperty(process, "platform", { value: "linux" });
	vi.spyOn(process, "kill").mockReturnValue(true);
});
afterEach(() => {
	Object.defineProperty(process, "platform", { value: originalPlatform });
	vi.useRealTimers();
	vi.restoreAllMocks();
	spawn.mockReset();
});

describe("SSH 进程组生命周期（OS 边界）", () => {
	it("取消清理整个独立进程组，管道未关闭时升级为 KILL", async () => {
		const child = processFixture();
		const controller = new AbortController();
		const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: ["host"], signal: controller.signal });
		controller.abort();
		expect(spawn).toHaveBeenCalledWith("ssh", ["host"], expect.objectContaining({ detached: true }));
		expect(process.kill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
		await vi.advanceTimersByTimeAsync(2000);
		expect(process.kill).toHaveBeenCalledWith(-child.pid, "SIGKILL");
		child.emit("close", null);
		await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: false });
	});
});

describe("ControlMaster 失效（-O exit）", () => {
	it("记录 target 的 ControlPath，invalidate 时对对应 master 发出 -O exit", () => {
		processFixture();
		const runner = createNodeSshProcessRunner({ baseEnv: {} });
		void runner.run({
			argv: ["-o", "ControlMaster=auto", "-o", "ControlPath=/tmp/ctrl/abc123", "-T", "--", "user@host"],
		});
		runner.invalidate("user@host");
		expect(spawn).toHaveBeenLastCalledWith(
			"ssh",
			["-o", "ControlPath=/tmp/ctrl/abc123", "-O", "exit", "--", "user@host"],
			expect.objectContaining({ detached: true }),
		);
	});

	it("没见过的 target 不 spawn，重复 invalidate 也只发一次", () => {
		processFixture();
		const runner = createNodeSshProcessRunner({ baseEnv: {} });
		runner.invalidate("unknown@host");
		expect(spawn).not.toHaveBeenCalled();
		void runner.run({ argv: ["-o", "ControlPath=/tmp/ctrl/x", "--", "user@host"] });
		runner.invalidate("user@host");
		runner.invalidate("user@host");
		expect(spawn).toHaveBeenCalledTimes(2); // 一次 run，一次 -O exit
	});
});

// Public run/open ports with only the OS spawn/signal boundary replaced.
it("父进程已 exit 但未 close 时，取消仍清理持有管道的子孙", async () => {
	const child = processFixture();
	const controller = new AbortController();
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: [], signal: controller.signal });
	child.exitCode = 0;
	child.emit("exit", 0);
	controller.abort();
	expect(process.kill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
	child.emit("close", 0);
	await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: false });
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["signal", "timeout"] as const)("%s 先发生后保留首个原因，完成即清除升级计时器", async (reason) => {
	const child = processFixture();
	const controller = new AbortController();
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({
		argv: [],
		signal: controller.signal,
		timeoutMs: 100,
	});
	if (reason === "signal") controller.abort();
	await vi.advanceTimersByTimeAsync(100);
	controller.abort();
	expect(process.kill).toHaveBeenCalledTimes(1);
	child.emit("close", null);
	await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: reason === "timeout" });
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(5000);
	expect(process.kill).toHaveBeenCalledTimes(1);
});

it("长驻通道 kill 幂等并有 KILL 升级，close 后不再发信号", async () => {
	const child = processFixture();
	const runner = createNodeSshProcessRunner({ baseEnv: {} });
	if (!runner.open) throw new Error("channel port missing");
	const channel = runner.open({ argv: [], onStdout: () => {} });
	channel.kill();
	channel.kill();
	expect(process.kill).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(2000);
	expect(process.kill).toHaveBeenCalledWith(-child.pid, "SIGKILL");
	child.emit("close", null);
	await expect(channel.exited).resolves.toMatchObject({ exitCode: null });
	channel.kill();
	expect(process.kill).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it("Windows 保持单 PID 终止，已发 TERM 不阻止 KILL", async () => {
	Object.defineProperty(process, "platform", { value: "win32" });
	const child = processFixture();
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: [], timeoutMs: 100 });
	expect(spawn).toHaveBeenCalledWith("ssh", [], expect.objectContaining({ detached: false }));
	await vi.advanceTimersByTimeAsync(2100);
	expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
	expect(process.kill).not.toHaveBeenCalled();
	child.emit("close", null);
	await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: true });
});

it("启动失败清理计时器并保留原始错误", async () => {
	const child = processFixture();
	const error = new Error("spawn failed");
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: [], timeoutMs: 100 });
	const assertion = expect(pending).rejects.toBe(error);
	child.emit("error", error);
	await assertion;
	expect(vi.getTimerCount()).toBe(0);
	expect(process.kill).not.toHaveBeenCalled();
});

it("调用前已取消不启动进程，spawn 期间取消也不会丢失", async () => {
	const child = processFixture();
	const controller = new AbortController();
	const runner = createNodeSshProcessRunner({ baseEnv: {} });
	spawn.mockImplementationOnce(() => {
		controller.abort();
		return child;
	});
	const pending = runner.run({ argv: [], signal: controller.signal });
	expect(process.kill).toHaveBeenCalledWith(-child.pid, "SIGTERM");
	child.emit("close", null);
	await expect(pending).resolves.toMatchObject({ aborted: true });
	spawn.mockClear();
	await expect(runner.run({ argv: [], signal: controller.signal })).resolves.toMatchObject({ aborted: true });
	expect(spawn).not.toHaveBeenCalled();
});

it("进程组已不存在时不误向父 PID 再发信号", async () => {
	const child = processFixture();
	vi.mocked(process.kill).mockImplementation(() => {
		throw Object.assign(new Error("gone"), { code: "ESRCH" });
	});
	const controller = new AbortController();
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: [], signal: controller.signal });
	controller.abort();
	expect(child.kill).not.toHaveBeenCalled();
	child.emit("close", null);
	await expect(pending).resolves.toMatchObject({ aborted: true });
});

it("进程组信号不可用时仍尝试终止自己的父 PID", async () => {
	const child = processFixture();
	vi.mocked(process.kill).mockImplementation(() => {
		throw Object.assign(new Error("denied"), { code: "EPERM" });
	});
	const controller = new AbortController();
	const pending = createNodeSshProcessRunner({ baseEnv: {} }).run({ argv: [], signal: controller.signal });
	controller.abort();
	expect(child.kill).toHaveBeenCalledWith("SIGTERM");
	child.emit("close", null);
	await expect(pending).resolves.toMatchObject({ aborted: true });
});
