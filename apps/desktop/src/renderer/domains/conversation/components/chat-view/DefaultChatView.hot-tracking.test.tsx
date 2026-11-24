// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { activityPanelOpenAtom } from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultChatView } from "./DefaultChatView";

// 生产端（useSessionEventController）直接读 atom，不经这条 props 链；消费端跟随的
// 唯一事实源是 ActivityPanel 调 useFollowAiActivity(workspace, enabled) 的 enabled
// 实参——桩成间谍，正好断言「开关 → 右栏跟随停用/恢复」这一用户可观察行为。
const followAiActivity = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("motion/react", () => {
	const motion = new Proxy({}, { get: () => ({ children }: { children: ReactNode }) => <div>{children}</div> });
	return {
		AnimatePresence: ({ children }: { children: ReactNode }) => children,
		LayoutGroup: ({ children }: { children: ReactNode }) => children,
		motion,
		useReducedMotion: () => true,
	};
});
vi.mock("@domains/activity-panel/hooks/useFollowAiActivity", () => ({
	useFollowAiActivity: (_workspace: unknown, enabled: boolean) => {
		followAiActivity(_workspace, enabled);
	},
}));
vi.mock("@domains/activity-panel/components/file-tab/FileTabContent", () => ({
	FileTabContent: () => <div>file body</div>,
}));
// 内置 Git 页签的 useMeta 会拉取仓库状态（window.vetta.git）；本地桩避免未处理 rejection。
vi.mock("@shared/hooks/useGitRepoStatus", () => ({
	useGitRepoStatus: () => ({ status: null, loading: false, refresh: () => {} }),
}));
vi.mock("@domains/bottom-panel/components/BottomPanelHost", () => ({
	BottomPanelHost: () => null,
}));
vi.mock("../ChatExportHost", () => ({ ChatExportHost: () => null }));
vi.mock("@domains/workspace-mode/components/WorkWorkspacePanel", () => ({
	WorkWorkspacePanel: ({ children }: { children?: ReactNode }) => <aside>{children}</aside>,
}));
vi.mock("@domains/workspace-mode/components/WorkDocumentSections", () => ({
	WorkDocumentSections: () => null,
}));

class NoopResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", NoopResizeObserver));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	followAiActivity.mockClear();
});

describe("会话级热追踪开关传导到右栏消费端（TASK-0483）", () => {
	it("开关关闭：terminal 页签消失、AI 活动跟随停用；再点亮恢复", () => {
		const store = createStore();
		store.set(activityPanelOpenAtom, true);
		const workspace = createActivityWorkspace("/work/project", "/work/project", []);

		const view = (hotTracking: boolean): ReactNode => (
			<Provider store={store}>
				<DefaultChatView
					messages={[]}
					workspace={workspace}
					workspaceMode="coding"
					hotTracking={hotTracking}
				>
					<div />
				</DefaultChatView>
			</Provider>
		);
		const { rerender } = render(view(true));

		// 默认开：code 会话右栏带终端回放页签，跟随钩子收到 enabled=true。
		expect(screen.getByText("activityPanel.tabs.terminal")).toBeTruthy();
		expect(screen.getAllByText("activityPanel.tabs.file").length).toBeGreaterThan(0);
		expect(followAiActivity).toHaveBeenLastCalledWith(workspace, true);

		// ChatView 随 activeSessionHotTrackingAtom 变化传入 false。该变化必须穿过
		// DefaultChatView → ActivityColumn 的 memo 边界：terminal 页签从页签栏消失、
		// 跟随钩子收到 enabled=false（文件/Git 页签不受影响）。
		rerender(view(false));
		expect(screen.queryByText("activityPanel.tabs.terminal")).toBeNull();
		expect(screen.getAllByText("activityPanel.tabs.file").length).toBeGreaterThan(0);
		expect(followAiActivity).toHaveBeenLastCalledWith(workspace, false);

		// 再点亮：页签与跟随恢复。
		rerender(view(true));
		expect(screen.getByText("activityPanel.tabs.terminal")).toBeTruthy();
		expect(followAiActivity).toHaveBeenLastCalledWith(workspace, true);
	});
});
