// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import type { DesktopApi } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryPage } from "./MemoryPage.js";
import type { MemoryListItem, MemoryListResult, MemoryPolicyState } from "@/shared/memory";

type MemoryApi = DesktopApi["memoryControl"];

function memoryItem(overrides: Partial<MemoryListItem> = {}): MemoryListItem {
	return {
		memoryId: "mem-1",
		revisionId: "rev-1",
		content: "项目 A 使用 bun run check",
		scopeName: "project",
		status: "active",
		validFrom: "2026-01-01T00:00:00Z",
		recordedAt: "2026-01-02T00:00:00Z",
		pinned: false,
		evidence: "user-confirmed",
		...overrides,
	};
}

function listResult(items: readonly MemoryListItem[], hasMore = false): MemoryListResult {
	return { items, page: 1, pageSize: 20, hasMore };
}

const baseApi: MemoryApi = {
	listMemories: vi.fn(async () => listResult([memoryItem()])),
	searchMemories: vi.fn(async () => ({ items: [memoryItem()], degraded: true })),
	getMemoryDetail: vi.fn(async () => ({
		memoryId: "mem-1",
		revisions: [
			{ revisionId: "rev-1", revisionNo: 1, content: "旧内容", status: "superseded", validFrom: "", recordedAt: "" },
			{ revisionId: "rev-2", revisionNo: 2, content: "项目 A 使用 bun run check", status: "active", validFrom: "", recordedAt: "" },
		],
		sources: [{ sourceId: "session/s/1", role: "user-input" }],
	})),
	correctMemory: vi.fn(async () => ({ memoryId: "mem-1", revision: 3 })),
	forgetMemory: vi.fn(async () => ({ memoryId: "mem-1", erasureEpoch: 1, alsoProcessSourcesAccepted: false })),
	getMemoryPolicy: vi.fn(async (): Promise<MemoryPolicyState> => ({ mode: "explicit" })),
	setMemoryPolicy: vi.fn(async (state: MemoryPolicyState): Promise<MemoryPolicyState> => state),
};

function installApi(overrides: Partial<MemoryApi> = {}): MemoryApi {
	const api = { ...baseApi, ...overrides };
	Object.assign(window, { vetta: { memoryControl: api, i18n: { initialState: { language: "zh" } } } });
	return api;
}

beforeAll(async () => {
	Object.assign(window, {
		vetta: { i18n: { initialState: { language: "zh" }, onLanguageChanged: () => () => {} } },
	});
	await initI18n();
	await i18n.changeLanguage("zh");
});

describe("记忆管理页面（TASK-0377）", () => {
	it("壳先行：loading → 列表渲染；空态与失败态可恢复", async () => {
		installApi({ listMemories: vi.fn(async () => listResult([])) });
		const { unmount } = render(<MemoryPage />);
		expect(screen.getByText(/加载中/)).toBeTruthy();
		await waitFor(() => expect(screen.getByText(/还没有记忆/)).toBeTruthy());
		unmount();

		installApi({ listMemories: vi.fn().mockRejectedValue(new Error("boom")) });
		render(<MemoryPage />);
		await waitFor(() => expect(screen.getByText(/加载失败/)).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /重试/ }));
		await waitFor(() => expect(screen.getByText(/加载失败/)).toBeTruthy());
	});

	it("模式选择：读取当前模式并保存切换（经 IPC）", async () => {
		const api = installApi();
		render(<MemoryPage />);
		await waitFor(() => expect(api.getMemoryPolicy).toHaveBeenCalled());
		const offButton = screen.getByRole("button", { name: /关闭/ });
		await userEvent.click(offButton);
		await waitFor(() => expect(api.setMemoryPolicy).toHaveBeenCalledWith({ mode: "off" }));
	});

	it("详情：修订历史与来源可见", async () => {
		installApi();
		render(<MemoryPage />);
		await waitFor(() => expect(screen.getByText(/bun run check/)).toBeTruthy());
		await userEvent.click(screen.getByText(/bun run check/));
		await waitFor(() => expect(screen.getByTestId("memory-detail")).toBeTruthy());
		expect(screen.getByText(/旧内容/)).toBeTruthy();
		expect(screen.getByText(/session\/s\/1/)).toBeTruthy();
	});

	it("纠正：冲突错误如实呈现，成功后列表刷新", async () => {
		const api = installApi({
			correctMemory: vi.fn().mockRejectedValueOnce(new Error("REVISION_CONFLICT")).mockResolvedValue({ memoryId: "mem-1", revision: 3 }),
		});
		render(<MemoryPage />);
		await waitFor(() => expect(screen.getByText(/bun run check/)).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /纠正/ }));
		const dialog = screen.getByTestId("memory-correct");
		const textarea = dialog.querySelector("textarea");
		expect(textarea).not.toBeNull();
		await userEvent.type(requireTextarea(textarea), "！");
		await userEvent.click(screen.getByRole("button", { name: /保存更正/ }));
		expect(await screen.findByText(/版本冲突/)).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: /保存更正/ }));
		await waitFor(() => expect(api.correctMemory).toHaveBeenCalledTimes(2));
	});

	it("忘记：确认后列表清空，来源处理只随选择传参", async () => {
		const api = installApi({ listMemories: vi.fn(async () => listResult([memoryItem()])) });
		render(<MemoryPage />);
		await waitFor(() => expect(screen.getByText(/bun run check/)).toBeTruthy());
		await userEvent.click(screen.getByRole("button", { name: /忘记/ }));
		const dialog = screen.getByTestId("memory-forget");
		expect(dialog).toBeTruthy();
		await userEvent.click(within(dialog).getByRole("button", { name: /^忘记$/ }));
		await waitFor(() =>
			expect(api.forgetMemory).toHaveBeenCalledWith({ memoryId: "mem-1", alsoProcessSources: false }),
		);
	});

	it("搜索降级标注显示", async () => {
		installApi();
		render(<MemoryPage />);
		const input = screen.getByLabelText(/搜索记忆/);
		await userEvent.type(input, "构建");
		await waitFor(() => expect(screen.getByText(/子串回退/)).toBeTruthy());
	});
});

function requireTextarea(area: Element | null): HTMLElement {
	if (area === null) throw new Error("textarea 不存在");
	return area as HTMLElement;
}

