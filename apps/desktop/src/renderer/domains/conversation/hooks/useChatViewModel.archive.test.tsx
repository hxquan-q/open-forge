// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastsAtom } from "@shared/store/toast-atoms";
import { resetTerminalCapabilitiesCacheForTests } from "../../bottom-panel/hooks/useTerminalCapabilities.js";

/**
 * BUG-0031 回归：归档导出/导入的口令收集此前走 window.prompt，Electron 直接抛
 * "prompt() is not supported"，两个入口必败。修复后应打开共享确认对话框的
 * input 字段，并以用户输入的口令调 sessionArchive IPC。
 *
 * TASK-0349：导出/导入结果与失败改为全局 Toast，不再弹同步阻塞式 alert。
 */

vi.mock("react-i18next", () => {
	const t = (key: string) => key;
	return { useTranslation: () => ({ t, i18n: { language: "zh" } }) };
});

// 测试环境不初始化 i18next（t 返回 undefined）；口令只关心 key 语义，直接返回 key。
vi.mock("@shared/i18n", () => ({
	i18n: { t: (key: string) => key },
}));

const sessionArchive = {
	export: vi.fn(async () => ({ saved: true, path: "/out/a.vetta-archive" })),
	import: vi.fn(
		async (): Promise<{
			canceled: boolean;
			decisions: Array<{
				fingerprint: string;
				sessionId: string;
				conflict: { action: string; reason: string };
			}>;
		}> => ({ canceled: false, decisions: [] }),
	),
};

const alertSpy = vi.fn();

function stubVettaWindow(): void {
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			window: {
				isAlwaysOnTop: async () => false,
				toggleAlwaysOnTop: async () => true,
			},
			terminal: {
				capabilities: async () => ({ localPty: false }),
			},
			sessionArchive,
		},
	});
	vi.stubGlobal("alert", alertSpy);
}

const { useChatViewModel } = await import("./useChatViewModel.js");
const atoms = await import("@shared/store/atoms");

function makeActiveSession() {
	return {
		runtimeId: "rt-1",
		sessionPath: "/sessions/a.jsonl",
		cwd: "/repo/a",
	} as never;
}

describe("useChatViewModel 归档导出/导入口令", () => {
	beforeEach(() => {
		resetTerminalCapabilitiesCacheForTests();
		stubVettaWindow();
		sessionArchive.export.mockClear();
		sessionArchive.import.mockClear();
		alertSpy.mockClear();
		getDefaultStore().set(toastsAtom, []);
		const store = getDefaultStore();
		store.set(atoms.chatMessagesAtom, [
			{ id: "m1", role: "user", blocks: [{ type: "text", text: "hi" }] },
		] as never);
		store.set(atoms.activeSessionAtom, makeActiveSession());
		store.set(atoms.pendingSessionOpenAtom, null);
		store.set(atoms.confirmDialogAtom, null);
	});

	it("exportArchive 打开带 input 的确认对话框，不触碰 window.prompt", () => {
		const promptSpy = vi.fn(() => null);
		vi.stubGlobal("prompt", promptSpy);
		const { result } = renderHook(() => useChatViewModel());

		act(() => result.current.actions.exportArchive());

		expect(promptSpy).not.toHaveBeenCalled();
		const dialog = getDefaultStore().get(atoms.confirmDialogAtom);
		expect(dialog).not.toBeNull();
		expect(dialog?.input?.password).toBe(true);
		expect(sessionArchive.export).not.toHaveBeenCalled();
	});

	it("确认对话框回传口令后才调 sessionArchive.export", async () => {
		const { result } = renderHook(() => useChatViewModel());
		act(() => result.current.actions.exportArchive());
		const dialog = getDefaultStore().get(atoms.confirmDialogAtom);
		expect(dialog?.input).toBeDefined();

		await act(async () => {
			dialog?.onConfirm(false, "s3cret");
		});

		expect(sessionArchive.export).toHaveBeenCalledWith({
			sessionPath: "/sessions/a.jsonl",
			passphrase: "s3cret",
			defaultFileName: expect.anything(),
		});
	});

	it("importArchive 同样走对话框并把口令传给 sessionArchive.import", async () => {
		const { result } = renderHook(() => useChatViewModel());
		act(() => result.current.actions.importArchive());
		const dialog = getDefaultStore().get(atoms.confirmDialogAtom);
		expect(dialog?.input).toBeDefined();

		await act(async () => {
			dialog?.onConfirm(false, "pw");
		});

		expect(sessionArchive.import).toHaveBeenCalledWith({ passphrase: "pw" });
	});

	it("无活动会话时 exportArchive 不打开对话框", () => {
		getDefaultStore().set(atoms.activeSessionAtom, null);
		const { result } = renderHook(() => useChatViewModel());
		act(() => result.current.actions.exportArchive());
		expect(getDefaultStore().get(atoms.confirmDialogAtom)).toBeNull();
	});

	it("导入结果以成功 Toast 呈现而不是阻塞式 alert", async () => {
		sessionArchive.import.mockResolvedValueOnce({
			canceled: false,
			decisions: [{ fingerprint: "fp", sessionId: "s1", conflict: { action: "create-copy", reason: "default" } }],
		});
		const { result } = renderHook(() => useChatViewModel());
		act(() => result.current.actions.importArchive());
		const dialog = getDefaultStore().get(atoms.confirmDialogAtom);

		await act(async () => {
			dialog?.onConfirm(false, "");
		});

		expect(alertSpy).not.toHaveBeenCalled();
		const toasts = getDefaultStore().get(toastsAtom);
		expect(toasts).toHaveLength(1);
		expect(toasts[0]?.variant).toBe("success");
		expect(toasts[0]?.message).toMatch(/doneCopy|已导入为新会话副本/);
	});

	it("导出失败以错误 Toast 呈现而不是阻塞式 alert", async () => {
		sessionArchive.export.mockRejectedValueOnce(new Error("disk full"));
		const { result } = renderHook(() => useChatViewModel());
		act(() => result.current.actions.exportArchive());
		const dialog = getDefaultStore().get(atoms.confirmDialogAtom);

		await act(async () => {
			dialog?.onConfirm(false, "");
		});

		expect(alertSpy).not.toHaveBeenCalled();
		const toasts = getDefaultStore().get(toastsAtom);
		expect(toasts).toHaveLength(1);
		expect(toasts[0]?.variant).toBe("error");
		expect(toasts[0]?.message).toMatch(/archiveExport\.failed|导出会话归档失败/);
	});
});
