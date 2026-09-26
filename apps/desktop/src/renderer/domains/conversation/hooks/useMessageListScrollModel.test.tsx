// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { createConversationUserMessage } from "@shared/conversation";
import {
	getDefaultStore,
} from "jotai";
import { TRANSCRIPT_WINDOW_FIRST_INDEX, transcriptWindowStateAtom } from "@shared/store/atoms";
import type { VirtuosoHandle } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";
import { useMessageListScrollModel } from "./useMessageListScrollModel";

describe("useMessageListScrollModel navigation", () => {
	it("keeps the adapter model stable across unrelated rerenders", () => {
		const messages = [createConversationUserMessage({ id: "message-1", text: "hello" })];
		const { result, rerender } = renderHook(
			({ renderPass }) => {
				void renderPass;
				return useMessageListScrollModel({
					isStreaming: false,
					messages,
					sessionId: "session-stable",
				});
			},
			{ initialProps: { renderPass: 0 } },
		);
		const first = result.current;

		rerender({ renderPass: 1 });

		expect(result.current).toBe(first);
	});

	it("uses the shared Virtuoso instance to jump to an exact message", () => {
		const scrollToIndex = vi.fn();
		const { result } = renderHook(() =>
			useMessageListScrollModel({
				isStreaming: true,
				messages: [createConversationUserMessage({ id: "message-1", text: "hello" })],
				sessionId: "session-1",
			}),
		);
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			scrollToIndex,
		} as unknown as VirtuosoHandle;

		// TASK-0050：列表以 firstItemIndex=1M 作为 Virtuoso 索引基数——数组下标要换成绝对索引。
		act(() => result.current.scrollToMessage(4));

		expect(scrollToIndex).toHaveBeenCalledWith({
			index: TRANSCRIPT_WINDOW_FIRST_INDEX + 4,
			align: "start",
			behavior: "smooth",
		});
	});

	it("向上翻页后 firstItemIndex 前移，scrollToMessage 跟随同一偏移", () => {
		getDefaultStore().set(transcriptWindowStateAtom, {
			sessionPath: "/sessions/paged.jsonl",
			firstItemIndex: TRANSCRIPT_WINDOW_FIRST_INDEX - 3,
			hasMore: true,
			loadingOlder: false,
		});
		const scrollToIndex = vi.fn();
		const { result } = renderHook(() =>
			useMessageListScrollModel({
				isStreaming: false,
				messages: [createConversationUserMessage({ id: "message-1", text: "hello" })],
				sessionId: "session-paged",
			}),
		);
		(result.current.virtuosoRef as { current: VirtuosoHandle | null }).current = {
			scrollToIndex,
		} as unknown as VirtuosoHandle;

		act(() => result.current.scrollToMessage(4));

		expect(scrollToIndex).toHaveBeenCalledWith({
			index: TRANSCRIPT_WINDOW_FIRST_INDEX - 3 + 4,
			align: "start",
			behavior: "smooth",
		});
		getDefaultStore().set(transcriptWindowStateAtom, {
			sessionPath: null,
			firstItemIndex: TRANSCRIPT_WINDOW_FIRST_INDEX,
			hasMore: false,
			loadingOlder: false,
		});
	});
});
