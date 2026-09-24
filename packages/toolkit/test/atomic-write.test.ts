// Copyright The Open Forge contributors.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteFileAsync } from "../src/atomic-write.js";

const roots: string[] = [];

afterEach(async () => {
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
