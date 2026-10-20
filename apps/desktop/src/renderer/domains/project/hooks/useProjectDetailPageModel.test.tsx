// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { projectsAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectDetailPageModel } from "./useProjectDetailPageModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: { count?: number }) => `${key}:${opts?.count ?? ""}`,
		i18n: { language: "zh" },
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	useParams: () => ({ cwd: encodeURIComponent("E:\\demo") }),
	useNavigate: () => vi.fn(),
}));

const listSessions = vi.fn();
vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			session: { listSessions, onSessionsChanged: vi.fn() },
			fs: {
				readFile: vi.fn().mockRejectedValue(new Error("no file")),
				stat: vi.fn().mockResolvedValue(null),
			},
			project: { export: vi.fn() },
			shell: { showInFolder: vi.fn() },
			im: { onSessionChanged: vi.fn() },
			config: { get: vi.fn(), onProjectsChanged: vi.fn() },
		},
	}),
);

describe("useProjectDetailPageModel", () => {
	// BUG-0033：直达/重载落在项目页时侧边栏组未展开，sessionsMap 为空，
	// 页面曾因此误显「0 个会话」。挂载时应主动扫描本 cwd。
	it("loads the project's sessions on mount so the count is correct without expanding the sidebar group", async () => {
		listSessions.mockResolvedValue([
			{ id: "s1", path: "C:/sessions/s1.jsonl", cwd: "E:\\demo", firstMessage: "hi", modifiedAt: 1 },
			{ id: "s2", path: "C:/sessions/s2.jsonl", cwd: "E:\\demo", firstMessage: "yo", modifiedAt: 2 },
		]);
		const store = createStore();
		store.set(projectsAtom, [{ cwd: "E:\\demo", name: "demo", sessionCount: 0, type: "normal" }]);
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;

		const { result } = renderHook(() => useProjectDetailPageModel(vi.fn()), { wrapper });

		await waitFor(() => expect(listSessions).toHaveBeenCalledWith("E:\\demo"));
		await waitFor(() => expect(result.current.sessionCountLabel).toBe("detail.sessionCount:2"));
	});
});
