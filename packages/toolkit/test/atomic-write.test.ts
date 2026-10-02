// Copyright The Open Forge contributors.
import type * as NodeFs from "node:fs";
import { renameSync, rmSync } from "node:fs";
import type * as NodeFsPromises from "node:fs/promises";
import { mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as NodeTimers from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atomicWriteFile, atomicWriteFileAsync } from "../src/atomic-write.js";

vi.mock("node:fs", async (original) => {
	const actual = await original<typeof NodeFs>();
	return { ...actual, renameSync: vi.fn(actual.renameSync), rmSync: vi.fn(actual.rmSync) };
});
vi.mock("node:fs/promises", async (original) => {
	const actual = await original<typeof NodeFsPromises>();
	return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
vi.mock("node:timers/promises", async (original) => {
	const actual = await original<typeof NodeTimers>();
	return { ...actual, setTimeout: vi.fn(async () => undefined) };
});

const roots: string[] = [];
beforeEach(() => {
	vi.mocked(rename).mockReset();
	vi.mocked(renameSync).mockReset();
	vi.mocked(rm).mockReset();
	vi.mocked(rmSync).mockReset();
	vi.spyOn(Atomics, "wait").mockReturnValue("timed-out");
});

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("atomic write", () => {
	it("并发写同一目标文件时每次写入都成功且不互相冲掉临时文件", async () => {
		// BUG-0020 根因之一：临时文件名只带 pid，同进程并发写同一路径会共用同一个
		// 临时文件；Windows 上第二个写入句柄还开着时 rename 直接 EPERM/EBUSY
		// （「文件被占用」），或后者 rename 时 ENOENT。Canvas 连续两次写同一
		// artifact 版本时正是这个形态。
		const dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
		roots.push(dir);
		const target = join(dir, "v2.md");
		const writers = 24;
		await Promise.all(Array.from({ length: writers }, (_, index) => atomicWriteFileAsync(target, `writer-${index}`)));
		const content = await readFile(target, "utf8");
		expect(content).toMatch(/^writer-\d+$/);
		const leftovers = (await readdir(dir)).filter((name) => name.endsWith(".tmp"));
		expect(leftovers).toEqual([]);
	});
});

async function createTarget(): Promise<{ dir: string; target: string }> {
	const dir = await mkdtemp(join(tmpdir(), "atomic-lock-retry-"));
	roots.push(dir);
	const target = join(dir, "config.json");
	await writeFile(target, "original");
	return { dir, target };
}

describe("transient rename failures", () => {
	it.each(["EPERM", "EACCES", "EBUSY"])("retries a synchronous %s without destroying the target", async (code) => {
		const { dir, target } = await createTarget();
		vi.mocked(renameSync).mockImplementationOnce(() => {
			throw Object.assign(new Error("locked"), { code });
		});
		atomicWriteFile(target, "new");
		expect(await readFile(target, "utf8")).toBe("new");
		expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(2);
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("keeps the same-path queue while retrying a temporary async lock", async () => {
		const { target } = await createTarget();
		vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EBUSY" }));
		await Promise.all([atomicWriteFileAsync(target, "first"), atomicWriteFileAsync(target, "second")]);
		expect(await readFile(target, "utf8")).toBe("second");
		expect(vi.mocked(rename)).toHaveBeenCalledTimes(3);
		expect(vi.mocked(rename).mock.calls[0]?.[0]).toBe(vi.mocked(rename).mock.calls[1]?.[0]);
		expect(vi.mocked(rename).mock.calls[2]?.[0]).not.toBe(vi.mocked(rename).mock.calls[0]?.[0]);
	});

	it("does not retry a permanent error and preserves it if temp cleanup fails", async () => {
		const { target } = await createTarget();
		const failure = Object.assign(new Error("disk failed"), { code: "EIO" });
		vi.mocked(renameSync).mockImplementationOnce(() => {
			throw failure;
		});
		vi.mocked(rmSync).mockImplementationOnce(() => {
			throw new Error("cleanup failed");
		});
		expect(() => atomicWriteFile(target, "new")).toThrow(failure);
		expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(rmSync)).toHaveBeenCalledTimes(1);
		expect(await readFile(target, "utf8")).toBe("original");
	});

	it("exhausts its async retry budget, cleans only its temp file, and releases the queue", async () => {
		const { dir, target } = await createTarget();
		const failure = Object.assign(new Error("locked"), { code: "EPERM" });
		vi.mocked(rename).mockRejectedValue(failure);
		await expect(atomicWriteFileAsync(target, "not-saved")).rejects.toBe(failure);
		expect(vi.mocked(rename)).toHaveBeenCalledTimes(30);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
		vi.mocked(rename).mockReset();
		await atomicWriteFileAsync(target, "recovered");
		expect(await readFile(target, "utf8")).toBe("recovered");
	});
});

describe("rename retry failure budgets", () => {
	it("bounds synchronous retries and leaves the old target intact", async () => {
		const { dir, target } = await createTarget();
		const failure = Object.assign(new Error("locked"), { code: "EBUSY" });
		vi.mocked(renameSync).mockImplementation(() => {
			throw failure;
		});
		let caught: unknown;
		try {
			atomicWriteFile(target, "not-saved");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(failure);
		expect(vi.mocked(renameSync)).toHaveBeenCalledTimes(10);
		expect(Atomics.wait).toHaveBeenCalledTimes(9);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("preserves a permanent async error even when cleanup fails", async () => {
		const { target } = await createTarget();
		const failure = Object.assign(new Error("disk failed"), { code: "EIO" });
		vi.mocked(rename).mockRejectedValueOnce(failure);
		vi.mocked(rm).mockRejectedValueOnce(new Error("cleanup failed"));
		await expect(atomicWriteFileAsync(target, "not-saved")).rejects.toBe(failure);
		expect(vi.mocked(rename)).toHaveBeenCalledTimes(1);
		expect(await readFile(target, "utf8")).toBe("original");
		await atomicWriteFileAsync(target, "recovered");
		expect(await readFile(target, "utf8")).toBe("recovered");
	});
});
