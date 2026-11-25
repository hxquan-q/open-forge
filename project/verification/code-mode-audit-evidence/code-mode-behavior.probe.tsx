// Copyright The Open Forge contributors.
// Audit-only expectations. Failing tests are evidence, NOT part of the production regression gate.
// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activeSessionAtom, activityPanelOpenAtom, activityPanelWidthAtom, activityPanelTabByProjectAtom,
	aiEditTargetAtom, aiTerminalFeedAtom, inlineFilePreviewAtom, setActivityPanelWidthAtom,
	sidebarCollapsedAtom, workspaceModeByProjectAtom, defaultConversationCwdAtom,
	projectsAtom, projectsInitializedAtom, sessionsMapAtom, hiddenActivityTabsAtom, activityTabOrderAtom, type ActiveSession, type SessionInfo,
} from "@shared/store/atoms";
import { useCodingSessionLayout } from "@/renderer/root-layout/useCodingSessionLayout";
import { useFollowAiFileEdits } from "@domains/activity-panel/hooks/useFollowAiFileEdits";
import { useFollowAiActivity } from "@domains/activity-panel/hooks/useFollowAiActivity";
import { AiTerminalReplayPanel } from "@domains/activity-panel/components/terminal-tab/AiTerminalReplayPanel";
import { ActivityPanelContextProvider } from "@domains/activity-panel/registry/context";
import { useSessionEventController } from "@domains/conversation/hooks/useSessionEventController";
import { setChatStreamOwner } from "@domains/conversation/services/chat-service";
import type { SessionEvent } from "@vetta/runtime-core";
import { useAllstarDevHomePageModel } from "@domains/allstar-dev/hooks/useAllstarDevHomePageModel";
import { SessionOpenProvider } from "@shared/app-shell/session-open-context";
import { projectSidebarConversations } from "@domains/project/services/sidebar-conversation-projection";
import { resolveActivityTabs } from "@domains/activity-panel/registry/resolve-activity-tabs";
import { effectiveHiddenActivityTabKeys, defaultHiddenBuiltinTabIds } from "@domains/activity-panel/services/activity-tab-visibility";
import { fileTabDefinition } from "@domains/activity-panel/builtins/file-tab";
import { gitTabDefinition } from "@domains/activity-panel/builtins/git-tab";
import { terminalTabDefinition } from "@domains/activity-panel/builtins/terminal-tab";
import { browserTabDefinition } from "@domains/activity-panel/builtins/browser-tab";

const route = vi.hoisted(() => ({ pathname: "/", search: {} as { cwd?: string } }));
const navigate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, useMatches: () => [{ pathname: route.pathname }], useSearch: () => route.search }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const store = getDefaultStore();
const session = (id: string, cwd = "/project-a"): ActiveSession => ({ runtimeId: id, cwd, sessionPath: `${cwd}/${id}.jsonl`, capabilityProfile: "coding" });
const state = () => ({ collapsed: store.get(sidebarCollapsedAtom), rightOpen: store.get(activityPanelOpenAtom), width: store.get(activityPanelWidthAtom) });
function manualLayout() { store.set(sidebarCollapsedAtom, false); store.set(activityPanelOpenAtom, false); store.set(setActivityPanelWidthAtom, 540); }
function trace(name: string, value: unknown) { console.log("AUDIT " + JSON.stringify({ name, value })); }

beforeEach(() => {
	route.pathname = "/"; route.search = {};
	store.set(activeSessionAtom, null); store.set(sidebarCollapsedAtom, false); store.set(activityPanelOpenAtom, false);
	store.set(setActivityPanelWidthAtom, 360); store.set(workspaceModeByProjectAtom, new Map([["/project-a", "coding"], ["/project-b", "coding"]]));
	store.set(aiEditTargetAtom, null); store.set(aiTerminalFeedAtom, []); store.set(inlineFilePreviewAtom, null);
	store.set(activityPanelTabByProjectAtom, new Map());
	store.set(hiddenActivityTabsAtom, new Map()); store.set(activityTabOrderAtom, new Map());
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});
afterEach(() => { cleanup(); setChatStreamOwner(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("initialization audit", () => {
	it("CONTROL: first code context initializes hidden/open/half width", () => {
		route.pathname = "/new-session"; route.search = { cwd: encodeURIComponent("/project-a") };
		renderHook(() => useCodingSessionLayout());
		expect(state()).toEqual({ collapsed: true, rightOpen: true, width: 628 });
	});

	it("F10: a fresh code session does not reset hidden/order preferences of the same project", () => {
		store.set(hiddenActivityTabsAtom, new Map([["/project-a", ["terminal"]]]));
		store.set(activityTabOrderAtom, new Map([["/project-a", ["browser", "file", "git", "terminal"]]]));
		route.pathname = "/new-session"; route.search = { cwd: encodeURIComponent("/project-a") };
		renderHook(() => useCodingSessionLayout());
		const definitions = [fileTabDefinition, gitTabDefinition, terminalTabDefinition, browserTabDefinition];
		const tabs = resolveActivityTabs({ definitions, metaById: new Map(definitions.map((def) => [def.id, { label: def.id }])), tabVisibilityRecords: [], hiddenKeys: effectiveHiddenActivityTabKeys(store.get(hiddenActivityTabsAtom).get("/project-a"), defaultHiddenBuiltinTabIds(definitions)), tabOrder: store.get(activityTabOrderAtom).get("/project-a") ?? [] });
		trace("new-code-existing-tab-preferences", tabs.onBar.map((tab) => tab.id));
		expect(tabs.onBar.map((tab) => tab.id)).toEqual(["file", "git", "terminal", "browser"]);
	});

	it("F01: consecutive new code sessions each need their own initialization", () => {
		store.set(activeSessionAtom, session("a"));
		const { rerender } = renderHook(() => useCodingSessionLayout());
		act(manualLayout);
		act(() => { route.pathname = "/new-session"; route.search = { cwd: encodeURIComponent("/project-a") }; store.set(activeSessionAtom, null); });
		rerender(); trace("consecutive-new-code", state());
		expect(state()).toEqual({ collapsed: true, rightOpen: true, width: 628 });
	});

	it("F02: first-message transition must not overwrite manual choices a second time", () => {
		route.pathname = "/new-session"; route.search = { cwd: encodeURIComponent("/project-a") };
		const { rerender } = renderHook(() => useCodingSessionLayout());
		act(manualLayout);
		act(() => { route.pathname = "/"; route.search = {}; }); rerender();
		act(() => store.set(activeSessionAtom, session("new"))); rerender();
		trace("first-message-transition", state());
		expect(state()).toEqual({ collapsed: false, rightOpen: false, width: 540 });
	});

	it("F02b: opening an existing code session is not new-session initialization", () => {
		store.set(activeSessionAtom, { ...session("work"), capabilityProfile: "work" });
		const { rerender } = renderHook(() => useCodingSessionLayout());
		act(manualLayout); act(() => store.set(activeSessionAtom, session("existing"))); rerender();
		trace("existing-code-open", state());
		expect(state()).toEqual({ collapsed: false, rightOpen: false, width: 540 });
	});
});

describe("file/terminal isolation audit", () => {
	it("F03: a newly mounted file panel must not follow another project's stale target", () => {
		store.set(aiEditTargetAtom, { path: "/project-a/private.ts", at: 1 });
		const wrapper = ({ children }: { children: React.ReactNode }) => <ActivityPanelContextProvider value={{ workspace: { id: "/project-b", cwd: "/project-b", runtimeIds: [] }, knowledgeHistory: false }}>{children}</ActivityPanelContextProvider>;
		renderHook(() => useFollowAiFileEdits(), { wrapper });
		trace("cross-project-file", store.get(inlineFilePreviewAtom));
		expect(store.get(inlineFilePreviewAtom)).toBeNull();
	});

	it("F04: another edit of the same file must restore AI target after manual file browsing", () => {
		renderHook(() => useFollowAiFileEdits());
		act(() => store.set(aiEditTargetAtom, { path: "/project-a/ai.ts", at: 1 }));
		act(() => store.set(inlineFilePreviewAtom, { name: "manual.ts", path: "/project-a/manual.ts" }));
		act(() => store.set(aiEditTargetAtom, { path: "/project-a/ai.ts", at: 2 }));
		trace("repeat-file-after-manual", store.get(inlineFilePreviewAtom));
		expect(store.get(inlineFilePreviewAtom)?.path).toBe("/project-a/ai.ts");
	});

	it("F05: terminal content is not isolated by the panel's project", () => {
		store.set(aiTerminalFeedAtom, [{ key: "a", command: "echo from-project-a", running: false, at: 1, cwd: "/project-a", output: "A output" }]);
		render(<ActivityPanelContextProvider value={{ workspace: { id: "/project-b", cwd: "/project-b", runtimeIds: [] }, knowledgeHistory: false }}><AiTerminalReplayPanel /></ActivityPanelContextProvider>);
		trace("cross-project-terminal", screen.queryByText("echo from-project-a")?.textContent);
		expect(screen.queryByText("echo from-project-a")).toBeNull();
	});

	it("F06: a command completed after switching away must not remain running forever", () => {
		const activeSessionRef = { current: session("a") };
		store.set(activeSessionAtom, activeSessionRef.current); setChatStreamOwner("a");
		const { result } = renderHook(() => useSessionEventController({ activeSessionRef }));
		const handler = result.current.createSessionEventHandler("a");
		const event = (payload: Record<string, unknown>): SessionEvent => ({ schemaVersion: 1, channel: "runtime", sessionId: "a", eventId: "audit", source: "agent", timestamp: 1, ...payload } as unknown as SessionEvent);
		act(() => handler(event({ type: "tool.start", toolCallId: "c1", toolName: "bash", args: { command: "echo done" }, startedAt: 1 })));
		act(() => { activeSessionRef.current = session("b", "/project-b"); store.set(activeSessionAtom, activeSessionRef.current); setChatStreamOwner("b"); });
		act(() => handler(event({ type: "tool.end", toolCallId: "c1", toolName: "bash", result: { content: [{ type: "text", text: "done" }] }, isError: false, startedAt: 1, durationMs: 2, phases: [] })));
		trace("completion-after-switch", store.get(aiTerminalFeedAtom));
		expect(store.get(aiTerminalFeedAtom)[0]?.running).toBe(false);
	});

	it("F07: live tool.update output should be visible before the command ends", () => {
		const activeSessionRef = { current: session("a") }; setChatStreamOwner("a");
		const { result } = renderHook(() => useSessionEventController({ activeSessionRef }));
		const handler = result.current.createSessionEventHandler("a");
		const event = (payload: Record<string, unknown>): SessionEvent => ({ schemaVersion: 1, channel: "runtime", sessionId: "a", eventId: "audit", source: "agent", timestamp: 1, ...payload } as unknown as SessionEvent);
		act(() => handler(event({ type: "tool.start", toolCallId: "c1", toolName: "bash", args: { command: "long command" }, startedAt: 1 })));
		act(() => handler(event({ type: "tool.update", toolCallId: "c1", toolName: "bash", partialResult: { content: [{ type: "text", text: "live line" }] } })));
		trace("live-command-output", store.get(aiTerminalFeedAtom));
		expect(store.get(aiTerminalFeedAtom)[0]?.output ?? "").toContain("live line");
	});

	it("CONTROL: closed right panel stays closed while activity selection changes", () => {
		store.set(activityPanelOpenAtom, false);
		renderHook(() => useFollowAiActivity({ id: "/project-a", cwd: "/project-a", runtimeIds: ["a"] }));
		act(() => store.set(aiTerminalFeedAtom, [{ key: "a", command: "echo x", running: true, at: 1, cwd: "/project-a" }]));
		expect(store.get(activityPanelTabByProjectAtom).get("/project-a")).toBe("terminal");
		expect(store.get(activityPanelOpenAtom)).toBe(false);
	});
});

describe("independent project catalogue audit", () => {
	it("F08/F09: code-only projects load their history; live coding rows stay out of ordinary lists", async () => {
		let onChanged: ((event: { cwd: string; sessionPath: string; session: SessionInfo }) => void) | undefined;
		const listSessions = vi.fn(async (cwd: string) => cwd === "/code-only" ? [{ id: "old-code", path: "/code-only/old.jsonl", cwd, firstMessage: "Existing code history", modifiedAt: 1, agentMode: "coding" as const }] : []);
		vi.stubGlobal("vetta", {
			...window.vetta,
			config: { ...window.vetta.config, onProjectsChanged: () => () => {} },
			im: { onSessionChanged: () => () => {} },
			session: { listSessions, onSessionsChanged: (listener: typeof onChanged) => { onChanged = listener; return () => {}; } },
			project: { list: async () => ({ workspacePath: "/workspace", projects: [{ path: "/ordinary" }], archivedProjects: [], allstarProjects: [{ id: "code-only", path: "/code-only", name: "Code only" }], allstarArchivedProjects: [] }) },
		});
		store.set(projectsAtom, [{ cwd: "/ordinary", type: "normal", sessionCount: 0 }]);
		store.set(defaultConversationCwdAtom, "/ordinary");
		store.set(projectsInitializedAtom, true);
		store.set(sessionsMapAtom, new Map([["/ordinary", []]]));
		const wrapper = ({ children }: { children: React.ReactNode }) => <SessionOpenProvider onOpenSession={async () => {}}>{children}</SessionOpenProvider>;
		const { result } = renderHook(() => useAllstarDevHomePageModel(), { wrapper });
		await waitFor(() => expect(result.current.projectCards.some((card) => card.cwd === "/code-only")).toBe(true));
		trace("code-only-history-requests", listSessions.mock.calls);
		trace("code-only-history-card", result.current.projectCards.find((card) => card.cwd === "/code-only"));
		trace("code-only-create-options", result.current.projects.map((option) => option.cwd));
		expect.soft(listSessions).toHaveBeenCalledWith("/code-only");
		expect.soft(result.current.projects.some((option) => option.cwd === "/code-only")).toBe(true);

		vi.useFakeTimers(); // 观察事件增量投影，尚不推进随后全量刷新。
		act(() => onChanged?.({ cwd: "/ordinary", sessionPath: "/ordinary/live-code.jsonl", session: { id: "live-code", path: "/ordinary/live-code.jsonl", cwd: "/ordinary", firstMessage: "coding task", modifiedAt: 1, agentMode: "coding" } }));
		const ordinaryVisible = projectSidebarConversations(store.get(sessionsMapAtom).get("/ordinary") ?? [], [], { kind: "project", projectPath: "/ordinary" });
		trace("live-coding-in-ordinary-sidebar", ordinaryVisible.map((item) => ({ path: item.path, kind: item.kind })));
		expect.soft(ordinaryVisible).toHaveLength(0);
	});
});
