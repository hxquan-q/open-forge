// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTerminalCapabilitiesCacheForTests } from "../../bottom-panel/hooks/useTerminalCapabilities.js";

/**
 * BUG-0031 回归：归档导出/导入的口令收集此前走 window.prompt，Electron 直接抛
 * "prompt() is not supported"，两个入口必败。修复后应打开共享确认对话框的
 * input 字段，并以用户输入的口令调 sessionArchive IPC。
 */

vi.mock("react-i18next", () => {
	const t = (key: string) => key;
	return { useTranslation: () => ({ t, i18n: { language: "zh" } }) };
});

const sessionArchive = {
	export: vi.fn(async () => ({ saved: true, path: "/out/a.vetta-archive" })),
	import: vi.fn(async () => ({ canceled: false, decisions: [] })),
};

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
	vi.stubGlobal("alert", vi.fn());
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
});
