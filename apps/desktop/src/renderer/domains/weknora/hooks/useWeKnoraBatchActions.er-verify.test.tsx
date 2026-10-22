// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraMessage } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type WeKnoraBatchExportResult, useWeKnoraBatchActions } from "./useWeKnoraBatchActions";

/**
 * ER 轮独立复验（F3 闭环 · 渲染层）：批量导出写盘结果**按输入顺序**回映射到会话。
 *
 * 独立角度（不照抄实现者用例）——用**名字互相包含**的对抗场景证明「不靠文件名相等」：
 * 会话 A 标题「会话」→ 请求名 `会话.txt`；会话 B 标题「会话 (2)」→ 请求名 `会话 (2).txt`。
 * 盘上已有 `会话.txt` 时主进程把 A 改成 `会话 (2).txt`；B 随即也被改成 `会话 (2) (2).txt`。
 * 此时「按文件名相等」的旧映射会把 A 的落点错配给 B、并彻底漏掉 B —— 输入顺序映射则两者都对。
 *
 * 另测「改名 + 部分失败」混合：每个会话都必须有明确归属（既不漏也不重）。
 */

const EXPORT_DIR = "/tmp/weknora-er-verify-batch";

function message(id: string, role: "user" | "assistant", content: string): WeKnoraMessage {
	return { id, role, content };
}

interface WriteInput {
	directory: string;
	files: Array<{ name: string }>;
}

interface WriteResult {
	written: string[];
	failed: Array<{ name: string; error: string }>;
}

function installApi(overrides: { writeFilesToDirectory?: (input: WriteInput) => Promise<WriteResult> } = {}) {
	const selectDirectory = vi.fn(async () => EXPORT_DIR);
	const writeFilesToDirectory = vi.fn(
		overrides.writeFilesToDirectory ??
			(async (input: WriteInput): Promise<WriteResult> => ({
				written: input.files.map((file) => `${EXPORT_DIR}/${file.name}`),
				failed: [],
			})),
	);
	const loadMessages = vi.fn(async () => [message("m1", "user", "问")]);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: {
			weknora: { loadMessages } as unknown as DesktopApi["weknora"],
			dialog: { selectDirectory, writeFilesToDirectory } as unknown as DesktopApi["dialog"],
		} as unknown as DesktopApi,
	});
	return { selectDirectory, writeFilesToDirectory };
}

const removeSession = async () => ({ ok: true, errorCode: null });

async function runExport(
	result: { current: ReturnType<typeof useWeKnoraBatchActions> },
	sessionIds: string[],
): Promise<WeKnoraBatchExportResult | null> {
	let pending: Promise<WeKnoraBatchExportResult | null> = Promise.resolve(null);
	await act(async () => {
		pending = result.current.exportSessions(sessionIds, "txt");
		await pending;
	});
	return await pending;
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("useWeKnoraBatchActions 写盘回映射 · ER 独立复验（F3 闭环）", () => {
	it("名字互相包含（`会话` vs `会话 (2)`）+ 双双改名：会话归属仍按输入顺序正确", async () => {
		// A 请求 `会话.txt`，B 请求 `会话 (2).txt`；主进程因盘上同名把两者都加了序号。
		const { writeFilesToDirectory } = installApi({
			writeFilesToDirectory: async () => ({
				written: [`${EXPORT_DIR}/会话 (2).txt`, `${EXPORT_DIR}/会话 (2) (2).txt`],
				failed: [],
			}),
		});
		const { result } = renderHook(() =>
			useWeKnoraBatchActions({ removeSession, titleOf: (id) => ({ a: "会话", b: "会话 (2)" })[id] ?? id }),
		);

		const outcome = await runExport(result, ["a", "b"]);

		expect(writeFilesToDirectory).toHaveBeenCalledTimes(1);
		// 输入顺序映射：a 与 b 都正确计入（旧「按文件名相等」会把 a 错配给 b、并漏掉 b）。
		expect(outcome?.succeeded).toEqual(["a", "b"]);
		expect(outcome?.failed).toEqual([]);
	});

	it("改名 + 部分失败混合：成功项按输入顺序、失败项按请求名，三者归属互不串台", async () => {
		// 输入序 [s1,s2,s3]：s1 正常、s2 被主进程改名、s3 写盘失败。
		const { writeFilesToDirectory } = installApi({
			writeFilesToDirectory: async () => ({
				written: [`${EXPORT_DIR}/一.txt`, `${EXPORT_DIR}/二 (2).txt`],
				failed: [{ name: "三.txt", error: "EACCES" }],
			}),
		});
		const { result } = renderHook(() =>
			useWeKnoraBatchActions({ removeSession, titleOf: (id) => ({ s1: "一", s2: "二", s3: "三" })[id] ?? id }),
		);

		const outcome = await runExport(result, ["s1", "s2", "s3"]);

		expect(outcome?.succeeded).toEqual(["s1", "s2"]);
		expect(outcome?.failed).toEqual([{ sessionId: "s3", kind: "write", errorCode: null }]);
	});

	it("全部改名：无一漏计（成功数 == 输入数）", async () => {
		const { writeFilesToDirectory } = installApi({
			writeFilesToDirectory: async () => ({
				written: [
					`${EXPORT_DIR}/x (2).txt`,
					`${EXPORT_DIR}/y (2).txt`,
					`${EXPORT_DIR}/z (2).txt`,
				],
				failed: [],
			}),
		});
		const { result } = renderHook(() =>
			useWeKnoraBatchActions({ removeSession, titleOf: (id) => ({ s1: "x", s2: "y", s3: "z" })[id] ?? id }),
		);

		const outcome = await runExport(result, ["s1", "s2", "s3"]);

		expect(writeFilesToDirectory).toHaveBeenCalledTimes(1);
		expect(outcome?.succeeded).toEqual(["s1", "s2", "s3"]);
		expect(outcome?.failed).toEqual([]);
	});
});
