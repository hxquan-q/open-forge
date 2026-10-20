// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, DialogWriteFileEntry, WeKnoraAgent, WeKnoraMessage, WeKnoraSession } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toMarkdown, toTxt } from "./services/weknoraExport";

/**
 * T05 导出接线流程级用例（AC-3 / AC-9）。
 *
 * 沿 weknora-multiselect-flow / weknora-delete-flow 的路线：整页装配 + 有状态假后端，
 * 按真实用户路径（右键「导出会话」/ 多选「批量导出」→ 格式 → 保存框 / 目录 → 结果）断言可观察行为。
 * 「取消仍写盘」「失败被吞」「导出中可重复点」这类缺陷只有流程级能测出。
 *
 * 反馈 toast 走全局命令式入口（`showToast`），测试里 mock 掉以断言「不静默」。
 */

vi.mock("@shared/store/toast-atoms", () => ({ showToast: vi.fn() }));

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<button type="button" data-value={value}>
			{children}
		</button>
	),
}));

import { showToast } from "@shared/store/toast-atoms";
import { WeKnoraPage } from "./components/WeKnoraPage";

type WeKnoraApi = DesktopApi["weknora"];
type DialogApi = DesktopApi["dialog"];

const EXPORT_DIR = "/tmp/weknora-export";

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function wireMessage(id: string, role: "user" | "assistant", content: string): WeKnoraMessage {
	return { id, role, content };
}

interface FakeState {
	sessions: WeKnoraSession[];
	messagesBySession: Record<string, WeKnoraMessage[]>;
}

interface FakeHarness {
	api: WeKnoraApi;
	dialog: {
		saveData: ReturnType<typeof vi.fn>;
		selectDirectory: ReturnType<typeof vi.fn>;
		writeFilesToDirectory: ReturnType<typeof vi.fn>;
	};
	state: FakeState;
	addSession: (session: WeKnoraSession) => void;
}

/** 有状态假后端 + 假 dialog 桥（导出只经 save-data / select-directory / write-files-to-directory）。 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	let sessionSeq = 0;

	const saveData = vi.fn(
		async (_name: string, _content: string, _encoding?: "utf8" | "base64", _options?: unknown) =>
			`${EXPORT_DIR}/out`,
	);
	const selectDirectory = vi.fn(async () => EXPORT_DIR);
	const writeFilesToDirectory = vi.fn(
		async (input: { directory: string; files: DialogWriteFileEntry[] }) => ({
			written: input.files.map((file) => `${input.directory}/${file.name}`),
			failed: [] as Array<{ name: string; error: string }>,
		}),
	);

	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => ({
			baseUrl: "http://host:8083",
			defaultAgentId: "",
			pageSize: 50,
			hasApiKey: true,
		})),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A")]),
		listSessions: vi.fn(async () => [...state.sessions]),
		loadMessages: vi.fn(async ({ sessionId }: { sessionId: string }) => state.messagesBySession[sessionId] ?? []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		getFile: vi.fn(async () => ({ dataUrl: "data:image/png;base64,", contentType: "image/png" })),
		ask: vi.fn(async () => {
			sessionSeq += 1;
			return { requestId: `r${sessionSeq}`, sessionId: `s${sessionSeq}` };
		}),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn(() => () => undefined),
	};

	const dialog = { saveData, selectDirectory, writeFilesToDirectory } as unknown as DialogApi;
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api, dialog } as unknown as DesktopApi,
	});

	return {
		api,
		dialog: { saveData, selectDirectory, writeFilesToDirectory },
		state,
		addSession: (session) => {
			state.sessions = [session, ...state.sessions];
		},
	};
}

function renderFlow(): void {
	render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function configureAndWaitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

/** 右键某条历史会话行，弹出上下文菜单（AC-6）。 */
async function rightClickSession(nav: HTMLElement, name: RegExp | string): Promise<void> {
	fireEvent.contextMenu(within(nav).getByRole("button", { name }), { clientX: 12, clientY: 12 });
	await screen.findByRole("menu");
}

/** 右键 → 菜单「多选」→ 进入多选模式。 */
async function enterMultiSelect(nav: HTMLElement, name: RegExp | string): Promise<void> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "多选" }));
	await screen.findByRole("button", { name: "批量删除" });
}

/** 勾选某会话行（多选模式）。 */
function selectRow(nav: HTMLElement, name: RegExp | string): void {
	fireEvent.click(within(nav).getByRole("button", { name }));
}

/** 右键「导出会话」→ 格式弹窗 → 选某格式。 */
async function startSingleExport(nav: HTMLElement, name: RegExp | string, formatLabel: string): Promise<void> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "导出会话" }));
	const dialog = await screen.findByRole("dialog");
	fireEvent.click(within(dialog).getByRole("button", { name: formatLabel }));
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

beforeEach(() => {
	vi.mocked(showToast).mockClear();
});

describe("智能客服 · 导出接线（T05 / AC-3 / AC-9）", () => {
	it("右键菜单含「导出会话」项（AC-3）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await rightClickSession(nav, /会话 s1/);
		expect(screen.getByRole("menuitem", { name: "导出会话" })).toBeTruthy();
	});

	it.each([
		{ label: "文本(.txt)", extension: "txt", encoding: "utf8" },
		{ label: "Markdown(.md)", extension: "md", encoding: "utf8" },
		{ label: "Word(.docx)", extension: "docx", encoding: "base64" },
	])("单会话导出 $extension：拉全量 → 序列化 → save-data（$encoding）（AC-3/AC-5）", async ({
		label,
		extension,
		encoding,
	}) => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		const messages = [wireMessage("u1", "user", "问"), wireMessage("a1", "assistant", "答")];
		harness.state.messagesBySession.s1 = messages;
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /会话 s1/, label);

		await waitFor(() => expect(harness.dialog.saveData).toHaveBeenCalledTimes(1));
		const [fileName, content, enc] = harness.dialog.saveData.mock.calls[0] as [string, string, "utf8" | "base64"];
		expect(fileName).toBe(`会话 s1.${extension}`);
		expect(enc).toBe(encoding);
		// txt / md 内容 = 序列化器产物；docx 是 base64（合法性由纯函数用例覆盖）。
		if (extension === "txt") expect(content).toBe(toTxt(messages));
		if (extension === "md") expect(content).toBe(toMarkdown(messages));
		// 成功反馈不静默。
		await waitFor(() =>
			expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })),
		);
	});

	it("单会话导出取消保存对话框：零写入、无反馈（AC-3）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "问")];
		harness.dialog.saveData.mockResolvedValueOnce(null);
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /会话 s1/, "文本(.txt)");

		await waitFor(() => expect(harness.dialog.saveData).toHaveBeenCalledTimes(1));
		await act(async () => {
			await Promise.resolve();
		});
		// 取消：不写盘、不打扰（既无成功也无失败 toast）。
		expect(harness.dialog.writeFilesToDirectory).not.toHaveBeenCalled();
		expect(vi.mocked(showToast)).not.toHaveBeenCalled();
	});

	it("单会话导出失败：不静默（出错误反馈）（AC-3）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.api.loadMessages = vi.fn(async () => {
			throw new Error("network");
		}) as unknown as WeKnoraApi["loadMessages"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /会话 s1/, "文本(.txt)");

		await waitFor(() =>
			expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })),
		);
		expect(harness.dialog.saveData).not.toHaveBeenCalled();
	});

	it("批量导出：选目录 → 每会话一文件写盘 → 结果「成功 N」（AC-9）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问"), wireMessage("a1", "assistant", "甲答")];
		harness.state.messagesBySession.s2 = [wireMessage("u2", "user", "乙问")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		selectRow(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		await waitFor(() => expect(harness.dialog.writeFilesToDirectory).toHaveBeenCalledTimes(1));
		const input = harness.dialog.writeFilesToDirectory.mock.calls[0][0] as {
			directory: string;
			files: DialogWriteFileEntry[];
		};
		expect(harness.dialog.selectDirectory).toHaveBeenCalledTimes(1);
		expect(input.directory).toBe(EXPORT_DIR);
		expect(input.files.map((file) => file.name)).toEqual(["会话 s1.txt", "会话 s2.txt"]);
		// 每会话一文件，内容为该会话序列化结果。
		expect(input.files[0]).toEqual({ name: "会话 s1.txt", utf8: toTxt(harness.state.messagesBySession.s1 ?? []) });

		// 结果反馈：成功 2。
		await waitFor(() => expect(screen.getByText(/成功导出 2 个会话/)).toBeTruthy());
		await userEvent.setup().click(screen.getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("批量导出部分失败：聚合「成功 N / 失败 M（名 + 原因）」，拉取与写盘两类都如实报（AC-9 / D5）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问")];
		// s2 拉取失败（network）；s1 写盘失败。
		const baseLoad = harness.api.loadMessages;
		harness.api.loadMessages = vi.fn(async (input: { sessionId: string }) => {
			if (input.sessionId === "s2") throw new Error("network");
			return baseLoad(input);
		}) as unknown as WeKnoraApi["loadMessages"];
		harness.dialog.writeFilesToDirectory.mockResolvedValueOnce({
			written: [],
			failed: [{ name: "会话 s1.txt", error: "EACCES" }],
		});
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		selectRow(nav, /会话 s2/);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功导出 0 个会话/)).toBeTruthy();
		expect(within(result).getByText(/以下 2 个会话导出失败/)).toBeTruthy();
		// 拉取失败：会话名 + 归一化错误文案。
		expect(within(result).getByText(/会话 s2/)).toBeTruthy();
		expect(within(result).getByText(/网络不可达/)).toBeTruthy();
		// 写盘失败：会话名 + 通用写盘失败文案。
		expect(within(result).getByText(/会话 s1/)).toBeTruthy();
		expect(within(result).getByText(/写入文件失败/)).toBeTruthy();
	});

	it("批量导出取消目录选择：零写入、不出结果（AC-9）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问")];
		harness.dialog.selectDirectory.mockResolvedValueOnce(null);
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		await waitFor(() => expect(harness.dialog.selectDirectory).toHaveBeenCalledTimes(1));
		expect(harness.dialog.writeFilesToDirectory).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("导出进行中：操作条按钮禁用并显示「导出中…」（防重复点击）（T05）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问")];
		let release: ((value: string | null) => void) | null = null;
		harness.dialog.selectDirectory.mockImplementationOnce(
			() =>
				new Promise<string | null>((resolve) => {
					release = resolve;
				}),
		);
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		selectRow(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		const busy = await screen.findByRole("button", { name: "导出中…" });
		expect((busy as HTMLButtonElement).disabled).toBe(true);

		await act(async () => {
			release?.(null);
			await Promise.resolve();
		});
		await waitFor(() => expect(screen.queryByRole("button", { name: "导出中…" })).toBeNull());
	});
});
