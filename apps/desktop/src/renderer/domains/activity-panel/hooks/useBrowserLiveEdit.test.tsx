// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserLiveEdit } from "./useBrowserLiveEdit";

const elementRef = { id: "e3", pageRevision: 4 };

describe("useBrowserLiveEdit", () => {
	let liveEdit: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		liveEdit = vi.fn(async () => ({ ok: true, edits: [], hasElement: true }));
		window.vetta = { browserTab: { liveEdit } } as unknown as Window["vetta"];
	});

	afterEach(cleanup);

	it("elementRef 就绪时先拉取 guest 既有日志，apply/revert 走 liveEdit IPC 并回报最新 edits", async () => {
		liveEdit
			.mockResolvedValueOnce({ ok: true, edits: [], hasElement: true })
			.mockResolvedValueOnce({
				ok: true,
				edits: [{ kind: "style", property: "color", before: "", after: "red", target: "a > b" }],
				hasElement: true,
			})
			.mockResolvedValueOnce({ ok: true, edits: [], hasElement: true });
		const { result } = renderHook(() => useBrowserLiveEdit({ workspaceId: "ws-1", elementRef }));

		await waitFor(() =>
			expect(liveEdit).toHaveBeenCalledWith({ workspaceId: "ws-1", elementRef, action: { type: "state" } }),
		);

		expect(await result.current.applyStyle("color", "red")).toBe(true);
		expect(liveEdit).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			elementRef,
			action: { type: "apply", edit: { kind: "style", property: "color", value: "red" } },
		});
		await waitFor(() => expect(result.current.edits).toHaveLength(1));

		expect(await result.current.revertEdit(0)).toBe(true);
		expect(liveEdit).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			elementRef,
			action: { type: "revert", index: 0 },
		});
		await waitFor(() => expect(result.current.edits).toHaveLength(0));
	});

	it("stale_reference / no_browser_session 映射为 stale 错误态，其余失败为 apply_failed", async () => {
		liveEdit
			.mockResolvedValueOnce({ ok: true, edits: [], hasElement: true })
			.mockResolvedValueOnce({ ok: false, code: "stale_reference", message: "stale" });
		const { result } = renderHook(() => useBrowserLiveEdit({ workspaceId: "ws-1", elementRef }));
		await waitFor(() => expect(liveEdit).toHaveBeenCalledTimes(1));

		expect(await result.current.applyText("hi")).toBe(false);
		await waitFor(() => expect(result.current.error).toBe("stale_reference"));
	});

	it("重新点选后迟到的旧元素响应不覆盖新元素日志", async () => {
		const refA = { id: "e1", pageRevision: 4 };
		const refB = { id: "e2", pageRevision: 4 };
		const bEdit = { kind: "style" as const, property: "color", before: "", after: "blue", target: "b" };
		const aEdit = { kind: "style" as const, property: "color", before: "", after: "red", target: "a" };
		let resolveApplyA: ((value: unknown) => void) | undefined;
		let resolveStateB: ((value: unknown) => void) | undefined;
		liveEdit.mockImplementation(
			async ({ action, elementRef }: { action: { type: string }; elementRef: { id: string } }) => {
				if (action.type === "state" && elementRef.id === "e1") return { ok: true, edits: [], hasElement: true };
				if (action.type === "apply")
					return new Promise((resolve) => {
						resolveApplyA = resolve;
					});
				if (action.type === "state" && elementRef.id === "e2")
					return new Promise((resolve) => {
						resolveStateB = resolve;
					});
				return { ok: true, edits: [], hasElement: true };
			},
		);
		const hook = renderHook(
			({ elementRef }: { elementRef: { id: string; pageRevision: number } }) =>
				useBrowserLiveEdit({ workspaceId: "ws-1", elementRef }),
			{ initialProps: { elementRef: refA } },
		);
		await waitFor(() => expect(liveEdit).toHaveBeenCalledTimes(1));
		let applying: Promise<boolean> | undefined;
		act(() => {
			applying = hook.result.current.applyStyle("color", "red");
		});
		hook.rerender({ elementRef: refB });
		// 新元素日志先就位，旧元素的 apply 仍在途。
		await act(async () => {
			resolveStateB?.({ ok: true, edits: [bEdit], hasElement: true });
		});
		await waitFor(() => expect(hook.result.current.edits).toHaveLength(1));
		await act(async () => {
			resolveApplyA?.({ ok: true, edits: [aEdit], hasElement: true });
			await applying;
		});
		expect(hook.result.current.edits).toEqual([bEdit]);
		expect(hook.result.current.error).toBeNull();
		expect(hook.result.current.busy).toBe(false);
	});

	it("没有 elementRef 时不发 IPC", async () => {
		renderHook(() => useBrowserLiveEdit({ workspaceId: "ws-1", elementRef: null }));
		await Promise.resolve();
		expect(liveEdit).not.toHaveBeenCalled();
	});
});
