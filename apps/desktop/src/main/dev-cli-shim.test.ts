import { chmod, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CliShimTargetLockedError, copyFileIfChanged, installBinaryCommandShim } from "./dev-cli-shim.js";

const noRetry = { retryDelaysMs: [] as readonly number[], sleep: () => Promise.resolve() };

async function makeReadonly(path: string): Promise<void> {
	// Windows 上只读属性使 copyFile 覆盖报 EPERM；POSIX 上报 EACCES——
	// 两者都落在实现的目标占用分类里，测试因此可跨平台确定性复现「目标被占用」。
	await chmod(path, 0o444);
}

describe("dev-cli-shim copyFileIfChanged", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "cli-shim-test-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("copies when target is missing", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v1");
		await copyFileIfChanged(source, target, noRetry);
		expect(await readFile(target, "utf8")).toBe("binary-v1");
	});

	it("resolves quietly when the locked target already has identical content", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v1");
		await writeFile(target, "binary-v1");
		// 表象上目标更旧（mtime 前置检查不跳过），会走到 copyFile → 占用 → 内容比对等价 → 静默成功。
		const stale = new Date("2020-01-01T00:00:00Z");
		await utimes(target, stale, stale);
		await makeReadonly(target);
		await copyFileIfChanged(source, target, noRetry);
	});

	it("throws CliShimTargetLockedError when the locked target really differs", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v2-with-more-bytes");
		await writeFile(target, "binary-v1");
		await makeReadonly(target);
		await expect(copyFileIfChanged(source, target, noRetry)).rejects.toBeInstanceOf(CliShimTargetLockedError);
	});

	it("retries the configured budget before reporting the lock", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v2-with-more-bytes");
		await writeFile(target, "binary-v1");
		await makeReadonly(target);
		const sleep = vi.fn(() => Promise.resolve());
		await expect(copyFileIfChanged(source, target, { retryDelaysMs: [0, 0], sleep })).rejects.toBeInstanceOf(
			CliShimTargetLockedError,
		);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("upgrades the stale target when it is not locked", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v2");
		await writeFile(target, "binary-v1-older");
		const stale = new Date("2020-01-01T00:00:00Z");
		await utimes(target, stale, stale);
		await copyFileIfChanged(source, target, noRetry);
		expect(await readFile(target, "utf8")).toBe("binary-v2");
	});
});

describe("dev-cli-shim installBinaryCommandShim", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "cli-shim-install-test-"));
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(dir, { recursive: true, force: true });
	});

	it("downgrades a genuinely locked upgrade to one console warning", async () => {
		const source = join(dir, "openforge-cli-app.exe");
		const target = join(dir, "openforge.exe");
		await writeFile(source, "binary-v2-with-more-bytes");
		await writeFile(target, "binary-v1");
		await makeReadonly(target);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await installBinaryCommandShim(source, target, noRetry);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain("in use");
	});

	it("lets non-lock failures propagate", async () => {
		const source = join(dir, "missing-source.exe");
		const target = join(dir, "openforge.exe");
		await expect(installBinaryCommandShim(source, target, noRetry)).rejects.not.toBeInstanceOf(
			CliShimTargetLockedError,
		);
	});
});
