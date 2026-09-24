// Copyright The Open Forge contributors.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({ getSharedRuntime: () => ({ getSessionPath: () => undefined }) }));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
vi.mock("../app-actions/approval-broker.js", () => ({}));
vi.mock("../conversations/session-paths.js", () => ({ readSessionCwdFromHeader: async () => undefined }));
vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: () => undefined }) }));

// 纯函数 + 真实临时目录：applyOperation/safeJoin 不触 electron。
import { applyOperation, safeJoin } from "./file-organize-broker.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-organize-"));
	roots.push(root);
	return root;
}

describe("safeJoin", () => {
	it("相对路径落项目根内；越界路径拒绝", () => {
		const root = resolve(tmpdir(), "vetta-safe-join-root");
		expect(safeJoin(root, "a/b.txt")).toBe(resolve(root, "a", "b.txt"));
		expect(safeJoin(root, "../outside.txt")).toBeUndefined();
		expect(safeJoin(root, resolve(root, "..", "other.txt"))).toBeUndefined();
	});
});

describe("applyOperation", () => {
	it("重命名成功；重试时已成功项按 skipped 终态报告，不重复写入", async () => {
		const root = await tempRoot();
		await writeFile(join(root, "a.txt"), "x");
		const first = await applyOperation(join(root, "a.txt"), join(root, "b.txt"), "a.txt", "b.txt");
		expect(first.status).toBe("renamed");
		// 重试同一操作：源已不在、目标已存在 → 明确跳过，不再抛错或覆盖。
		const retry = await applyOperation(join(root, "a.txt"), join(root, "b.txt"), "a.txt", "b.txt");
		expect(retry.status).toBe("skipped-source-missing");
	});

	it("目标已存在时跳过，保护既有文件", async () => {
		const root = await tempRoot();
		await writeFile(join(root, "a.txt"), "1");
		await writeFile(join(root, "b.txt"), "2");
		const result = await applyOperation(join(root, "a.txt"), join(root, "b.txt"), "a.txt", "b.txt");
		expect(result.status).toBe("skipped-target-exists");
	});

	it("源缺失直接报告 skipped-source-missing", async () => {
		const root = await tempRoot();
		const result = await applyOperation(join(root, "missing.txt"), join(root, "x.txt"), "missing.txt", "x.txt");
		expect(result.status).toBe("skipped-source-missing");
	});
});
