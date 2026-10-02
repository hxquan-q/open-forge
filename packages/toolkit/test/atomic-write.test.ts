// Copyright The Open Forge contributors.
import type * as NodeFs from "node:fs";
import { closeSync, fsyncSync, renameSync, rmSync, writeSync } from "node:fs";
import type * as NodeFsPromises from "node:fs/promises";
import { mkdtemp, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as NodeTimers from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atomicWriteFile, atomicWriteFileAsync } from "../src/atomic-write.js";

vi.mock("node:fs", async (original) => {
	const actual = await original<typeof NodeFs>();
	return {
		...actual,
		closeSync: vi.fn(actual.closeSync),
		fsyncSync: vi.fn(actual.fsyncSync),
		renameSync: vi.fn(actual.renameSync),
		rmSync: vi.fn(actual.rmSync),
		writeSync: vi.fn(actual.writeSync),
	};
});
vi.mock("node:fs/promises", async (original) => {
	const actual = await original<typeof NodeFsPromises>();
	return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
vi.mock("node:timers/promises", async (original) => {
	const actual = await original<typeof NodeTimers>();
	return { ...actual, setTimeout: vi.fn(async () => undefined) };
});

const roots: string[] = [];
beforeEach(() => {
	vi.mocked(closeSync).mockReset();
	vi.mocked(fsyncSync).mockReset();
	vi.mocked(open).mockReset();
	vi.mocked(rename).mockReset();
	vi.mocked(renameSync).mockReset();
	vi.mocked(rm).mockReset();
	vi.mocked(rmSync).mockReset();
	vi.mocked(writeSync).mockReset();
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

const MULTIBYTE = "héllo 世界 🚀 config-value";

/** 取被 vi.fn(actual.fn) 包装的真实实现，供一次性故障注入内部继续做真实 I/O。 */
function baseImplementation<T extends (...args: never[]) => unknown>(mock: T): T {
	const impl = (mock as unknown as { getMockImplementation?: () => T | undefined }).getMockImplementation?.();
	if (!impl) throw new Error("mock has no base implementation");
	return impl;
}

describe("complete byte and failure contract", () => {
	it("sync 短写后续写满全部字节才提交（多字节内容）", async () => {
		const { dir, target } = await createTarget();
		const realWrite = baseImplementation(vi.mocked(writeSync));
		vi.mocked(writeSync).mockImplementationOnce((fd, buffer, offset, length) => {
			// 第一轮只写 1 个字节并如实返回 1，剩余字节靠调用方循环补齐。
			return realWrite(fd, buffer as Buffer, offset ?? 0, Math.min(1, length ?? (buffer as Buffer).length));
		});
		atomicWriteFile(target, MULTIBYTE);
		expect(await readFile(target, "utf8")).toBe(MULTIBYTE);
		expect(vi.mocked(writeSync).mock.calls.length).toBeGreaterThanOrEqual(2);
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("sync 连续零进度报 I/O 错误，不把部分内容提交到目标", async () => {
		const { dir, target } = await createTarget();
		vi.mocked(writeSync).mockReturnValueOnce(0);
		vi.mocked(writeSync).mockReturnValueOnce(0);
		let caught: unknown;
		try {
			atomicWriteFile(target, MULTIBYTE);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as NodeJS.ErrnoException).code).toBe("EIO");
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("sync fsync 失败保留旧目标、上抛首个错误并清理本次 tmp", async () => {
		const { dir, target } = await createTarget();
		const failure = new Error("fsync primary");
		vi.mocked(fsyncSync).mockImplementationOnce(() => {
			throw failure;
		});
		expect(() => atomicWriteFile(target, "new")).toThrow(failure);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("sync fsync 与 close 同时失败时上抛 fsync 的首个错误", async () => {
		const { dir, target } = await createTarget();
		const primary = new Error("fsync primary");
		const secondary = new Error("close secondary");
		const realClose = baseImplementation(vi.mocked(closeSync));
		vi.mocked(fsyncSync).mockImplementationOnce(() => {
			throw primary;
		});
		vi.mocked(closeSync).mockImplementationOnce((fd) => {
			realClose(fd);
			throw secondary;
		});
		expect(() => atomicWriteFile(target, "new")).toThrow(primary);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("sync 仅 close 失败也不提交目标", async () => {
		const { dir, target } = await createTarget();
		const secondary = new Error("close secondary");
		const realClose = baseImplementation(vi.mocked(closeSync));
		vi.mocked(closeSync).mockImplementationOnce((fd) => {
			realClose(fd);
			throw secondary;
		});
		expect(() => atomicWriteFile(target, "new")).toThrow(secondary);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("空内容是一次合法的成功写入", async () => {
		const { dir, target } = await createTarget();
		atomicWriteFile(target, "");
		expect(await readFile(target, "utf8")).toBe("");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("sync 同路径失败后继续正常写入可以完成，且只清理自己的 tmp", async () => {
		const { dir, target } = await createTarget();
		const unrelated = join(dir, "unrelated.tmp");
		await writeFile(unrelated, "keep");
		const failure = new Error("fsync primary");
		vi.mocked(fsyncSync).mockImplementationOnce(() => {
			throw failure;
		});
		expect(() => atomicWriteFile(target, "new")).toThrow(failure);
		atomicWriteFile(target, "recovered");
		expect(await readFile(target, "utf8")).toBe("recovered");
		expect(await readFile(unrelated, "utf8")).toBe("keep");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual(["unrelated.tmp"]);
	});

	it("async 短写后续写满全部字节才提交", async () => {
		const { dir, target } = await createTarget();
		const realOpen = baseImplementation(vi.mocked(open));
		vi.mocked(open).mockImplementationOnce(async (pathArg, flags) => {
			const handle = await realOpen(pathArg, flags);
			let writeCalls = 0;
			return wrapFileHandle(handle, {
				write: ((buffer: Buffer, offset?: number, length?: number) => {
					writeCalls += 1;
					if (writeCalls === 1) return handle.write(buffer, offset ?? 0, Math.min(1, length ?? buffer.length));
					return handle.write(buffer, offset ?? 0, length);
				}) as NodeFsPromises.FileHandle["write"],
			});
		});
		await atomicWriteFileAsync(target, MULTIBYTE);
		expect(await readFile(target, "utf8")).toBe(MULTIBYTE);
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("async sync 与 close 同时失败时上抛 sync 的首个错误并清理 tmp", async () => {
		const { dir, target } = await createTarget();
		const primary = new Error("async fsync primary");
		const secondary = new Error("async close secondary");
		const realOpen = baseImplementation(vi.mocked(open));
		vi.mocked(open).mockImplementationOnce(async (pathArg, flags) => {
			const handle = await realOpen(pathArg, flags);
			return wrapFileHandle(handle, {
				sync: async () => {
					throw primary;
				},
				close: async () => {
					await handle.close();
					throw secondary;
				},
			});
		});
		await expect(atomicWriteFileAsync(target, "new")).rejects.toBe(primary);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
		await atomicWriteFileAsync(target, "recovered");
		expect(await readFile(target, "utf8")).toBe("recovered");
	});

	it("async 仅 close 失败也不提交目标", async () => {
		const { dir, target } = await createTarget();
		const secondary = new Error("async close secondary");
		const realOpen = baseImplementation(vi.mocked(open));
		vi.mocked(open).mockImplementationOnce(async (pathArg, flags) => {
			const handle = await realOpen(pathArg, flags);
			return wrapFileHandle(handle, {
				close: async () => {
					await handle.close();
					throw secondary;
				},
			});
		});
		await expect(atomicWriteFileAsync(target, "new")).rejects.toBe(secondary);
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("async 零进度报 I/O 错误，不提交部分内容", async () => {
		const { dir, target } = await createTarget();
		const realOpen = baseImplementation(vi.mocked(open));
		vi.mocked(open).mockImplementationOnce(async (pathArg, flags) => {
			const handle = await realOpen(pathArg, flags);
			return wrapFileHandle(handle, {
				write: (async (buffer: Buffer) => ({
					bytesWritten: 0,
					buffer,
				})) as unknown as NodeFsPromises.FileHandle["write"],
			});
		});
		let caught: unknown;
		try {
			await atomicWriteFileAsync(target, MULTIBYTE);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as NodeJS.ErrnoException).code).toBe("EIO");
		expect(await readFile(target, "utf8")).toBe("original");
		expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});
});

function wrapFileHandle(
	handle: NodeFsPromises.FileHandle,
	overrides: Partial<Record<"write" | "sync" | "close", unknown>>,
): NodeFsPromises.FileHandle {
	return new Proxy(handle, {
		get(target, property) {
			if (property in overrides) return overrides[property as keyof typeof overrides];
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as NodeFsPromises.FileHandle;
}
