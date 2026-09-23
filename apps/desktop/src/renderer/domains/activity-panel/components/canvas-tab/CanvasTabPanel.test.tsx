// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, getDefaultStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../../registry/context";
import { CANVAS_ARTIFACT_SELECTION_SCHEMA } from "../../services/canvas-selection-attachment";

vi.mock("@shared/store/atoms", async () => {
	const { atom: createAtom } = await import("jotai");
	return {
		confirmDialogAtom: createAtom(null),
		promptAttachmentAtom: createAtom(null),
		resolvedThemeAtom: createAtom("dark"),
		sessionsMapAtom: createAtom(new Map()),
		taskStateBySessionAtom: createAtom(new Map()),
		sessionDisplayLabel: (session: { name?: string; firstMessage: string }) =>
			session.name || session.firstMessage || "untitled",
	};
});

vi.mock("@shared/store/toast-atoms", async () => {
	const { atom: createAtom, getDefaultStore: defaultStore } = await import("jotai");
	const toastsAtom = createAtom<Array<{ message: string }>>([]);
	return {
		toastsAtom,
		showToast: (input: { message: string }) => {
			defaultStore().set(toastsAtom, (prev) => [...prev, { message: input.message }]);
		},
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { version?: number; title?: string; url?: string }) => {
			if (key === "activityPanel.canvas.version") return `version-${options?.version ?? 0}`;
			if (key === "activityPanel.canvas.deleteConfirm") return `delete:${options?.title ?? ""}`;
			if (key === "activityPanel.canvas.openExternalMessage") return `open:${options?.url ?? ""}`;
			return key;
		},
	}),
}));

vi.mock("../previews/MarkdownPreview", () => ({
	MarkdownPreview: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("../previews/CodePreview", () => ({
	CodePreview: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

const list = vi.fn();
const get = vi.fn();
const saveToProject = vi.fn();
const remove = vi.fn();
const selectFolder = vi.fn();
const openExternal = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			canvas: {
				list: (...args: unknown[]) => list(...args),
				get: (...args: unknown[]) => get(...args),
				saveToProject: (...args: unknown[]) => saveToProject(...args),
				delete: (...args: unknown[]) => remove(...args),
			},
			dialog: { selectFolder: (...args: unknown[]) => selectFolder(...args) },
			shell: { openExternal: (...args: unknown[]) => openExternal(...args) },
		},
	}),
);

const { confirmDialogAtom, promptAttachmentAtom } = await import("@shared/store/atoms");
const { toastsAtom } = await import("@shared/store/toast-atoms");
const { CanvasTabPanel } = await import("./CanvasTabPanel.js");

function descriptor(overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: "art-md",
		kind: "document",
		status: "generated",
		title: "调研摘要",
		version: 2,
		sourceSessionId: "session-1",
		contentType: "text/markdown",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

function view(overrides: Partial<DesktopCanvasArtifactView> = {}): DesktopCanvasArtifactView {
	return {
		descriptor: descriptor(overrides.descriptor),
		missing: false,
		externalUpdate: false,
		...overrides,
	};
}

function renderPanel(store = createStore()) {
	const workspace = createActivityWorkspace("/work/project", "/work/project");
	const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
		<Provider store={store}>
			<ActivityPanelContextProvider value={{ workspace, knowledgeHistory: false }}>
				{children}
			</ActivityPanelContextProvider>
		</Provider>
	);
	return { store, ...render(<CanvasTabPanel />, { wrapper }) };
}

describe("canvas tab panel user flow", () => {
	beforeEach(() => {
		list.mockReset().mockResolvedValue({ ok: true, items: [view()] });
		get.mockReset().mockResolvedValue({
			ok: true,
			view: view(),
			content: "请把第二节改成要点列表",
			contentType: "text/markdown",
		});
		saveToProject.mockReset();
		remove.mockReset();
		selectFolder.mockReset();
		openExternal.mockReset();
	});

	afterEach(() => cleanup());

	it("打开 Canvas 后按会话分组列出 artifact，点开渲染只读 Markdown，选区可附加到草稿", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => {
			expect(list).toHaveBeenCalledWith({ workspaceId: "/work/project" });
			expect(screen.getByText("调研摘要")).toBeTruthy();
		});
		expect(screen.getByText(/activityPanel.canvas.groupBySession/)).toBeTruthy();

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => {
			expect(get).toHaveBeenCalledWith({ workspaceId: "/work/project", artifactId: "art-md" });
			expect(screen.getByText("请把第二节改成要点列表")).toBeTruthy();
		});

		const preview = screen.getByTestId("canvas-text-preview");
		const textNode = preview.firstChild;
		vi.spyOn(window, "getSelection").mockReturnValue({
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "第二节",
			getRangeAt: () => ({ commonAncestorContainer: textNode ?? preview }),
		} as unknown as Selection);
		await userEvent.click(preview);
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.selectToAsk" }));

		const attachment = store.get(promptAttachmentAtom);
		expect(attachment).toMatchObject({
			ownerPluginId: "builtin.canvas",
			context: {
				schema: CANVAS_ARTIFACT_SELECTION_SCHEMA,
				version: 1,
				payload: {
					artifactId: "art-md",
					version: 2,
					excerpt: "第二节",
					title: "调研摘要",
				},
			},
		});
	});

	it("文件缺失时展示可恢复态而不是空白预览", async () => {
		list.mockResolvedValue({
			ok: true,
			items: [view({ descriptor: descriptor({ artifactId: "gone", title: "旧稿" }), missing: true })],
		});
		get.mockResolvedValue({ ok: false, code: "missing_file", message: "gone" });
		renderPanel();
		await waitFor(() => expect(screen.getByText("旧稿")).toBeTruthy());
		expect(screen.getByText("activityPanel.canvas.missingFile")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 旧稿" }));
		await waitFor(() => {
			expect(screen.getAllByText("activityPanel.canvas.missingFile").length).toBeGreaterThan(0);
			expect(screen.getByText("activityPanel.canvas.missingFileHint")).toBeTruthy();
		});
		expect(screen.queryByTestId("canvas-text-preview")).toBeNull();
	});

	it("保存到项目遇到同名文件时提示冲突且不覆盖", async () => {
		const store = createStore();
		selectFolder.mockResolvedValue("/work/project/docs");
		saveToProject.mockResolvedValue({ ok: false, code: "conflict", message: "exists" });
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "activityPanel.canvas.saveToProject" })).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.saveToProject" }));
		await waitFor(() => {
			expect(saveToProject).toHaveBeenCalledWith({
				workspaceId: "/work/project",
				artifactId: "art-md",
				targetPath: "/work/project/docs/调研摘要.md",
			});
			expect(
				getDefaultStore()
					.get(toastsAtom)
					.some((toast) => toast.message === "activityPanel.canvas.saveToProjectConflict"),
			).toBe(true);
		});
	});

	it("HTML 预览走隔离 webview，导航需要确认后才打开外部链接", async () => {
		const store = createStore();
		const html = view({
			descriptor: descriptor({
				artifactId: "art-html",
				title: "演示页",
				contentType: "text/html",
			}),
		});
		list.mockResolvedValue({ ok: true, items: [html] });
		get.mockResolvedValue({
			ok: true,
			view: html,
			content: "<h1>hello</h1>",
			contentType: "text/html",
		});
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("演示页")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 演示页" }));
		await waitFor(() => {
			expect(screen.getByLabelText("activityPanel.canvas.htmlSandboxLabel")).toBeTruthy();
		});
		const guest = document.querySelector("webview");
		guest?.dispatchEvent(
			Object.assign(new Event("will-navigate", { cancelable: true }), { url: "https://example.com/docs" }),
		);
		await waitFor(() => {
			expect(store.get(confirmDialogAtom)?.title).toBe("activityPanel.canvas.openExternalTitle");
		});
		store.get(confirmDialogAtom)?.onConfirm(false);
		expect(openExternal).toHaveBeenCalledWith("https://example.com/docs");
	});
});
