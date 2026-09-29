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
import type { ChatTimelineItem } from "@shared/store/atoms";
import { ActivityPanelContextProvider } from "../../registry/context";
import { CANVAS_ARTIFACT_SELECTION_SCHEMA } from "../../services/canvas-selection-attachment";

// 「在浏览器打开」把地址交给共享的工作空间打开入口；这里记录它收到的载荷。
const openedInWorkspace = vi.hoisted(() => vi.fn());

vi.mock("@shared/store/atoms", async () => {
	const { atom: createAtom } = await import("jotai");
	return {
		activityPanelTabByProjectAtom: createAtom(new Map()),
		canvasArtifactRevisionAtom: createAtom(0),
		canvasUnreadCountAtom: createAtom(0),
		chatMessagesAtom: createAtom([]),
		confirmDialogAtom: createAtom(null),
		focusInputRequestAtom: createAtom(0),
		inputValueAtom: createAtom(""),
		isCanvasTabVisible: () => true,
		openUrlInActivityWorkspaceAtom: createAtom(
			null,
			(_get, _set, input: { workspaceId: string; url: string }) => openedInWorkspace(input),
		),
		pendingCanvasArtifactIdAtom: createAtom(null),
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
		t: (
			key: string,
			options?: {
				version?: number;
				title?: string;
				url?: string;
				index?: number;
				from?: number;
				to?: number;
				page?: number;
				pageCount?: number;
				rows?: number;
				count?: number;
			},
		) => {
			if (key === "activityPanel.canvas.version") return `version-${options?.version ?? 0}`;
			if (key === "activityPanel.canvas.deleteConfirm") return `delete:${options?.title ?? ""}`;
			if (key === "activityPanel.canvas.openExternalMessage") return `open:${options?.url ?? ""}`;
			// 数据表的行列范围摘要必须真实插值，才能断言附件里拿到的是哪一段范围。
			if (key === "activityPanel.canvas.dataGrid.rangeRow") return `row-${options?.index ?? 0}`;
			if (key === "activityPanel.canvas.dataGrid.rangeRows") return `rows-${options?.from ?? 0}-${options?.to ?? 0}`;
			if (key === "activityPanel.canvas.dataGrid.rangeColumn") return `column-${options?.index ?? 0}`;
			if (key === "activityPanel.canvas.dataGrid.rangeColumns") {
				return `columns-${options?.from ?? 0}-${options?.to ?? 0}`;
			}
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
const update = vi.fn();
const saveToProject = vi.fn();
const remove = vi.fn();
const selectFolder = vi.fn();
const openExternal = vi.fn();
const openPreviewInBrowser = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			canvas: {
				list: (...args: unknown[]) => list(...args),
				get: (...args: unknown[]) => get(...args),
				update: (...args: unknown[]) => update(...args),
				openInBrowser: (...args: unknown[]) => openPreviewInBrowser(...args),
				saveToProject: (...args: unknown[]) => saveToProject(...args),
				delete: (...args: unknown[]) => remove(...args),
			},
			dialog: { selectFolder: (...args: unknown[]) => selectFolder(...args) },
			shell: { openExternal: (...args: unknown[]) => openExternal(...args) },
		},
	}),
);

const { chatMessagesAtom, confirmDialogAtom, inputValueAtom, promptAttachmentAtom, resolvedThemeAtom } = await import(
	"@shared/store/atoms"
);
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
		update.mockReset();
		selectFolder.mockReset();
		openExternal.mockReset();
		openPreviewInBrowser.mockReset();
		openedInWorkspace.mockReset();
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
		// HTML 走隔离沙箱，不提供就地编辑开关。
		expect(screen.queryByRole("button", { name: /activityPanel.canvas.enterEdit/ })).toBeNull();
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

	it("CSV artifact 打开为原生数据表，排序、过滤与划选追问串联可用", async () => {
		const store = createStore();
		const csv = view({
			descriptor: descriptor({
				artifactId: "art-csv",
				title: "销售明细",
				kind: "dataset",
				contentType: "text/csv",
			}),
		});
		list.mockResolvedValue({ ok: true, items: [csv] });
		get.mockResolvedValue({
			ok: true,
			view: csv,
			content: "name,qty\n苹果,20\nBanana,10\n樱桃,30\n",
			contentType: "text/csv",
		});
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("销售明细")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 销售明细" }));
		await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
		// data-grid 不再回落到文本预览容器。
		expect(screen.queryByTestId("canvas-text-preview")).toBeNull();

		const firstDataRow = (): string => screen.getAllByRole("row")[1]?.textContent ?? "";
		expect(firstDataRow()).toContain("苹果");
		const qtyHeader = screen.getByRole("button", { name: "qty" });
		await userEvent.click(qtyHeader);
		expect(firstDataRow()).toContain("Banana");
		await userEvent.click(qtyHeader);
		expect(firstDataRow()).toContain("樱桃");
		await userEvent.click(qtyHeader);
		expect(firstDataRow()).toContain("苹果");

		await userEvent.type(
			screen.getByRole("searchbox", { name: "activityPanel.canvas.dataGrid.filterPlaceholder" }),
			"Banana",
		);
		expect(screen.getAllByRole("row")).toHaveLength(2);

		const nameCell = screen.getByText("Banana").closest("td");
		const qtyCell = screen.getByText("10").closest("td");
		if (!nameCell || !qtyCell) throw new Error("单元格未渲染");
		vi.spyOn(window, "getSelection").mockReturnValue({
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "Banana 10",
			getRangeAt: () => ({
				commonAncestorContainer: nameCell,
				startContainer: nameCell,
				endContainer: qtyCell,
			}),
		} as unknown as Selection);
		await userEvent.click(qtyCell);
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.selectToAsk" }));

		expect(store.get(promptAttachmentAtom)).toMatchObject({
			ownerPluginId: "builtin.canvas",
			context: {
				schema: CANVAS_ARTIFACT_SELECTION_SCHEMA,
				version: 1,
				payload: {
					artifactId: "art-csv",
					version: 2,
					excerpt: "Banana 10",
					title: "销售明细",
					kind: "data-grid",
					contentType: "text/csv",
					// name 是第 1 列、qty 是第 2 列；过滤后 Banana 是当前结果的第 1 行。
					range: "row-1 · columns-1-2",
				},
			},
		});
	});

	it("Markdown artifact 可进入编辑并保存为新版本，成功后回到预览", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: /activityPanel.canvas.enterEdit/ }));
		const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
			name: "activityPanel.canvas.editorLabel",
		});
		expect(editor.value).toBe("请把第二节改成要点列表");

		await userEvent.clear(editor);
		await userEvent.type(editor, "改好的正文");
		update.mockResolvedValue({ ok: true, descriptor: descriptor({ version: 3 }) });
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.save" }));

		await waitFor(() => {
			expect(update).toHaveBeenCalledWith({
				workspaceId: "/work/project",
				artifactId: "art-md",
				baseVersion: 2,
				content: "改好的正文",
				title: "调研摘要",
			});
		});
		// 保存成功后退出编辑态并回到只读预览。
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());
		expect(screen.queryByRole("textbox", { name: "activityPanel.canvas.editorLabel" })).toBeNull();
	});

	it("保存遇到 stale_version 时提示冲突、保留草稿并可从冲突态载入最新版本", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /activityPanel.canvas.enterEdit/ }));
		const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
			name: "activityPanel.canvas.editorLabel",
		});
		await userEvent.clear(editor);
		await userEvent.type(editor, "我的草稿");
		update.mockResolvedValue({ ok: false, code: "stale_version", message: "stale" });

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.save" }));
		await waitFor(() => expect(screen.getByText("activityPanel.canvas.staleVersion")).toBeTruthy());
		expect(screen.getByText("activityPanel.canvas.staleVersionHint")).toBeTruthy();
		// 草稿没有被静默丢弃。
		expect(
			screen.getByRole<HTMLTextAreaElement>("textbox", { name: "activityPanel.canvas.editorLabel" }).value,
		).toBe("我的草稿");

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.reload" }));
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());
	});

	it("划选后点击快捷宏把结构化指令与选区胶囊一起送进输入框", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());

		const preview = screen.getByTestId("canvas-text-preview");
		const textNode = preview.firstChild;
		vi.spyOn(window, "getSelection").mockReturnValue({
			isCollapsed: false,
			rangeCount: 1,
			toString: () => "第二节",
			getRangeAt: () => ({ commonAncestorContainer: textNode ?? preview }),
		} as unknown as Selection);
		await userEvent.click(preview);

		// Markdown 只给文档类宏。
		expect(screen.queryByRole("button", { name: /activityPanel.canvas.macros.addLogs/ })).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: /activityPanel.canvas.macros.makeShorter/ }));

		expect(store.get(inputValueAtom)).toBe("activityPanel.canvas.macros.makeShorterPrompt");
		expect(store.get(promptAttachmentAtom)).toMatchObject({
			ownerPluginId: "builtin.canvas",
			context: {
				schema: CANVAS_ARTIFACT_SELECTION_SCHEMA,
				payload: { artifactId: "art-md", version: 2, excerpt: "第二节" },
			},
		});
	});

	it("chart artifact 渲染原生图表，主题切换不重建结构", async () => {
		const store = createStore();
		const chart = view({
			descriptor: descriptor({
				artifactId: "art-chart",
				title: "收入趋势",
				kind: "analysis",
				contentType: "application/vnd.vetta.chart+json",
			}),
		});
		list.mockResolvedValue({ ok: true, items: [chart] });
		get.mockResolvedValue({
			ok: true,
			view: chart,
			content: JSON.stringify({ type: "line", labels: ["1月", "2月"], series: [{ name: "收入", values: [1, 2] }] }),
			contentType: "application/vnd.vetta.chart+json",
		});
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("收入趋势")).toBeTruthy());
		expect(screen.getByText("activityPanel.canvas.kindChart")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 收入趋势" }));
		await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());

		// 取色是 CSS 变量引用：切主题只换变量值，图表结构不变。
		expect(screen.getByRole("img").querySelector("polyline")?.getAttribute("stroke")).toBe("var(--chart-1)");
		store.set(resolvedThemeAtom, "light");
		expect(store.get(resolvedThemeAtom)).toBe("light");
		expect(screen.getByRole("img").querySelector("polyline")?.getAttribute("stroke")).toBe("var(--chart-1)");
	});

	it("声明式组件结构非法时降级为代码视图并给出提示", async () => {
		const store = createStore();
		const broken = view({
			descriptor: descriptor({
				artifactId: "art-broken",
				title: "坏图表",
				kind: "analysis",
				contentType: "application/vnd.vetta.chart+json",
			}),
		});
		list.mockResolvedValue({ ok: true, items: [broken] });
		get.mockResolvedValue({
			ok: true,
			view: broken,
			content: "{not json",
			contentType: "application/vnd.vetta.chart+json",
		});
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("坏图表")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 坏图表" }));

		await waitFor(() => expect(screen.getByText("activityPanel.canvas.invalidStructured")).toBeTruthy());
		expect(screen.queryByRole("img")).toBeNull();
		// 降级到代码视图，原文可读而不是白屏。
		expect(screen.getByTestId("canvas-text-preview").textContent).toContain("{not json");
	});

	it("会话内文件变更在「任务变更」分段按文件汇总并可查看差异", async () => {
		const store = createStore();
		// 只关心块数组：变更聚合是只读投影，不依赖消息 ViewModel 的其余字段。
		const changeMessage = {
			blocks: [
				{
					type: "tool_call",
					toolCallId: "call-a",
					toolName: "edit_file",
					status: "success",
					args: { file_path: "src/a.ts" },
					uiDetails: {
						diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-old-a\n+new-a\n+extra-a\n",
					},
				},
				{
					type: "tool_call",
					toolCallId: "call-b",
					toolName: "write_to_file",
					status: "success",
					args: { path: "src/b.ts" },
					uiDetails: { diff: "--- /dev/null\n+++ b/src/b.ts\n@@\n+fresh-b\n" },
				},
			],
		} as unknown as ChatTimelineItem;
		store.set(chatMessagesAtom, [changeMessage]);
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /activityPanel\.canvas\.sectionChanges/ }));

		expect(screen.getByText("src/a.ts")).toBeTruthy();
		expect(screen.getByText("src/b.ts")).toBeTruthy();
		expect(screen.getByText("activityPanel.canvas.statusAdded")).toBeTruthy();
		expect(screen.getByText("activityPanel.canvas.changePickHint")).toBeTruthy();
		// 变更分区是只读汇总：产物级批量操作只出现在「产物列表」分区。
		expect(screen.queryByRole("button", { name: "activityPanel.canvas.discardAll" })).toBeNull();
		expect(screen.queryByRole("button", { name: "activityPanel.canvas.saveAllToProject" })).toBeNull();

		const fileRow = screen.getByRole("button", { name: /src\/a\.ts/ });
		await userEvent.click(fileRow);
		expect(screen.getByText("new-a")).toBeTruthy();
		// 选中行必须有可见态，否则用户无法把下方 diff 对应回文件。
		expect(fileRow.getAttribute("aria-pressed")).toBe("true");
		expect(fileRow.className).toContain("bg-primary/10");
	});

	it("没有文件变更时「任务变更」显示空态而不是报错", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /activityPanel\.canvas\.sectionChanges/ }));
		expect(screen.getByText("activityPanel.canvas.changesEmpty")).toBeTruthy();
		expect(screen.getByText("activityPanel.canvas.changesEmptyHint")).toBeTruthy();
	});

	it("放弃全部产物需确认，确认后清空画布列表", async () => {
		const store = createStore();
		remove.mockResolvedValue({ ok: true });
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.discardAll" }));
		// 只有确认框被打开，还没有任何删除。
		expect(remove).not.toHaveBeenCalled();
		expect(store.get(confirmDialogAtom)?.title).toBe("activityPanel.canvas.discardAll");

		store.get(confirmDialogAtom)?.onConfirm(false);
		await waitFor(() =>
			expect(remove).toHaveBeenCalledWith({ workspaceId: "/work/project", artifactId: "art-md" }),
		);
		await waitFor(() => expect(screen.getByText("activityPanel.canvas.empty")).toBeTruthy());
	});

	it("全部保存到项目只选一次目录并汇总冲突", async () => {
		const store = createStore();
		selectFolder.mockResolvedValue("/work/project/docs");
		list.mockResolvedValue({
			ok: true,
			items: [view(), view({ descriptor: descriptor({ artifactId: "art-2", title: "第二份" }) })],
		});
		saveToProject
			.mockResolvedValueOnce({ ok: true, descriptor: descriptor({ version: 3 }) })
			.mockResolvedValueOnce({ ok: false, code: "conflict", message: "exists" });
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.saveAllToProject" }));
		await waitFor(() => expect(selectFolder).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(saveToProject).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(
				getDefaultStore()
					.get(toastsAtom)
					.some((toast) => toast.message === "activityPanel.canvas.batchSaveSummary"),
			).toBe(true),
		);
	});

	it("HTML 产物「在浏览器打开」后切到 Browser Tab 并载入回环地址", async () => {
		const store = createStore();
		const html = view({
			descriptor: descriptor({ artifactId: "art-html", title: "演示页", contentType: "text/html" }),
		});
		list.mockResolvedValue({ ok: true, items: [html] });
		get.mockResolvedValue({ ok: true, view: html, content: "<h1>hello</h1>", contentType: "text/html" });
		openPreviewInBrowser.mockResolvedValue({
			ok: true,
			url: "http://127.0.0.1:41234/canvas/dG9rZW4/art-html/index.html",
		});
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("演示页")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 演示页" }));
		await waitFor(() => expect(screen.getByLabelText("activityPanel.canvas.htmlSandboxLabel")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.openInBrowser" }));

		await waitFor(() => {
			expect(openPreviewInBrowser).toHaveBeenCalledWith({
				workspaceId: "/work/project",
				artifactId: "art-html",
			});
			expect(openedInWorkspace).toHaveBeenCalledWith({
				workspaceId: "/work/project",
				url: "http://127.0.0.1:41234/canvas/dG9rZW4/art-html/index.html",
			});
		});
	});

	it("回环伺服起不来时提示错误，且不切走当前预览", async () => {
		const store = createStore();
		const html = view({
			descriptor: descriptor({ artifactId: "art-html", title: "演示页", contentType: "text/html" }),
		});
		list.mockResolvedValue({ ok: true, items: [html] });
		get.mockResolvedValue({ ok: true, view: html, content: "<h1>hello</h1>", contentType: "text/html" });
		openPreviewInBrowser.mockResolvedValue({ ok: false, code: "missing_file", message: "no html version" });
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("演示页")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 演示页" }));
		await waitFor(() => expect(screen.getByLabelText("activityPanel.canvas.htmlSandboxLabel")).toBeTruthy());

		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.openInBrowser" }));

		await waitFor(() => {
			expect(
				getDefaultStore()
					.get(toastsAtom)
					.some((toast) => toast.message === "activityPanel.canvas.openInBrowserFailed"),
			).toBe(true);
		});
		expect(openedInWorkspace).not.toHaveBeenCalled();
		// 预览还在原地：失败不会把用户从当前 artifact 弹出去。
		expect(screen.getByLabelText("activityPanel.canvas.htmlSandboxLabel")).toBeTruthy();
	});

	it("非 HTML 产物不提供「在浏览器打开」", async () => {
		const store = createStore();
		renderPanel(store);
		await waitFor(() => expect(screen.getByText("调研摘要")).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: "activityPanel.canvas.open 调研摘要" }));
		await waitFor(() => expect(screen.getByTestId("canvas-text-preview")).toBeTruthy());

		expect(screen.queryByRole("button", { name: "activityPanel.canvas.openInBrowser" })).toBeNull();
	});
});
