// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import {
	activityPanelTabByProjectAtom,
	canvasArtifactRevisionAtom,
	canvasUnreadCountAtom,
	mountedActivityWorkspacesAtom,
	pendingCanvasArtifactIdAtom,
} from "@shared/store/atoms";
import type { SessionEvent } from "@vetta/runtime-core";
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { getDefaultStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { setChatStreamOwner } from "../services/chat-service";
import { useSessionEventController } from "./useSessionEventController";

const CHAT_CWD = "C:/work/chat";
const TEAM_WORKSPACE_ID = "agent-team:team-1:team";

function artifactEvent(artifactId: string): SessionEvent {
	const artifact: ArtifactDescriptor = {
		schemaVersion: 1,
		artifactId,
		kind: "document",
		status: "generated",
		title: "调研摘要",
		version: 1,
		sourceSessionId: "session-1",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
	};
	return {
		schemaVersion: 1,
		channel: "runtime",
		type: "artifact.descriptor",
		sessionId: "session-1",
		eventId: `event-${artifactId}`,
		timestamp: 1,
		source: "runtime-core",
		artifact,
	};
}

describe("useSessionEventController artifact.descriptor 接线", () => {
	const store = getDefaultStore();
	const activeSessionRef = {
		current: { runtimeId: "session-1", cwd: CHAT_CWD, sessionPath: "C:/sessions/session-1.jsonl" },
	};
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

	beforeEach(() => {
		setChatStreamOwner("session-1");
		store.set(activityPanelTabByProjectAtom, new Map());
		store.set(mountedActivityWorkspacesAtom, []);
		store.set(canvasUnreadCountAtom, 0);
		store.set(canvasArtifactRevisionAtom, 0);
		store.set(pendingCanvasArtifactIdAtom, null);
	});

	function renderController() {
		return renderHook(() => useSessionEventController({ activeSessionRef }), { wrapper });
	}

	it("Team 画布页签可见时不涨幻影未读、不排 pending，列表仍刷新", () => {
		store.set(mountedActivityWorkspacesAtom, [{ id: TEAM_WORKSPACE_ID, cwd: null }]);
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[TEAM_WORKSPACE_ID, "canvas"]]));
		const { result } = renderController();

		act(() => result.current.createSessionEventHandler("session-1")(artifactEvent("art-team")));

		expect(store.get(canvasUnreadCountAtom)).toBe(0);
		expect(store.get(pendingCanvasArtifactIdAtom)).toBeNull();
		expect(store.get(canvasArtifactRevisionAtom)).toBe(1);
	});

	it("画布不可见时排队 pending 并带归属工作空间，同时累加未读", () => {
		store.set(mountedActivityWorkspacesAtom, [{ id: CHAT_CWD, cwd: CHAT_CWD }]);
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[CHAT_CWD, "file"]]));
		const { result } = renderController();

		act(() => result.current.createSessionEventHandler("session-1")(artifactEvent("art-1")));

		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual({ workspaceId: CHAT_CWD, artifactId: "art-1" });
		expect(store.get(canvasUnreadCountAtom)).toBe(1);
	});

	it("Team 视图下旧会话产物到达时 pending 归属回退到会话 cwd，不落到 Team 工作空间", () => {
		store.set(mountedActivityWorkspacesAtom, [{ id: TEAM_WORKSPACE_ID, cwd: null }]);
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[TEAM_WORKSPACE_ID, "file"]]));
		const { result } = renderController();

		act(() => result.current.createSessionEventHandler("session-1")(artifactEvent("art-2")));

		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual({ workspaceId: CHAT_CWD, artifactId: "art-2" });
		expect(store.get(canvasUnreadCountAtom)).toBe(1);
	});
});
