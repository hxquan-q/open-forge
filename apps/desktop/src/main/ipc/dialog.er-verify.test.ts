// Copyright The Open Forge contributors.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogWriteFilesResult } from "../../preload/api-types/dialog.js";

/**
 * ER 轮独立复验（F3 主进程：write-files-to-directory 盘上同名防覆盖）。
 *
 * 独立角度（不照抄实现者用例）：全部在**真 fs 临时目录**上跑，逐字节核对原文件未被改写。
 * - 已有同名文件 → 新写入落 `(2)`，且**原文件内容一字未变**；
 * - 连写三次同名 → 落 `(2)(3)`，三个文件都在且内容各异；
 * - 同名**目录**占位 → 该条目进 `failed`，目录及其内部文件未被破坏、也没产生 `(2)`；
 * - 混合批：改名项 `written` 回**真实带序号路径**，占位项进 failed，其余照写；
 * - 序号触顶（1000）不静默覆盖：整批填满时该条目进 failed，原文件全部原样。
 *
 * 只 mock 掉 electron 与重依赖，压 IPC 薄层合同（同 dialog.test.ts）。
 */

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removeHandler: vi.fn(),
	showOpenDialog: vi.fn(),
	showSaveDialog: vi.fn(),
	getPath: vi.fn(),
	allowProjectRoot: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: mocks.getPath },
	dialog: { showOpenDialog: mocks.showOpenDialog, showSaveDialog: mocks.showSaveDialog },
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler),
		removeHandler: mocks.removeHandler,
	},
}));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("./fs.js", () => ({
	allowProjectRoot: mocks.allowProjectRoot,
	assertPathReadableForPreview: vi.fn(),
}));

vi.mock("./linux-portal-dialog.js", () => ({
	selectFoldersWithLinuxPortal: vi.fn(async () => []),
}));

vi.mock("../image-cache/image-cache-service.js", () => ({
	cleanupOldImageCaches: vi.fn(async () => undefined),
	persistImageCache: vi.fn(async () => []),
	persistImageFileCache: vi.fn(async () => []),
}));

const { registerDialogIpc } = await import("./dialog.js");

const SELECT_DIRECTORY = "vetta:dialog:select-directory";
const WRITE_FILES = "vetta:dialog:write-files-to-directory";

function handler(channel: string): (...args: unknown[]) => unknown {
	const found = mocks.handlers.get(channel);
	if (!found) throw new Error(`no handler registered for ${channel}`);
	return found;
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
	return await handler(channel)({}, ...args);
}

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "vetta-dialog-er-verify-"));
	tempDirs.push(dir);
	return dir;
}

async function selectDirectory(directory: string): Promise<void> {
	mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [directory] });
	await invoke(SELECT_DIRECTORY);
}

async function writeFiles(directory: string, files: unknown[]): Promise<DialogWriteFilesResult> {
	return (await invoke(WRITE_FILES, { directory, files })) as DialogWriteFilesResult;
}

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
	mocks.showOpenDialog.mockReset();
	mocks.showSaveDialog.mockReset();
	mocks.getPath.mockReset();
	mocks.getPath.mockReturnValue(join(tmpdir(), "vetta-desktop-er-verify"));
	registerDialogIpc();
});

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("write-files-to-directory 防覆盖 · ER 独立复验（F3）", () => {
	it("已有同名文件 → 新写入落 (2)，且原文件内容**一字未变**", async () => {
		const dir = await makeTempDir();
		const original = "原始内容 ORIGINAL — 不可被改写";
		await writeFile(join(dir, "报告.txt"), original, "utf8");
		await selectDirectory(dir);

		const result = await writeFiles(dir, [{ name: "报告.txt", utf8: "新内容 NEW" }]);

		expect(result.failed).toEqual([]);
		expect(result.written).toEqual([join(dir, "报告 (2).txt")]);
		await expect(readFile(join(dir, "报告.txt"), "utf8")).resolves.toBe(original);
		await expect(readFile(join(dir, "报告 (2).txt"), "utf8")).resolves.toBe("新内容 NEW");
	});

	it("连写三次同名 → 落 (2)(3)，三个文件都在且内容各异", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		const first = await writeFiles(dir, [{ name: "日志.txt", utf8: "第一" }]);
		const second = await writeFiles(dir, [{ name: "日志.txt", utf8: "第二" }]);
		const third = await writeFiles(dir, [{ name: "日志.txt", utf8: "第三" }]);

		expect([first.written[0], second.written[0], third.written[0]]).toEqual([
			join(dir, "日志.txt"),
			join(dir, "日志 (2).txt"),
			join(dir, "日志 (3).txt"),
		]);
		await expect(readFile(join(dir, "日志.txt"), "utf8")).resolves.toBe("第一");
		await expect(readFile(join(dir, "日志 (2).txt"), "utf8")).resolves.toBe("第二");
		await expect(readFile(join(dir, "日志 (3).txt"), "utf8")).resolves.toBe("第三");
	});

	it("同名目录占位 → 该条目进 failed，目录及其内容未被破坏、也没产生 (2)", async () => {
		const dir = await makeTempDir();
		await mkdir(join(dir, "占位"), { recursive: true });
		await writeFile(join(dir, "占位", "keep.txt"), "keep", "utf8");
		await selectDirectory(dir);

		const result = await writeFiles(dir, [{ name: "占位", utf8: "x" }]);

		expect(result.written).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.name).toBe("占位");
		expect((await stat(join(dir, "占位"))).isDirectory()).toBe(true);
		await expect(readFile(join(dir, "占位", "keep.txt"), "utf8")).resolves.toBe("keep");
		await expect(stat(join(dir, "占位 (2)"))).rejects.toThrow();
	});

	it("混合批：改名项 written 回真实带序号路径，占位项进 failed，其余照写", async () => {
		const dir = await makeTempDir();
		await writeFile(join(dir, "甲.txt"), "旧甲", "utf8");
		await mkdir(join(dir, "乙占位"), { recursive: true });
		await selectDirectory(dir);

		const result = await writeFiles(dir, [
			{ name: "甲.txt", utf8: "新甲" },
			{ name: "乙占位", utf8: "x" },
			{ name: "丙.txt", utf8: "新丙" },
		]);

		expect(result.written).toEqual([join(dir, "甲 (2).txt"), join(dir, "丙.txt")]);
		expect(result.failed.map((entry) => entry.name)).toEqual(["乙占位"]);
		await expect(readFile(join(dir, "甲.txt"), "utf8")).resolves.toBe("旧甲");
		await expect(readFile(join(dir, "甲 (2).txt"), "utf8")).resolves.toBe("新甲");
		await expect(readFile(join(dir, "丙.txt"), "utf8")).resolves.toBe("新丙");
	});

	it("序号触顶（1000）不静默覆盖：整批填满时该条目进 failed，原文件全部原样", async () => {
		const dir = await makeTempDir();
		// 占满 base 与 (2)..(1000)，共 1000 个同名文件 → 无可用序号，必须失败而非覆盖。
		const names = ["标题.txt", ...Array.from({ length: 999 }, (_, i) => `标题 (${i + 2}).txt`)];
		for (let i = 0; i < names.length; i += 100) {
			await Promise.all(names.slice(i, i + 100).map((name) => writeFile(join(dir, name), "", "utf8")));
		}
		await selectDirectory(dir);

		const result = await writeFiles(dir, [{ name: "标题.txt", utf8: "新" }]);

		expect(result.written).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.name).toBe("标题.txt");
		// 抽查首尾：原 1000 个文件都没被覆盖。
		await expect(readFile(join(dir, "标题.txt"), "utf8")).resolves.toBe("");
		await expect(readFile(join(dir, "标题 (1000).txt"), "utf8")).resolves.toBe("");
	});
});
