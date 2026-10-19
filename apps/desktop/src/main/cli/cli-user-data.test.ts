// Modified by The Open Forge contributors.
import { chmodSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliUserDataDirectory } from "./cli-user-data.js";

const temporaryRoots: string[] = [];

function makeHome(): string {
	const home = mkdtempSync(join(tmpdir(), "cli-user-data-home-"));
	temporaryRoots.push(home);
	return home;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		try {
			chmodSync(root, 0o700);
		} catch {
			// 清理尽力而为。
		}
	}
});

describe("createCliUserDataDirectory（RESEARCH-0032 #16）", () => {
	it("落在 vettaHome/tmp 下且不再依赖共享 os.tmpdir", () => {
		const home = makeHome();
		const directory = createCliUserDataDirectory("openforge-agent-rpc-1234", home);

		expect(directory.startsWith(join(home, "tmp"))).toBe(true);
		expect(directory).toBe(join(home, "tmp", "openforge-agent-rpc-1234"));
		// 目录不能落在共享 tmp 根下（home 本身是 mkdtemp 产物，其前缀之外才算）。
		expect(directory.startsWith(join(home, "tmp", "openforge"))).toBe(true);
		expect(statSync(directory).isDirectory()).toBe(true);
	});

	it("不同 CLI 命令名与 pid 后缀目录彼此隔离", () => {
		const home = makeHome();
		const ocr = createCliUserDataDirectory("openforge-ocr-cli", home);
		const rpc = createCliUserDataDirectory(`openforge-agent-rpc-${process.pid}`, home);

		expect(ocr).not.toBe(rpc);
		expect(statSync(ocr).isDirectory()).toBe(true);
		expect(statSync(rpc).isDirectory()).toBe(true);
	});

	it.runIf(process.platform !== "win32")("新建目录即 0700", () => {
		const home = makeHome();
		const directory = createCliUserDataDirectory("openforge-pdf-cli", home);

		expect(statSync(directory).mode & 0o777).toBe(0o700);
	});

	it.runIf(process.platform !== "win32")("对旧版本遗留的宽松目录收紧到 0700", () => {
		const home = makeHome();
		const directory = join(home, "tmp", "openforge-legacy-cli");
		mkdirSync(directory, { recursive: true, mode: 0o777 });
		chmodSync(directory, 0o777);
		expect(statSync(directory).mode & 0o777).toBe(0o777);

		const returned = createCliUserDataDirectory("openforge-legacy-cli", home);

		expect(returned).toBe(directory);
		expect(statSync(directory).mode & 0o777).toBe(0o700);
	});

	it("创建失败时告警但不阻断，仍返回私有路径", () => {
		const home = makeHome();
		const onWarn = vi.fn();
		const failing = {
			mkdir: () => {
				throw new Error("EACCES");
			},
			chmod: () => {
				throw new Error("unreachable");
			},
		};

		const directory = createCliUserDataDirectory("openforge-help-cli-1", home, onWarn, failing);

		expect(directory).toBe(join(home, "tmp", "openforge-help-cli-1"));
		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(String(onWarn.mock.calls[0]?.[0])).toContain("openforge-help-cli-1");
	});
});
