// Copyright The Open Forge contributors.

import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogWriteFilesResult } from "../../preload/api-types/dialog.js";

// 只捕获 ipcMain 句柄；测试不加载真实 electron 二进制。dialog.ts 的重依赖（fs / logger /
// image-cache / linux portal）一律 mock 掉，让本套用例只压 IPC 薄层本身的合同。
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

/** 调用一个已注册的 invoke handler（首个参数是 IPC event，本层不读它）。 */
async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
	return await handler(channel)({}, ...args);
}

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "vetta-dialog-test-"));
	tempDirs.push(dir);
	return dir;
}

/** 让 select-directory 返回指定目录（= 把该目录登记进批量写盘白名单）。 */
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
	mocks.allowProjectRoot.mockClear();
	mocks.getPath.mockReturnValue(join(tmpdir(), "vetta-desktop"));
	registerDialogIpc();
});

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("save-data · 默认目录(T03 AC)", () => {
	it("缺省 defaultDirectory 时起始目录 = 系统桌面", async () => {
		const desktop = join(tmpdir(), "Desktop");
		mocks.getPath.mockReturnValue(desktop);
		// 只关心对话框起始目录；取消以免真的落盘。
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

		await invoke(SAVE_DATA, "会话.txt", "正文", "utf8", undefined);

		expect(mocks.getPath).toHaveBeenCalledWith("desktop");
		expect(mocks.showSaveDialog).toHaveBeenCalledWith(
			expect.objectContaining({ defaultPath: join(desktop, "会话.txt") }),
		);
	});

	it("显式 defaultDirectory 优先于桌面", async () => {
		const explicit = join(tmpdir(), "导出");
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

		await invoke(SAVE_DATA, "a.txt", "x", "utf8", { defaultDirectory: explicit });

		expect(mocks.showSaveDialog).toHaveBeenCalledWith(
			expect.objectContaining({ defaultPath: join(explicit, "a.txt") }),
		);
	});

	it("桌面不可得时退化为只给文件名(既有调用方不崩)", async () => {
		mocks.getPath.mockImplementation(() => {
			throw new Error("no desktop");
		});
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

		await invoke(SAVE_DATA, "a.txt", "x", "utf8", undefined);

		expect(mocks.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "a.txt" }));
	});

	it("既有调用方零回归:utf8 写盘 + 回路径 + 缺省过滤器仍按扩展名", async () => {
		const dir = await makeTempDir();
		const target = join(dir, "legacy.txt");
		mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target });

		const saved = await invoke(SAVE_DATA, "legacy.txt", "hello", "utf8");

		expect(saved).toBe(target);
		await expect(readFile(target, "utf8")).resolves.toBe("hello");
		expect(mocks.showSaveDialog).toHaveBeenCalledWith(
			expect.objectContaining({ filters: [{ name: "TXT", extensions: ["txt"] }] }),
		);
	});

	it("取消返回 null,不写盘", async () => {
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
		await expect(invoke(SAVE_DATA, "a.txt", "x", "utf8", undefined)).resolves.toBeNull();
	});
});

describe("select-directory", () => {
	it("返回用户选中的目录", async () => {
		const dir = await makeTempDir();
		mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dir] });

		await expect(invoke(SELECT_DIRECTORY)).resolves.toBe(dir);
	});

	it("取消返回 null", async () => {
		mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
		await expect(invoke(SELECT_DIRECTORY)).resolves.toBeNull();
	});

	it("不把导出目录加进项目授权根(与 select-folder 的权限面区分)", async () => {
		const dir = await makeTempDir();
		mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [dir] });

		await invoke(SELECT_DIRECTORY);

		expect(mocks.allowProjectRoot).not.toHaveBeenCalled();
	});
});

describe("write-files-to-directory", () => {
	it("成功:把多个文件写进已选目录,回写出的绝对路径", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "a.txt", utf8: "甲" },
				{ name: "b.bin", base64: Buffer.from("乙", "utf8").toString("base64") },
			],
		})) as DialogWriteFilesResult;

		expect(result).toEqual({ written: [join(dir, "a.txt"), join(dir, "b.bin")], failed: [] });
		await expect(readFile(join(dir, "a.txt"), "utf8")).resolves.toBe("甲");
		await expect(readFile(join(dir, "b.bin"), "utf8")).resolves.toBe("乙");
	});

	it("部分失败:一个条目写不了不影响其余,结果如实上报", async () => {
		const dir = await makeTempDir();
		// 造一个与目标同名的子目录 → 该条目 writeFile 必失败(EISDIR/EPERM),其余照写。
		await mkdir(join(dir, "blocked"), { recursive: true });
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "ok.txt", utf8: "ok" },
				{ name: "blocked", utf8: "nope" },
			],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([join(dir, "ok.txt")]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.name).toBe("blocked");
	});

	it("非法名拒绝:路径逃逸 / 分隔符条目不落盘,进 failed", async () => {
		const dir = await makeTempDir();
		const escaped = join(dir, "..", "escape.txt");
		await selectDirectory(dir);

		const result = (await invoke(WRITE_FILES, {
			directory: dir,
			files: [
				{ name: "../escape.txt", utf8: "x" },
				{ name: "nested/deep.txt", utf8: "x" },
			],
		})) as DialogWriteFilesResult;

		expect(result.written).toEqual([]);
		expect(result.failed.map((entry) => entry.name)).toEqual(["../escape.txt", "nested/deep.txt"]);
		await expect(stat(escaped)).rejects.toThrow();
	});

	it("只写用户显式选择的目录:未登记目录被拒", async () => {
		const dir = await makeTempDir();

		await expect(invoke(WRITE_FILES, { directory: dir, files: [{ name: "a.txt", utf8: "x" }] })).rejects.toThrow(
			"not selected by the user",
		);
	});

	it("入参畸形:files 非数组 / 条目内容非二选一 明确报错", async () => {
		const dir = await makeTempDir();
		await selectDirectory(dir);

		await expect(invoke(WRITE_FILES, { directory: dir, files: "nope" })).rejects.toThrow("requires a files array");
		await expect(invoke(WRITE_FILES, { directory: dir, files: [{ name: "a.txt" }] })).rejects.toThrow(
			"exactly one of utf8 or base64",
		);
		await expect(
			invoke(WRITE_FILES, { directory: dir, files: [{ name: "a.txt", utf8: "x", base64: "y" }] }),
		).rejects.toThrow("exactly one of utf8 or base64");
		await expect(invoke(WRITE_FILES, { files: [] })).rejects.toThrow("directory must be a non-empty string");
	});
});

describe("registerDialogIpc · teardown", () => {
	it("注销时移除新增的两个频道", () => {
		// 上一段 beforeEach 已注册一次；这里再注册并取 teardown 校验移除清单。
		const teardown = registerDialogIpc();
		teardown();
		expect(mocks.removeHandler).toHaveBeenCalledWith(SELECT_DIRECTORY);
		expect(mocks.removeHandler).toHaveBeenCalledWith(WRITE_FILES);
	});
});
