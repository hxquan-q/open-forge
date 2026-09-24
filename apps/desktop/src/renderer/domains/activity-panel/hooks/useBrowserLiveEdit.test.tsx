// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
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

		await waitFor(() => expect(liveEdit).toHaveBeenCalledWith({ workspaceId: "ws-1", elementRef, action: { type: "state" } }));

		expect(await result.current.applyStyle("color", "red")).toBe(true);
		expect(liveEdit).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			elementRef,
			action: { type: "apply", edit: { kind: "style", property: "color", value: "red" } },
		});
		await waitFor(() => expect(result.current.edits).toHaveLength(1));

		expect(await result.current.revertEdit(0)).toBe(true);
		expect(liveEdit).toHaveBeenLastCalledWith({ workspaceId: "ws-1", elementRef, action: { type: "revert", index: 0 } });
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

	it("没有 elementRef 时不发 IPC", async () => {
		renderHook(() => useBrowserLiveEdit({ workspaceId: "ws-1", elementRef: null }));
		await Promise.resolve();
		expect(liveEdit).not.toHaveBeenCalled();
	});
});
