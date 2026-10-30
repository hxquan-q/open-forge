// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 终端投屏的完成结算与聊天流闸门解耦（BUG-0157 / 审计 F06）：用户切走会话后，
 * 旧会话的 tool.end 仍要把自己的 feed 条目结算为完成——feed 按事件自身的
 * toolCallId 配对，不写聊天状态；闸门对聊天流的保护由既有 cross-session-leak
 * 套件看守。
 */
import { aiTerminalFeedAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import type { SessionEvent } from "@vetta/runtime-core";
import { getDefaultStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, expect, it } from "vitest";
import { setChatStreamOwner } from "../services/chat-service";
import { useSessionEventController } from "./useSessionEventController";

const store = getDefaultStore();
const activeSessionRef = {
	current: { runtimeId: "session-a", cwd: "C:/work/a", sessionPath: "C:/sessions/a.jsonl" },
};
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

function toolStart(toolCallId: string): SessionEvent {
	return {
		schemaVersion: 1,
		channel: "runtime",
		type: "tool.start",
		sessionId: "session-a",
		eventId: `e-${toolCallId}-s`,
		timestamp: 1,
		source: "runtime-core",
		toolCallId,
		toolName: "bash",
		args: { command: "bun run build" },
		startedAt: 1,
	} as SessionEvent;
}

function toolEnd(toolCallId: string): SessionEvent {
	return {
		schemaVersion: 1,
		channel: "runtime",
		type: "tool.end",
		sessionId: "session-a",
		eventId: `e-${toolCallId}-e`,
		timestamp: 2,
		source: "runtime-core",
		toolCallId,
		toolName: "bash",
		args: { command: "bun run build" },
		startedAt: 1,
		durationMs: 9,
		result: { content: [{ type: "text", text: "build ok" }] },
		isError: false,
	} as SessionEvent;
}

beforeEach(() => {
	setChatStreamOwner("session-a");
	activeSessionRef.current = { runtimeId: "session-a", cwd: "C:/work/a", sessionPath: "C:/sessions/a.jsonl" };
	store.set(aiTerminalFeedAtom, []);
});

it("切走后旧会话的 tool.end 仍结算其终端条目", () => {
	const { result } = renderHook(() => useSessionEventController({ activeSessionRef }), { wrapper });

	act(() => result.current.createSessionEventHandler("session-a")(toolStart("call-1")));
	expect(store.get(aiTerminalFeedAtom)).toHaveLength(1);
	expect(store.get(aiTerminalFeedAtom)[0]?.running).toBe(true);

	// 用户切到会话 B：实例 ref 与模块 owner 都不再认 A（两道闸门全部生效）。
	setChatStreamOwner("session-b");
	activeSessionRef.current = { runtimeId: "session-b", cwd: "C:/work/b", sessionPath: "C:/sessions/b.jsonl" };

	act(() => result.current.createSessionEventHandler("session-a")(toolEnd("call-1")));

	const entry = store.get(aiTerminalFeedAtom)[0];
	expect(entry?.running).toBe(false);
	expect(entry?.output).toBe("build ok");
});

it("未知键的 end 仍为 no-op，不新造条目", () => {
	const { result } = renderHook(() => useSessionEventController({ activeSessionRef }), { wrapper });
	act(() => result.current.createSessionEventHandler("session-a")(toolEnd("call-unknown")));
	expect(store.get(aiTerminalFeedAtom)).toHaveLength(0);
});
