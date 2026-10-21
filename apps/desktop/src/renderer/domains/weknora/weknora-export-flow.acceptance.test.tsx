// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, DialogWriteFileEntry, WeKnoraAgent, WeKnoraMessage, WeKnoraSession } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toTxt } from "./services/weknoraExport";

/**
 * flow-tester 独立验收测试（weknora-session-management，AC-3 / AC-6 / AC-9）。
 *
 * 沿 weknora-export-flow 的整页装配路线，但断言角度不同：
 * - AC-3 补「格式弹窗取消 = 零写入」（实现者只测了保存对话框取消）与 docx base64 落盘。
 * - AC-6 用 **120 条会话**（缺省导出页大小 50）真经 `window.vetta.weknora.loadMessages`
 *   翻 3 页，断言「不截断 + 顺序正确 + 游标推进」在**接线层**成立。
 * - AC-9 建**失败原因矩阵**（network / unauthorized / unknown 三类拉取失败 + 写盘失败），
 *   并验证写盘失败按文件名回映射到会话；另测重名去重与「导出中重复点击幂等」。
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
		<div role="button" data-value={value}>
			{children}
		</div>
	),
}));

import { showToast } from "@shared/store/toast-atoms";
import { WeKnoraPage } from "./components/WeKnoraPage";

type WeKnoraApi = DesktopApi["weknora"];
type DialogApi = DesktopApi["dialog"];

const EXPORT_DIR = "/tmp/weknora-export-acceptance";

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

function wireMessage(id: string, role: "user" | "assistant", content: string, createdAt?: string): WeKnoraMessage {
	return { id, role, content, ...(createdAt === undefined ? {} : { created_at: createdAt }) };
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
	loadCalls: Array<{ sessionId: string; limit: number; beforeTime?: string }>;
	addSession: (session: WeKnoraSession) => void;
}

/** 有状态假后端：loadMessages 按 `before_time` 真分页（复刻服务端语义）。 */
function installFake(): FakeHarness {
	const state: FakeState = { sessions: [], messagesBySession: {} };
	const loadCalls: Array<{ sessionId: string; limit: number; beforeTime?: string }> = [];
	let sessionSeq = 0;

	const saveData = vi.fn(
		async (_name: string, _content: string, _encoding?: "utf8" | "base64", _options?: unknown) =>
			`${EXPORT_DIR}/out`,
	);
	const selectDirectory = vi.fn(async () => EXPORT_DIR);
	const writeFilesToDirectory = vi.fn(async (input: { directory: string; files: DialogWriteFileEntry[] }) => ({
		written: input.files.map((file) => `${input.directory}/${file.name}`),
		failed: [] as Array<{ name: string; error: string }>,
	}));

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
		loadMessages: vi.fn(async ({ sessionId, limit, beforeTime }: { sessionId: string; limit: number; beforeTime?: string }) => {
			loadCalls.push({ sessionId, limit, beforeTime });
			const all = state.messagesBySession[sessionId] ?? [];
			const upper = beforeTime === undefined ? all.length : all.findIndex((m) => m.created_at === beforeTime);
			const end = upper < 0 ? all.length : upper;
			const start = Math.max(0, end - limit);
			return all.slice(start, end);
		}),
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
		loadCalls,
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

async function rightClickSession(nav: HTMLElement, name: RegExp | string): Promise<void> {
	fireEvent.contextMenu(within(nav).getByRole("button", { name }), { clientX: 12, clientY: 12 });
	await screen.findByRole("menu");
}

async function enterMultiSelect(nav: HTMLElement, name: RegExp | string): Promise<void> {
	await rightClickSession(nav, name);
	fireEvent.click(screen.getByRole("menuitem", { name: "多选" }));
	await screen.findByRole("button", { name: "批量删除" });
}

function selectRow(nav: HTMLElement, name: RegExp | string): void {
	fireEvent.click(within(nav).getByRole("button", { name }));
}

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

describe("AC-3 · 单会话导出流程", () => {
	it("txt：save-data 收到净化文件名 + utf8 正文，成功有反馈", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "问"), wireMessage("a1", "assistant", "答")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /会话 s1/, "文本(.txt)");

		await waitFor(() => expect(harness.dialog.saveData).toHaveBeenCalledTimes(1));
		const [fileName, content, enc] = harness.dialog.saveData.mock.calls[0] as [string, string, "utf8" | "base64"];
		expect(fileName).toBe("会话 s1.txt");
		expect(enc).toBe("utf8");
		expect(content).toBe(toTxt(harness.state.messagesBySession.s1 ?? []));
		await waitFor(() =>
			expect(vi.mocked(showToast)).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })),
		);
	});

	it("docx：save-data 收到 base64 载荷，可解码为 ZIP", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "问")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /会话 s1/, "Word(.docx)");

		await waitFor(() => expect(harness.dialog.saveData).toHaveBeenCalledTimes(1));
		const [fileName, content, enc] = harness.dialog.saveData.mock.calls[0] as [string, string, "utf8" | "base64"];
		expect(fileName).toBe("会话 s1.docx");
		expect(enc).toBe("base64");
		expect(Buffer.from(content, "base64").subarray(0, 2).toString("latin1")).toBe("PK");
	});

	it("格式弹窗「取消」：零写入、无 save-data 调用（AC-3）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "问")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await rightClickSession(nav, /会话 s1/);
		fireEvent.click(screen.getByRole("menuitem", { name: "导出会话" }));
		const dialog = await screen.findByRole("dialog");
		await userEvent.setup().click(within(dialog).getByRole("button", { name: "取消" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await act(async () => {
			await Promise.resolve();
		});
		expect(harness.dialog.saveData).not.toHaveBeenCalled();
		expect(harness.dialog.writeFilesToDirectory).not.toHaveBeenCalled();
		expect(vi.mocked(showToast)).not.toHaveBeenCalled();
	});

	it("保存对话框「取消」：save-data 调一次但零写盘、无反馈（AC-3）", async () => {
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
		expect(harness.dialog.writeFilesToDirectory).not.toHaveBeenCalled();
		expect(vi.mocked(showToast)).not.toHaveBeenCalled();
	});
});

describe("AC-6 · 导出拉全量（>20 条不截断）", () => {
	it("120 条会话真经 IPC 翻 3 页：save-data 正文含全部消息且顺序正确", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "长会话", updated_at: "2026-10-19T09:00:00" });
		const all = Array.from({ length: 120 }, (_, i) =>
			wireMessage(`m${i}`, i % 2 === 0 ? "user" : "assistant", `c${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()),
		);
		harness.state.messagesBySession.s1 = all;
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await startSingleExport(nav, /长会话/, "文本(.txt)");

		await waitFor(() => expect(harness.dialog.saveData).toHaveBeenCalledTimes(1));
		const content = harness.dialog.saveData.mock.calls[0][1] as string;
		// 120 轮，每轮一段，段落数与内容首尾都证明「未截断、顺序正确」。
		expect(content.split("\n\n")).toHaveLength(120);
		expect(content.startsWith("我: c0\n\n")).toBe(true);
		expect(content.endsWith("智能客服: c119")).toBe(true); // 末轮 m119 为 assistant
		expect(content).toContain("我: c118");
		// 缺省导出页大小 50 → 3 次调用，游标逐页推进。
		const calls = harness.loadCalls.filter((call) => call.sessionId === "s1");
		expect(calls.map((call) => call.limit)).toEqual([50, 50, 50]);
		expect(calls[0]?.beforeTime).toBeUndefined();
		expect(calls[1]?.beforeTime).toBe(all[70]?.created_at);
		expect(calls[2]?.beforeTime).toBe(all[20]?.created_at);
	});
});

describe("AC-9 · 批量导出", () => {
	it("选目录 → 每会话一文件写盘 → 结果「成功 N」（AC-9）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问")];
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
		expect(input.files[0]).toEqual({ name: "会话 s1.txt", utf8: toTxt(harness.state.messagesBySession.s1 ?? []) });

		await waitFor(() => expect(screen.getByText(/成功导出 2 个会话/)).toBeTruthy());
		await userEvent.setup().click(screen.getByRole("button", { name: "关闭" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("拉取失败原因矩阵：network / unauthorized / unknown 三类各自映射，成功项照常", async () => {
		const harness = installFake();
		for (const [id, title] of [
			["s1", "会话 s1"],
			["s2", "会话 s2"],
			["s3", "会话 s3"],
			["s4", "会话 s4"],
		] as const) {
			harness.addSession({ id, title, updated_at: "2026-10-19T09:00:00" });
			harness.state.messagesBySession[id] = [wireMessage(`${id}-u`, "user", `${title}问`)];
		}
		harness.api.loadMessages = vi.fn(async ({ sessionId }: { sessionId: string }) => {
			if (sessionId === "s1") throw new Error("network");
			if (sessionId === "s2") throw new Error("unauthorized");
			if (sessionId === "s3") throw new Error("something unexpected");
			return harness.state.messagesBySession[sessionId] ?? [];
		}) as unknown as WeKnoraApi["loadMessages"];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		await enterMultiSelect(nav, /会话 s1/);
		for (const name of [/会话 s1/, /会话 s2/, /会话 s3/, /会话 s4/]) selectRow(nav, name);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		const result = await screen.findByRole("dialog");
		expect(within(result).getByText(/成功导出 1 个会话/)).toBeTruthy();
		expect(within(result).getByText(/以下 3 个会话导出失败/)).toBeTruthy();
		expect(within(result).getByText(/网络不可达/)).toBeTruthy();
		expect(within(result).getByText(/API Key 无效或权限不足/)).toBeTruthy();
		expect(within(result).getByText(/发生未知错误/)).toBeTruthy();
		// 成功的 s4 未出现在失败明细里。
		expect(within(result).queryByText(/会话 s4/)).toBeNull();
	});

	it("写盘阶段失败按文件名回映射到会话，与拉取失败合并成同一份明细（AC-9 / D5）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "会话 s1", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "会话 s2", updated_at: "2026-10-19T08:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲问")];
		harness.state.messagesBySession.s2 = [wireMessage("u2", "user", "乙问")];
		harness.dialog.writeFilesToDirectory.mockResolvedValueOnce({
			written: [`${EXPORT_DIR}/会话 s1.txt`],
			failed: [{ name: "会话 s2.txt", error: "EACCES" }],
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
		expect(within(result).getByText(/成功导出 1 个会话/)).toBeTruthy();
		expect(within(result).getByText(/以下 1 个会话导出失败/)).toBeTruthy();
		expect(within(result).getByText(/会话 s2/)).toBeTruthy();
		expect(within(result).getByText(/写入文件失败/)).toBeTruthy();
	});

	it("取消目录选择：零写盘、不出结果弹窗（AC-9）", async () => {
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

	it("批内重名：两个同名会话各写一个文件，第二个自动加序号（AC-7 / AC-9）", async () => {
		const harness = installFake();
		harness.addSession({ id: "s1", title: "同名会话", updated_at: "2026-10-19T09:00:00" });
		harness.addSession({ id: "s2", title: "同名会话", updated_at: "2026-10-19T08:00:00" });
		harness.state.messagesBySession.s1 = [wireMessage("u1", "user", "甲")];
		harness.state.messagesBySession.s2 = [wireMessage("u2", "user", "乙")];
		renderFlow();
		await configureAndWaitReady();
		const nav = await screen.findByRole("navigation", { name: "历史会话" });

		// 两个同名行：用 getAllByRole 按顺序取（getByRole 会因多匹配报错）。
		const rows = within(nav).getAllByRole("button", { name: /同名会话/ });
		fireEvent.contextMenu(rows[0] as HTMLElement, { clientX: 12, clientY: 12 });
		await screen.findByRole("menu");
		fireEvent.click(screen.getByRole("menuitem", { name: "多选" }));
		await screen.findByRole("button", { name: "批量删除" });
		fireEvent.click(rows[0] as HTMLElement);
		fireEvent.click(rows[1] as HTMLElement);
		fireEvent.click(screen.getByRole("button", { name: "批量导出" }));
		const formatDialog = await screen.findByRole("dialog");
		fireEvent.click(within(formatDialog).getByRole("button", { name: "文本(.txt)" }));

		await waitFor(() => expect(harness.dialog.writeFilesToDirectory).toHaveBeenCalledTimes(1));
		const input = harness.dialog.writeFilesToDirectory.mock.calls[0][0] as {
			files: DialogWriteFileEntry[];
		};
		expect(input.files.map((file) => file.name)).toEqual(["同名会话.txt", "同名会话 (2).txt"]);
	});

	it("导出进行中重复点击幂等：只发起一次目录选择（T05 防重复）", async () => {
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
		// 再点（禁用）不应触发第二次目录选择。
		fireEvent.click(busy);
		fireEvent.click(busy);
		expect(harness.dialog.selectDirectory).toHaveBeenCalledTimes(1);

		await act(async () => {
			release?.(null);
			await Promise.resolve();
		});
		await waitFor(() => expect(screen.queryByRole("button", { name: "导出中…" })).toBeNull());
	});
});
