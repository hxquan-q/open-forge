// Copyright The Open Forge contributors.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogWriteFilesResult } from "../../preload/api-types/dialog.js";

/**
 * 外部审查修复轮票 B（ER-B F3）的实现者用例：`write-files-to-directory` 的**盘上同名防覆盖**。
 *
 * 与既有 dialog.test.ts 的差异角度：既有用例都写进**空目录**（无同名冲突），本文件专压
 * 「盘上已有同名文件」这条新增路径 —— 自动加序号、不静默覆盖、`written` 回真实落点。
 * 夹具沿用 dialog.test.ts（只 mock 掉 electron 与重依赖，压 IPC 薄层合同）。
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
	const dir = await mkdtemp(join(tmpdir(), "vetta-dialog-er-b-"));
	tempDirs.push(dir);
	return dir;
}

async function selectDirectory(directory: string): Promise<void> {
	mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [directory] });
	await invoke(SELECT_DIRECTORY);
}

beforeEach(() => {
	mocks.handlers.clear();
	mocks.removeHandler.mockClear();
	mocks.showOpenDialog.mockReset();
	mocks.showSaveDialog.mockReset();
	mocks.getPath.mockReset();
	mocks.getPath.mockReturnValue(join(tmpdir(), "vetta-desktop-er-b"));
	registerDialogIpc();
});

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("write-files-to-directory · 盘上同名防覆盖（ER-B F3）", () => {
	it("盘上已有同名文件：改用 ` (2)`，原文件内容不被覆盖，written 回真实落点", async () => {
		const dir = await makeTempDir();
		await writeFile(join(dir, "标题.txt"), "旧内容", "utf8");
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [{ name: "标题.txt", utf8: "新内容" }],
		})) as DialogWriteFilesResult;

		expect(result.failed).toEqual([]);
		expect(result.written).toEqual([join(dir, "标题 (2).txt")]);
		// 盘上原文件保持原样（不静默覆盖）。
		await expect(readFile(join(dir, "标题.txt"), "utf8")).resolves.toBe("旧内容");
		await expect(readFile(join(dir, "标题 (2).txt"), "utf8")).resolves.toBe("新内容");
	});

	it("连续占用：已有 `标题.txt` 与 `标题 (2).txt` → 落到 `标题 (3).txt`", async () => {
		const dir = await makeTempDir();
		await writeFile(join(dir, "标题.txt"), "a", "utf8");
		await writeFile(join(dir, "标题 (2).txt"), "b", "utf8");
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [{ name: "标题.txt", utf8: "c" }],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "标题 (3).txt")]);
		await expect(readFile(join(dir, "标题 (3).txt"), "utf8")).resolves.toBe("c");
	});

	it("无扩展名的名字也加序号：`会话` → `会话 (2)`", async () => {
		const dir = await makeTempDir();
		await writeFile(join(dir, "会话"), "旧", "utf8");
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [{ name: "会话", utf8: "新" }],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "会话 (2)")]);
		await expect(readFile(join(dir, "会话"), "utf8")).resolves.toBe("旧");
	});

	it("docx（base64 通道）同名也加序号，落盘字节不变", async () => {
		const dir = await makeTempDir();
		const bytes = Buffer.from("PK\u0003\u0004old", "latin1");
		await writeFile(join(dir, "会话.docx"), bytes);
		await selectDirectory(dir);

		const fresh = Buffer.from("PK\u0003\u0004new", "latin1");
		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [{ name: "会话.docx", base64: fresh.toString("base64") }],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "会话 (2).docx")]);
		await expect(readFile(join(dir, "会话.docx"))).resolves.toEqual(bytes);
		await expect(readFile(join(dir, "会话 (2).docx"))).resolves.toEqual(fresh);
	});

	it("批量：每条各自避开盘上同名文件，互不覆盖", async () => {
		const dir = await makeTempDir();
		await writeFile(join(dir, "甲.txt"), "旧甲", "utf8");
		await writeFile(join(dir, "乙.txt"), "旧乙", "utf8");
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "甲.txt", utf8: "新甲" },
				{ name: "乙.txt", utf8: "新乙" },
			],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "甲 (2).txt"), join(dir, "乙 (2).txt")]);
		await expect(readFile(join(dir, "甲.txt"), "utf8")).resolves.toBe("旧甲");
		await expect(readFile(join(dir, "甲 (2).txt"), "utf8")).resolves.toBe("新甲");
		await expect(readFile(join(dir, "乙 (2).txt"), "utf8")).resolves.toBe("新乙");
	});

	it("批内同名（后写条目看得见先写的）：第二个自动加序号", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "同名.txt", utf8: "第一" },
				{ name: "同名.txt", utf8: "第二" },
			],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "同名.txt"), join(dir, "同名 (2).txt")]);
		await expect(readFile(join(dir, "同名.txt"), "utf8")).resolves.toBe("第一");
		await expect(readFile(join(dir, "同名 (2).txt"), "utf8")).resolves.toBe("第二");
	});

	it("目录占位不算「同名文件」：仍按写盘失败如实上报（不静默覆盖、不改名）", async () => {
		const dir = await makeTempDir();
		await mkdir(join(dir, "被占名"), { recursive: true });
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [{ name: "被占名", utf8: "x" }],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.name).toBe("被占名");
		await expect(stat(join(dir, "被占名"))).resolves.toBeTruthy();
	});
});
