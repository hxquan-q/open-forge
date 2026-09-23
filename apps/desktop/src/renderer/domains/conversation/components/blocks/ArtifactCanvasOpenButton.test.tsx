// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { activeSessionAtom, pendingCanvasArtifactIdAtom } from "@shared/store/atoms";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactCanvasOpenButton } from "./ArtifactCanvasOpenButton";

const openActivityTab = vi.fn();

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@domains/conversation/hooks/useOpenActivityTab", () => ({
	useOpenActivityTab: () => openActivityTab,
}));

describe("ArtifactCanvasOpenButton", () => {
	it("用户点击后打开画布并选中该产物", async () => {
		const store = createStore();
		store.set(activeSessionAtom, {
			cwd: "/work/project",
			sessionPath: "/work/project/s.jsonl",
			runtimeId: "s1",
		});
		const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
		render(
			<ArtifactCanvasOpenButton artifact={{ artifactId: "art-9", title: "报告", action: "create", version: 1 }} />,
			{ wrapper },
		);
		await userEvent.setup().click(screen.getByRole("button", { name: "toolCall.openInCanvas" }));
		expect(openActivityTab).toHaveBeenCalledWith("canvas");
		expect(store.get(pendingCanvasArtifactIdAtom)).toBe("art-9");
	});
});
