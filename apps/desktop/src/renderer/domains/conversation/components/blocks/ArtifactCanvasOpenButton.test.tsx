// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { activeSessionAtom, pendingCanvasArtifactIdAtom } from "@shared/store/atoms";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactCanvasOpenButton, ChatActivityWorkspaceIdProvider } from "./ArtifactCanvasOpenButton";

const openActivityTab = vi.fn();
const useOpenActivityTabMock = vi.fn();

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@domains/conversation/hooks/useOpenActivityTab", () => ({
	useOpenActivityTab: (workspaceId: string | undefined) => {
		useOpenActivityTabMock(workspaceId);
		return openActivityTab;
	},
}));

function renderButton(wrapper: (props: PropsWithChildren) => JSX.Element) {
	return render(
		<ArtifactCanvasOpenButton artifact={{ artifactId: "art-9", title: "报告", action: "create", version: 1 }} />,
		{ wrapper },
	);
}

describe("ArtifactCanvasOpenButton", () => {
	it("用户点击后打开画布并选中该产物", async () => {
		const store = createStore();
		store.set(activeSessionAtom, {
			cwd: "/work/project",
			sessionPath: "/work/project/s.jsonl",
			runtimeId: "s1",
		});
		const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
		renderButton(wrapper);
		await userEvent.setup().click(screen.getByRole("button", { name: "toolCall.openInCanvas" }));
		expect(openActivityTab).toHaveBeenCalledWith("canvas");
		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual({ workspaceId: "/work/project", artifactId: "art-9" });
	});

	it("Team 会话里以宿主下发的工作空间键写 pending，不用旧会话 cwd", async () => {
		const store = createStore();
		// activeSession 是团队页之前打开的普通会话残留——旧实现拿它当键，页签写错。
		store.set(activeSessionAtom, {
			cwd: "/work/stale-chat",
			sessionPath: "/work/stale-chat/s.jsonl",
			runtimeId: "s-old",
		});
		const wrapper = ({ children }: PropsWithChildren) => (
			<Provider store={store}>
				<ChatActivityWorkspaceIdProvider workspaceId="agent-team:team-1:s1:team">{children}</ChatActivityWorkspaceIdProvider>
			</Provider>
		);
		renderButton(wrapper);
		await userEvent.setup().click(screen.getByRole("button", { name: "toolCall.openInCanvas" }));
		expect(useOpenActivityTabMock).toHaveBeenCalledWith("agent-team:team-1:s1:team");
		expect(openActivityTab).toHaveBeenCalledWith("canvas");
		expect(store.get(pendingCanvasArtifactIdAtom)).toEqual({
			workspaceId: "agent-team:team-1:s1:team",
			artifactId: "art-9",
		});
	});

	it("没有任何工作空间来源时不渲染按钮", () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
		const { container } = renderButton(wrapper);
		expect(container.querySelector("button")).toBeNull();
	});
});
