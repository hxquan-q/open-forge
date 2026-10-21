// Copyright The Open Forge contributors.

import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogWriteFilesResult } from "../../preload/api-types/dialog.js";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-3 / AC-9 的主进程合同面）。
 *
 * 与实现者用例（dialog.test.ts）的差异角度：
 * - AC-3 覆盖 **base64 通道落盘**（docx 经此通道，实现者只测了 utf8）与「取消后目标文件确实未创建」。
 * - AC-9 覆盖 **失败原因分类**（非法名 = "invalid file name" vs 写盘错误 = OS 消息）与
 *   **白名单路径归一化**（同目录的不同写法仍放行）。
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

const SAVE_DATA = "vetta:dialog:save-data";
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
	const dir = await mkdtemp(join(tmpdir(), "vetta-dialog-acc-"));
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
	mocks.getPath.mockReturnValue(join(tmpdir(), "vetta-desktop-acc"));
	registerDialogIpc();
});

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AC-3 · save-data 落盘（base64 通道 + 取消不写）", () => {
	it("base64 编码：内容按二进制解码写入（docx 走此通道）", async () => {
		const dir = await makeTempDir();
		const target = join(dir, "会话.docx");
		const bytes = Buffer.from("PK\u0003\u0004docx-bytes", "latin1");
		mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target });

		const saved = await invoke(SAVE_DATA, "会话.docx", bytes.toString("base64"), "base64");

		expect(saved).toBe(target);
		await expect(readFile(target)).resolves.toEqual(bytes);
	});

	it("显式 defaultDirectory 覆盖缺省桌面（可改路径）", async () => {
		const explicit = join(tmpdir(), "我的导出目录");
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

		await invoke(SAVE_DATA, "a.txt", "x", "utf8", { defaultDirectory: explicit });

		expect(mocks.showSaveDialog).toHaveBeenCalledWith(
			expect.objectContaining({ defaultPath: join(explicit, "a.txt") }),
		);
		// 显式目录存在时不应回落到桌面。
		expect(mocks.getPath).not.toHaveBeenCalledWith("desktop");
	});

	it("取消：返回 null 且目标文件未创建", async () => {
		const dir = await makeTempDir();
		const target = join(dir, "never.txt");
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

		await expect(invoke(SAVE_DATA, "never.txt", "x", "utf8")).resolves.toBeNull();
		await expect(stat(target)).rejects.toThrow();
	});
});

describe("AC-9 · write-files-to-directory（每会话一文件 + 失败原因分类）", () => {
	it("多文件写入：每个文件内容按名字正确落盘，written 回绝对路径", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "会话 s1.txt", utf8: "甲问\n\n甲答" },
				{ name: "会话 s2.docx", base64: Buffer.from("PK-zip", "latin1").toString("base64") },
			],
		})) as DialogWriteFilesResult;

		expect(result.failed).toEqual([]);
		expect(result.written).toEqual([join(dir, "会话 s1.txt"), join(dir, "会话 s2.docx")]);
		await expect(readFile(join(dir, "会话 s1.txt"), "utf8")).resolves.toBe("甲问\n\n甲答");
		await expect(readFile(join(dir, "会话 s2.docx"))).resolves.toEqual(Buffer.from("PK-zip", "latin1"));
	});

	it("失败原因分类：非法名 → invalid file name；写盘错误 → OS 消息（两类可区分）", async () => {
		const dir = await makeTempDir();
		// 与目标同名的子目录 → 该条目 writeFile 必失败（EISDIR/EPERM）。
		await mkdir(join(dir, "被占名"), { recursive: true });
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "../escape.txt", utf8: "x" },
				{ name: "nested/deep.txt", utf8: "x" },
				{ name: "被占名", utf8: "x" },
			],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([]);
		const byName = new Map(result.failed.map((entry) => [entry.name, entry.error]));
		expect(byName.get("../escape.txt")).toBe("invalid file name");
		expect(byName.get("nested/deep.txt")).toBe("invalid file name");
		// 写盘错误带 OS 消息（非 "invalid file name"）。
		expect(byName.get("被占名")).toBeTruthy();
		expect(byName.get("被占名")).not.toBe("invalid file name");
	});

	it("白名单路径归一化：同目录的等价写法（带尾斜杠）仍放行", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: `${dir}/`,
			files: [{ name: "a.txt", utf8: "ok" }],
		})) as DialogWriteFilesResult;

		expect(result.failed).toEqual([]);
		expect(result.written).toEqual([join(dir, "a.txt")]);
	});

	it("未登记目录：拒绝整批（不落盘）", async () => {
		const dir = await makeTempDir();
		await expect(invoke(WRITE_FILES, { directory: dir, files: [{ name: "a.txt", utf8: "x" }] })).rejects.toThrow(
			"not selected by the user",
		);
		await expect(stat(join(dir, "a.txt"))).rejects.toThrow();
	});
});
