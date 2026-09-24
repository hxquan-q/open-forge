// @vitest-environment jsdom

import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import {
	activityPanelTabByProjectAtom,
	canvasUnreadCountAtom,
	pendingCanvasArtifactIdAtom,
} from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { useCanvasTabModel } from "./useCanvasTabModel";

const list = vi.fn();
const get = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			canvas: {
				list: (...args: unknown[]) => list(...args),
				get: (...args: unknown[]) => get(...args),
				saveToProject: vi.fn(),
				delete: vi.fn(),
			},
			dialog: { selectFolder: vi.fn() },
			shell: { openExternal: vi.fn() },
		},
	}),
);

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const WORKSPACE_ID = "agent-team:team-1:team";

function descriptor(artifactId: string): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId,
		kind: "document",
		status: "generated",
		title: "调研摘要",
		version: 2,
		sourceSessionId: "session-1",
		contentType: "text/markdown",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
	};
}

function view(artifactId: string): DesktopCanvasArtifactView {
	return { descriptor: descriptor(artifactId), missing: false, externalUpdate: false };
}

function renderModel(store: ReturnType<typeof createStore>) {
	const workspace = createActivityWorkspace(WORKSPACE_ID, null);
	const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
		<Provider store={store}>
			<ActivityPanelContextProvider value={{ workspace, knowledgeHistory: false }}>
				{children}
			</ActivityPanelContextProvider>
		</Provider>
	);
	return renderHook(() => useCanvasTabModel(), { wrapper });
}

describe("useCanvasTabModel pending 归属与可见性", () => {
	beforeEach(() => {
		list.mockReset().mockResolvedValue({ ok: true, items: [] });
		get.mockReset();
	});

	afterEach(() => cleanup());

	it("归属匹配且画布可见时消费 pending，按本工作空间拉取并清槽", async () => {
		const store = createStore();
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "canvas"]]));
		store.set(pendingCanvasArtifactIdAtom, { workspaceId: WORKSPACE_ID, artifactId: "art-1" });
		get.mockResolvedValue({ ok: true, view: view("art-1"), content: "正文", contentType: "text/markdown" });
		const { result } = renderModel(store);

		await waitFor(() => expect(result.current.selected?.artifactId).toBe("art-1"));

		expect(get).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, artifactId: "art-1" });
		expect(store.get(pendingCanvasArtifactIdAtom)).toBeNull();
	});

	it("归属不匹配时不消费也不清槽，不产生错配 workspace 的拉取", async () => {
		const store = createStore();
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "canvas"]]));
		const pending = { workspaceId: "/other/project", artifactId: "art-2" };
		store.set(pendingCanvasArtifactIdAtom, pending);
		const { result } = renderModel(store);

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.selected).toBeNull();
		expect(get).not.toHaveBeenCalled();
		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual(pending);
	});

	it("画布页签未激活时不抢选区，切回画布后才消费排队项", async () => {
		const store = createStore();
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "file"]]));
		store.set(pendingCanvasArtifactIdAtom, { workspaceId: WORKSPACE_ID, artifactId: "art-3" });
		get.mockResolvedValue({ ok: true, view: view("art-3"), content: "正文", contentType: "text/markdown" });
		const { result } = renderModel(store);

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.selected).toBeNull();
		expect(get).not.toHaveBeenCalled();
		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual({ workspaceId: WORKSPACE_ID, artifactId: "art-3" });

		act(() => {
			store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "canvas"]]));
		});

		await waitFor(() => expect(result.current.selected?.artifactId).toBe("art-3"));
		expect(store.get(pendingCanvasArtifactIdAtom)).toBeNull();
	});

	it("未读复位依赖计数变化：可见期间到达的增量立即归零，不可见时保留", async () => {
		const store = createStore();
		store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "canvas"]]));
		store.set(canvasUnreadCountAtom, 4);
		const { rerender } = renderModel(store);

		await waitFor(() => expect(store.get(canvasUnreadCountAtom)).toBe(0));

		act(() => {
			store.set(activityPanelTabByProjectAtom, new Map<string, ActivityTabKey>([[WORKSPACE_ID, "file"]]));
			store.set(canvasUnreadCountAtom, 2);
		});
		rerender();

		expect(store.get(canvasUnreadCountAtom)).toBe(2);
	});
});
