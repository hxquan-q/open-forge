// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { planModeStateBySessionAtom } from "@shared/store/atoms";
import { CODING_AGENT_PLAN_MODE_OBSERVATION } from "@vetta/coding-agent/session-extensions";
import type { SessionEvent } from "@vetta/runtime-core";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { setChatStreamOwner } from "../services/chat-service";
import { useSessionEventController } from "./useSessionEventController";

function planModeEvent(payload: Record<string, unknown>): SessionEvent {
	return {
		schemaVersion: 1,
		channel: "runtime",
		type: "session.extension",
		sessionId: "session-1",
		eventId: `event-${Math.random().toString(36).slice(2)}`,
		timestamp: 1,
		source: "extension",
		extensionId: CODING_AGENT_PLAN_MODE_OBSERVATION.extensionId,
		event: CODING_AGENT_PLAN_MODE_OBSERVATION.event,
		payload,
	} as unknown as SessionEvent;
}

describe("useSessionEventController 内存上界", () => {
	it("计划模式回落 default 且无计划时删除投影键，而不是覆盖后永久保留", () => {
		const store = createStore();
		setChatStreamOwner("session-1");
		store.set(planModeStateBySessionAtom, {
			"session-1": { permissionMode: "plan" },
			"session-other": { permissionMode: "plan" },
		});
		const activeSessionRef = {
			current: { runtimeId: "session-1", cwd: "C:/workspace", sessionPath: "C:/sessions/session-1.jsonl" },
		};
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useSessionEventController({ activeSessionRef }), { wrapper });

		act(() => result.current.createSessionEventHandler("session-1")(planModeEvent({ permissionMode: "default" })));

		// 没有记录即视为未开启：本会话键被删除，其他会话不受影响。
		expect(store.get(planModeStateBySessionAtom)).toEqual({ "session-other": { permissionMode: "plan" } });

		act(() => result.current.createSessionEventHandler("session-1")(planModeEvent({ permissionMode: "plan" })));
		expect(store.get(planModeStateBySessionAtom)).toEqual({
			"session-other": { permissionMode: "plan" },
			"session-1": { permissionMode: "plan" },
		});
	});

	it("携带已提交计划的状态仍然保留投影，供计划面板回看", () => {
		const store = createStore();
		setChatStreamOwner("session-1");
		const activeSessionRef = {
			current: { runtimeId: "session-1", cwd: "C:/workspace", sessionPath: "C:/sessions/session-1.jsonl" },
		};
		const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useSessionEventController({ activeSessionRef }), { wrapper });
		const plan = { content: "plan-body", status: "approved", updatedAt: "2026-09-22T00:00:00.000Z" };

		act(() =>
			result.current
				.createSessionEventHandler("session-1")
				(planModeEvent({ permissionMode: "default", plan })),
		);

		expect(store.get(planModeStateBySessionAtom)).toEqual({
			"session-1": { permissionMode: "default", plan },
		});
	});
});
