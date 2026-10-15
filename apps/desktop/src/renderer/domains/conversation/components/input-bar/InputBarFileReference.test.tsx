// @vitest-environment jsdom

import { installVettaBridge } from "@/test/vetta-bridge";
import { initI18n } from "@shared/i18n";
import { parseInputSegments } from "@shared/lib/input-tokens";
import { type MentionedFile, inputValueAtom, mentionedFilesAtom } from "@shared/store/atoms";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDefaultStore, useSetAtom } from "jotai";
import { type JSX, useMemo } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionDropZoneModel } from "../../hooks/useSessionDropZoneModel";
import { replaceInputSegments } from "./editor/inputEditorHandle";
import { InputBarView } from "./InputBarView";
import type { InputBarModel } from "./types";
import { useInputBarAttachmentModel } from "./useInputBarAttachmentModel";

// 被测路径是「文件来源 → 草稿引用」的真实接线：粘贴走编辑器的原生 paste 事件与插件链、
// 拖放走输入卡片上的 drop zone、侧边栏走工具栏按钮；断言一律落在 mentionedFilesAtom
// （发送链路读的草稿投影，由编辑器 segments 投影而来）上，不直接调中间 helper。
//
// 重型控件（模型选择器、发送按钮、抽屉、附件预览）换哑元，但 InputBarAttachmentActions
// 保留真实实现——侧边栏入口必须还是用户点得到的那个按钮。

vi.mock("@vetta-org/theme-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk")>();
	return { ...actual, useThemeComponent: (_key: string, fallback: unknown) => fallback };
});
vi.mock("@vetta-org/theme-sdk/appearance", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk/appearance")>();
	return { ...actual, useThemeSurface: () => undefined };
});
vi.mock("@vetta-org/theme-ui/shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-ui/shared")>();
	return { ...actual, useDelayedUnmount: (open: boolean) => open };
});
vi.mock("@vetta-org/theme-ui/bottom-panel", () => ({ BottomPanelPillsView: () => null }));
vi.mock("./InputBarAttachmentPreview", () => ({ InputBarAttachmentPreview: () => null }));
vi.mock("./InputBarDrawer", () => ({ InputBarDrawer: () => null }));
vi.mock("./InputBarToolbar", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./InputBarToolbar")>();
	return {
		...actual,
		InputBarActiveActions: () => null,
		InputBarContextAction: () => null,
		InputBarExecutionModeAction: () => null,
		InputBarModelAction: () => null,
		InputBarSendAction: () => null,
		InputBarSkillsAction: () => null,
		InputBarSpeechAction: () => null,
	};
});

const CWD = "C:\\workspace\\demo";

interface TransferItemLike {
	readonly kind: string;
	readonly type: string;
	getAsFile(): File | null;
}

/** 可控 DataTransfer：只暴露被测代码真正读的那几个面。 */
function createTransfer(files: readonly File[], types: readonly string[] = ["Files"]): DataTransfer {
	const items: TransferItemLike[] = files.map((file) => ({
		kind: "file",
		type: file.type,
		getAsFile: () => file,
	}));
	return { files, items, types, dropEffect: "none", getData: () => "" } as unknown as DataTransfer;
}

/** 原生拖放事件：React 的合成事件会把 dataTransfer 从原生事件上原样取走。 */
function fireDrag(type: "dragenter" | "dragover" | "drop", element: Element, dataTransfer: DataTransfer): void {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
	fireEvent(element, event);
}

/** 原生粘贴事件：Lexical 在编辑器根节点上挂了真正的 paste 监听，Ctrl+V 走的就是这条路。 */
function firePaste(element: Element, files: readonly File[], text: string | null = null): void {
	const event = new Event("paste", { bubbles: true, cancelable: true });
	const formats = new Map<string, string>(text === null ? [] : [["text/plain", text]]);
	Object.defineProperty(event, "clipboardData", {
		value: {
			...createTransfer(files, text === null ? ["Files"] : ["Files", "text/plain"]),
			getData: (format: string) => formats.get(format) ?? "",
		},
	});
	element.dispatchEvent(event);
}

function fileOf(name: string, type = ""): File {
	return new File(["payload"], name, { type });
}

function createBaseModel(
	dropZone: InputBarModel["dropZone"],
	attachments: Pick<ReturnType<typeof useInputBarAttachmentModel>, "handleSelectFiles" | "handleSelectImages">,
): InputBarModel {
	return {
		dropZone,
		isStreaming: false,
		pendingQuestion: undefined,
		pendingMcpElicitation: undefined,
		imageAttachments: [],
		activeActions: [],
		appshotAttachment: null,
		hasSession: true,
		canSend: true,
		isEmpty: true,
		showPlaceholder: false,
		hasCapsules: false,
		effectiveCwd: CWD,
		placeholderTexts: ["给 Vetta 派活…"],
		placeholderRotating: false,
		isFocused: false,
		drawerItems: [],
		drawerActiveTab: null,
		todo: null,
		sessionAxesLabel: null,
		bottomPanelPills: null,
		speechInput: null,
		hasPromptAttachment: false,
		pendingMessageEdit: false,
		pendingEditHint: "正在替换上一条消息",
		cancelPendingEditLabel: "取消",
		contextMenu: null,
		editor: { namespace: "chat-input-file-ref-test" },
		modelSelector: { updateActiveSession: true },
		leadingTools: [],
		trailingTools: [],
		sendBehavior: "direct",
		labels: {
			capsule: {
				removeDefault: "移除",
				removeImage: "移除图片",
				removeTooltip: (path) => path,
				activeGroup: (count) => `${count} 个插件`,
			},
			permission: { deny: "拒绝", allow: "允许", allowSession: "本会话允许" },
			toolbar: { skills: "技能", addImage: "添加图片", attachFile: "添加文件", queue: "队列" },
		},
		actions: {
			setFocused: vi.fn(),
			setDrawerActiveTab: vi.fn(),
			handleEnter: () => false,
			handleContextMenu: vi.fn(),
			removeImage: vi.fn(),
			openImagePreview: vi.fn(),
			removePromptAttachment: vi.fn(),
			removeAppshot: vi.fn(),
			handleSelectImages: attachments.handleSelectImages,
			handleSelectFiles: attachments.handleSelectFiles,
			handleSend: vi.fn(),
			handleAbort: async () => undefined,
			cancelPendingEdit: vi.fn(),
		},
	};
}

/** 与 DefaultInputBarConnector 同构：真实 drop zone + 真实附件动作，只有展示层被替换。 */
function ComposerHarness(): JSX.Element {
	const dropZone = useSessionDropZoneModel(CWD);
	const setMentionedFiles = useSetAtom(mentionedFilesAtom);
	const attachments = useInputBarAttachmentModel({
		activeRuntimeId: "runtime-1",
		effectiveCwd: CWD,
		hasSession: true,
		imageAttachments: [],
		setAppshotAttachment: () => undefined,
		setFilePreview: () => undefined,
		setInputValue: () => undefined,
		setMentionedFiles,
		setPendingMessageEdit: () => undefined,
		setPromptAttachment: () => undefined,
	});
	const model = useMemo(() => createBaseModel(dropZone, attachments), [dropZone, attachments]);
	return <InputBarView model={model} />;
}

function draftFiles(): readonly MentionedFile[] {
	return getDefaultStore().get(mentionedFilesAtom);
}

function draftPaths(): readonly string[] {
	return draftFiles().map((file) => file.path);
}

function dropZoneElement(container: HTMLElement): HTMLElement {
	const element = container.querySelector<HTMLElement>('[data-vetta-drop-scope="input"]');
	if (!element) throw new Error("input drop zone is not mounted");
	return element;
}

function editorElement(container: HTMLElement): HTMLElement {
	const element = container.querySelector<HTMLElement>('[contenteditable="true"]');
	if (!element) throw new Error("input editor is not mounted");
	return element;
}

beforeAll(() => {
	installVettaBridge({
		fs: {
			// Electron 的 webUtils.getPathForFile：真实 File 才拿得到路径，构造出来的 File 返回空串。
			pathForFile: (file: File) => `${CWD}\\${file.name}`,
			stat: async () => ({ size: 0 }),
		},
		dialog: {
			selectFiles: async () => [`${CWD}\\src\\index.ts`],
			persistImageFiles: async (_sessionId: string, files: readonly File[]) =>
				files.map((file) => ({ path: `${CWD}\\${file.name}` })),
			persistImages: async () => [],
		},
		clipboard: { pasteUserMessage: async () => null },
	});
	initI18n();
});

// 草稿走全局 store 与模块级编辑器 handle，跨用例会残留（真实应用里这也是「草稿保留」语义），
// 每个用例前清空，避免上一个用例的 token 变成下一个用例断言里的噪声。
beforeEach(() => {
	getDefaultStore().set(mentionedFilesAtom, []);
	getDefaultStore().set(inputValueAtom, "");
});

afterEach(cleanup);

describe("输入栏文件引用：粘贴 / 拖放 / 侧边栏三入口共用草稿合同", () => {
	it("把复制来的非图片文件粘贴进输入框，草稿出现该文件引用", async () => {
		const { container } = render(<ComposerHarness />);
		await waitFor(() => expect(editorElement(container)).toBeTruthy());

		firePaste(editorElement(container), [fileOf("quarterly-report.pdf", "application/pdf")]);

		await waitFor(() => {
			expect(draftPaths()).toContain(`${CWD}\\quarterly-report.pdf`);
		});
		expect(draftFiles()[0]?.name).toBe("quarterly-report.pdf");
		expect(draftFiles()[0]?.isDirectory).toBe(false);
	});

	it("把文件拖入输入卡片，草稿出现该文件引用", async () => {
		const { container } = render(<ComposerHarness />);
		await waitFor(() => expect(editorElement(container)).toBeTruthy());
		const zone = dropZoneElement(container);
		const transfer = createTransfer([fileOf("notes.md", "text/markdown")]);

		fireDrag("dragenter", zone, transfer);
		fireDrag("dragover", zone, transfer);
		fireDrag("drop", zone, transfer);

		await waitFor(() => {
			expect(draftPaths()).toContain(`${CWD}\\notes.md`);
		});
	});

	it("点击工具栏「添加文件」（侧边栏同源入口）仍能加引用", async () => {
		const { container } = render(<ComposerHarness />);
		await waitFor(() => expect(editorElement(container)).toBeTruthy());

		fireEvent.click(screen.getByTitle("添加文件"));

		await waitFor(() => {
			expect(draftPaths()).toContain(`${CWD}\\src\\index.ts`);
		});
	});

	it("粘贴图片仍走既有图片落盘路径，不退化成文件引用", async () => {
		const { container } = render(<ComposerHarness />);
		await waitFor(() => expect(editorElement(container)).toBeTruthy());

		firePaste(editorElement(container), [fileOf("pixel.png", "image/png")]);

		await waitFor(() => {
			expect(draftPaths()).toContain(`${CWD}\\pixel.png`);
		});
	});

	it("纯文本剪贴板不产生文件引用，日常文本编辑不受影响", async () => {
		const { container } = render(<ComposerHarness />);
		await waitFor(() => expect(editorElement(container)).toBeTruthy());

		// 剪贴板里没有任何 file 项：文件分支必须放行给 Lexical 的纯文本粘贴。
		firePaste(editorElement(container), [], "hello");

		await waitFor(() => expect(container.querySelectorAll("[data-inline-token]")).toHaveLength(0));
		expect(draftFiles()).toHaveLength(0);

		// 同一编辑器继续按「文本进草稿、附件为空」的常态投影（外部写入草稿走的也是这条路）。
		await act(async () => {
			replaceInputSegments(parseInputSegments("hello").segments);
		});
		await waitFor(() => expect(getDefaultStore().get(inputValueAtom)).toBe("hello"));
		expect(draftFiles()).toHaveLength(0);
		expect(container.querySelectorAll("[data-inline-token]")).toHaveLength(0);
	});
});
