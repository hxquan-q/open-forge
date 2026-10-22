// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraMessage } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type WeKnoraBatchExportResult, useWeKnoraBatchActions } from "./useWeKnoraBatchActions";

/**
 * 外部审查修复轮票 B（ER-B F3 闭环）的实现者用例：批量导出的**写盘结果回映射**。
 *
 * 缺陷：原先按文件名把 `written` 回映射到会话；主进程对盘上同名文件加序号改名后（`标题 (2).txt`），
 * 文件名不再相等 → 该会话被静默漏计（既不在 succeeded 也不在 failed），恰好发生在 F3 要解决的
 * 「重名再导出」场景。现改为**按输入顺序**映射：成功项 = 输入名里未出现在 `failed` 的那些。
 */

const EXPORT_DIR = "/tmp/weknora-er-b-batch";

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

interface ApiOverrides {
	selectDirectory?: () => Promise<string | null>;
	writeFilesToDirectory?: (input: WriteInput) => Promise<WriteResult>;
	loadMessages?: (input: { sessionId: string }) => Promise<WeKnoraMessage[]>;
}

function installApi(overrides: ApiOverrides = {}) {
	const selectDirectory = vi.fn(overrides.selectDirectory ?? (async () => EXPORT_DIR));
	const writeFilesToDirectory = vi.fn(
		overrides.writeFilesToDirectory ??
			(async (input: WriteInput): Promise<WriteResult> => ({
				written: input.files.map((file) => `${EXPORT_DIR}/${file.name}`),
				failed: [],
			})),
	);
	const loadMessages = vi.fn(overrides.loadMessages ?? (async () => [message("m1", "user", "问")]));
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: {
			weknora: { loadMessages } as unknown as DesktopApi["weknora"],
			dialog: { selectDirectory, writeFilesToDirectory } as unknown as DesktopApi["dialog"],
		} as unknown as DesktopApi,
	});
	return { selectDirectory, writeFilesToDirectory, loadMessages };
}

const TITLES: Record<string, string> = { s1: "会话 s1", s2: "会话 s2", s3: "会话 s3" };
const titleOf = (sessionId: string): string => TITLES[sessionId] ?? sessionId;
const removeSession = async () => ({ ok: true, errorCode: null });

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("useWeKnoraBatchActions · 写盘回映射（ER-B F3 闭环）", () => {
	it("盘上已有同名 → 主进程加序号改名：该会话仍正确计入 succeeded", async () => {
		const { writeFilesToDirectory } = installApi({
			// 模拟主进程对 s1 加序号改名（盘上已有 `会话 s1.txt`），s2 原样。
			writeFilesToDirectory: async () => ({
				written: [`${EXPORT_DIR}/会话 s1 (2).txt`, `${EXPORT_DIR}/会话 s2.txt`],
				failed: [],
			}),
		});
		const { result } = renderHook(() => useWeKnoraBatchActions({ removeSession, titleOf }));

		let pending: Promise<WeKnoraBatchExportResult | null> = Promise.resolve(null);
		await act(async () => {
			pending = result.current.exportSessions(["s1", "s2"], "txt");
			await pending;
		});
		const outcome = await pending;

		expect(writeFilesToDirectory).toHaveBeenCalledTimes(1);
		// 改名不再让 s1 被漏计。
		expect(outcome?.succeeded).toEqual(["s1", "s2"]);
		expect(outcome?.failed).toEqual([]);
	});

	it("部分失败：成功项按输入顺序映射（含改名），失败项按请求名映射", async () => {
		const { writeFilesToDirectory } = installApi({
			// 甲改名(盘上已有)、乙写盘失败、丙原样 —— 三个会话都应有明确归属。
			writeFilesToDirectory: async () => ({
				written: [`${EXPORT_DIR}/甲 (2).txt`, `${EXPORT_DIR}/丙.txt`],
				failed: [{ name: "乙.txt", error: "EACCES" }],
			}),
		});
		const { result } = renderHook(() =>
			useWeKnoraBatchActions({ removeSession, titleOf: (id) => ({ s1: "甲", s2: "乙", s3: "丙" })[id] ?? id }),
		);

		let pending: Promise<WeKnoraBatchExportResult | null> = Promise.resolve(null);
		await act(async () => {
			pending = result.current.exportSessions(["s1", "s2", "s3"], "txt");
			await pending;
		});
		const outcome = await pending;

		expect(writeFilesToDirectory).toHaveBeenCalledTimes(1);
		expect(outcome?.succeeded).toEqual(["s1", "s3"]);
		expect(outcome?.failed).toEqual([{ sessionId: "s2", kind: "write", errorCode: null }]);
	});
});
