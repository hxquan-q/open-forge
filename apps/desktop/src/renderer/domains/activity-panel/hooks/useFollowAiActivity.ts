// Modified by The Open Forge contributors.

import type { DesktopBrowserTabEventEnvelope } from "@shared/browser-tab-ipc";
import { activityPanelTabByProjectAtom, aiEditTargetAtom, aiTerminalFeedAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useActivityWorkspace } from "../registry/context";

/** 内置页签 id 与 DefaultChatView 白名单、builtins 定义同源的字面量。 */
const TERMINAL_TAB_ID = "terminal";
const FILE_TAB_ID = "file";
const BROWSER_TAB_ID = "browser";

/**
 * 演示定稿（右栏即 LLM 工作区）：AI 的活动把右栏页签带到对应画面——shell 命令
 * 开跑切「终端」投屏，写类工具发起切「文件」详情，内嵌浏览器会话变化切「浏览器」。
 * 演示语义是跟随：任务执行中 AI 信号优先，用户手动切走会被下一次活动带回；同类
 * 信号连续触发按目标页签去重，不产生多余写入。
 */
export function useFollowAiActivity(): void {
	const workspace = useActivityWorkspace();
	const feed = useAtomValue(aiTerminalFeedAtom);
	const editTarget = useAtomValue(aiEditTargetAtom);
	const setTabByProject = useSetAtom(activityPanelTabByProjectAtom);

	// workspace.id 经 ref 进 effect：跟随逻辑只依赖活动信号本身。
	const workspaceIdRef = useRef(workspace.id);
	workspaceIdRef.current = workspace.id;
	const lastTabRef = useRef<string | null>(null);
	const followRef = useRef<(tabId: string) => void>(() => {});
	followRef.current = (tabId: string) => {
		if (lastTabRef.current === tabId) return;
		lastTabRef.current = tabId;
		setTabByProject((previous) => {
			const map = new Map(previous);
			map.set(workspaceIdRef.current, tabId);
			return map;
		});
	};

	// shell 命令开跑（feed 追加新条目）→ 终端页签（AI 命令投屏）。
	const lastFeedKeyRef = useRef<string | null>(null);
	useEffect(() => {
		const latest = feed.at(-1);
		if (!latest || lastFeedKeyRef.current === latest.key) return;
		lastFeedKeyRef.current = latest.key;
		followRef.current(TERMINAL_TAB_ID);
	}, [feed]);

	// 写类工具发起（编辑目标换文件）→ 文件页签；页签内的预览跟随由
	// useFollowAiFileEdits 负责，这里只负责把页签带到台前。
	const lastFileRef = useRef<string | null>(null);
	useEffect(() => {
		if (!editTarget || lastFileRef.current === editTarget.path) return;
		lastFileRef.current = editTarget.path;
		followRef.current(FILE_TAB_ID);
	}, [editTarget]);

	// 内嵌浏览器会话变化（LLM 或用户打开/导航页面）→ 浏览器页签。
	useEffect(() => {
		const subscribe = window.vetta.browserTab?.onEvent;
		if (!subscribe) return;
		return subscribe((event: DesktopBrowserTabEventEnvelope) => {
			if (event.kind === "session-changed") followRef.current(BROWSER_TAB_ID);
		});
	}, []);
}
