// Copyright The Open Forge contributors.

/**
 * 设计写队列与原子写（TASK-0309）：
 * 同一设计目录的写串行、单文件 temp+rename 原子替换、失败清理、失败不毒化队列。
 */
import type { PluginFsApi } from "@vetta-org/plugin-sdk";
import { describe, expect, it } from "vitest";
import { atomicWriteFile, queuedAtomicWrite, withDesignWrite } from "../src/shared/design-fs";

interface FakeFs extends PluginFsApi {
	log: string[];
	renames: Array<[string, string]>;
	deletes: string[];
}

function fakeFs(overrides: Partial<Record<keyof PluginFsApi, unknown>> = {}): FakeFs {
	const log: string[] = [];
	const renames: Array<[string, string]> = [];
	const deletes: string[] = [];
	const base = {
		log,
		renames,
		deletes,
		writeFile: async (path: string): Promise<void> => {
			log.push(`write:${path}`);
		},
		rename: async (oldPath: string, newPath: string): Promise<void> => {
			renames.push([oldPath, newPath]);
			log.push(`rename:${oldPath}->${newPath}`);
		},
		delete: async (path: string): Promise<void> => {
			deletes.push(path);
			log.push(`delete:${path}`);
		},
		stat: async () => null,
		readDir: async () => [],
		readFile: async () => ({ content: "", encoding: "utf8" as const }),
		readBinaryFile: async () => ({ data: "", mimeType: "", size: 0 }),
		move: async () => {},
		createDirectory: async () => {},
		listFilesRecursive: async () => [],
		saveAs: async () => null,
		watchDirectory: () => ({ dispose: () => {} }),
	};
	return Object.assign(base, overrides) as FakeFs;
}

describe("withDesignWrite", () => {
	it("同一目录串行：后提交的写等前一个结束才开始", async () => {
		const order: string[] = [];
		const slow = withDesignWrite("/serial-design", async () => {
			order.push("a-start");
			await new Promise((resolve) => setTimeout(resolve, 20));
			order.push("a-end");
		});
		const fast = withDesignWrite("/serial-design", async () => {
			order.push("b-start");
			order.push("b-end");
		});
		await Promise.all([slow, fast]);
		expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
	});

	it("前一个任务失败不毒化队列，后续写照常执行", async () => {
		const first = withDesignWrite("/poison-design", async () => {
			throw new Error("boom");
		}).catch(() => "failed");
		const second = withDesignWrite("/poison-design", async () => "ok");
		await expect(first).resolves.toBe("failed");
		await expect(second).resolves.toBe("ok");
	});
});

describe("atomicWriteFile", () => {
	it("先写 temp 再 rename 覆盖目标，temp 与目标同目录", async () => {
		const fs = fakeFs();
		await atomicWriteFile(fs, "/d/frames/home.tsx", "export default 1");
		expect(fs.renames.length).toBe(1);
		const [from, to] = fs.renames[0];
		expect(from.startsWith("/d/frames/home.tsx.tmp-")).toBe(true);
		expect(to).toBe("/d/frames/home.tsx");
		expect(fs.deletes.length).toBe(0);
	});

	it("temp 写失败时清理 temp，目标文件不被触碰", async () => {
		const fs = fakeFs({
			writeFile: async (path: string): Promise<void> => {
				if (path.includes(".tmp-")) throw new Error("disk full");
			},
		});
		await expect(atomicWriteFile(fs, "/d/theme.css", "x")).rejects.toThrow("disk full");
		expect(fs.renames.length).toBe(0);
		expect(fs.deletes.length).toBe(1);
		expect(fs.deletes[0].includes(".tmp-")).toBe(true);
	});

	it("rename 失败同样清理 temp 并上抛", async () => {
		const fs = fakeFs({
			rename: async (): Promise<void> => {
				throw new Error("EPERM");
			},
		});
		await expect(atomicWriteFile(fs, "/d/theme.css", "x")).rejects.toThrow("EPERM");
		expect(fs.deletes.length).toBe(1);
	});
});

describe("queuedAtomicWrite", () => {
	it("一次调用即一个队列任务，落盘走 rename", async () => {
		const fs = fakeFs();
		await queuedAtomicWrite(fs, "/q-design", "/q-design/design.json", "{}");
		expect(fs.renames.length).toBe(1);
		expect(fs.renames[0][1]).toBe("/q-design/design.json");
	});
});
