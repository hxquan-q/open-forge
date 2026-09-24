// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewSessionWorkspaceHint } from "./NewSessionWorkspaceHint";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

afterEach(cleanup);

describe("NewSessionWorkspaceHint", () => {
	it("文档与研究档只读确认即将按该档开，不是第二套开关", () => {
		render(<NewSessionWorkspaceHint mode="work" />);
		const hint = screen.getByTestId("new-session-workspace-hint");
		expect(hint.textContent).toBe("newSession.workspace.hint.work");
		expect(hint.querySelector(".icon-\\[solar--document-text-linear\\]")).not.toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("代码档确认即将按代码开", () => {
		render(<NewSessionWorkspaceHint mode="coding" />);
		expect(screen.getByTestId("new-session-workspace-hint").textContent).toBe(
			"newSession.workspace.hint.coding",
		);
	});
});
