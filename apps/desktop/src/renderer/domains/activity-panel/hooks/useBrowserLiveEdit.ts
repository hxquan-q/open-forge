// Copyright The Open Forge contributors.

import type { BrowserElementLiveEdit, BrowserElementRef } from "@vetta/coding-agent/function-extensions";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBrowserLiveEditAction } from "@/shared/browser-tab-ipc";

export type BrowserLiveEditError = "stale_reference" | "apply_failed" | "unavailable";

/**
 * 点选命中后的页面内即时预览动作（TASK-0085）。
 * 每次调用经 `browserTab.liveEdit` IPC 落进 WebView guest，返回的 edits 是 guest 日志的权威快照。
 * elementRef 变化（重新点选）时先拉回 guest 侧既有日志——跨元素的改动记录不清空。
 */
export function useBrowserLiveEdit(input: { workspaceId: string; elementRef: BrowserElementRef | null }): {
	edits: readonly BrowserElementLiveEdit[];
	busy: boolean;
	error: BrowserLiveEditError | null;
	hasElement: boolean;
	applyStyle: (property: string, value: string) => Promise<boolean>;
	applyText: (value: string) => Promise<boolean>;
	revertEdit: (index: number) => Promise<boolean>;
	revertAll: () => Promise<boolean>;
} {
	const { workspaceId, elementRef } = input;
	const [edits, setEdits] = useState<readonly BrowserElementLiveEdit[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<BrowserLiveEditError | null>(null);
	const [hasElement, setHasElement] = useState(true);
	/** 代次守卫：重新点选/换工作空间后，在途调用的迟到响应不再提交状态。 */
	const runSeqRef = useRef(0);

	const run = useCallback(
		async (action: DesktopBrowserLiveEditAction): Promise<boolean> => {
			if (!elementRef) return false;
			const sequence = ++runSeqRef.current;
			setBusy(true);
			try {
				const result = await window.vetta.browserTab.liveEdit({ workspaceId, elementRef, action });
				if (sequence !== runSeqRef.current) return false;
				if (!result.ok) {
					setError(
						result.code === "stale_reference" || result.code === "no_browser_session"
							? "stale_reference"
							: "apply_failed",
					);
					return false;
				}
				setEdits(result.edits);
				setHasElement(result.hasElement !== false);
				setError(null);
				return true;
			} catch {
				if (sequence === runSeqRef.current) setError("unavailable");
				return false;
			} finally {
				if (sequence === runSeqRef.current) setBusy(false);
			}
		},
		[elementRef, workspaceId],
	);

	useEffect(() => {
		// 新元素使在途调用的迟到响应全部失效，再拉取 guest 侧既有日志。
		runSeqRef.current += 1;
		setEdits([]);
		setError(null);
		setHasElement(true);
		setBusy(false);
		if (elementRef) void run({ type: "state" });
	}, [elementRef, run]);

	const applyStyle = useCallback(
		(property: string, value: string) => run({ type: "apply", edit: { kind: "style", property, value } }),
		[run],
	);
	const applyText = useCallback((value: string) => run({ type: "apply", edit: { kind: "text", value } }), [run]);
	const revertEdit = useCallback((index: number) => run({ type: "revert", index }), [run]);
	const revertAll = useCallback(() => run({ type: "revert" }), [run]);

	return { edits, busy, error, hasElement, applyStyle, applyText, revertEdit, revertAll };
}
