// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { i18n, initI18n } from "@shared/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryTransfer } from "./MemoryTransfer.js";

/**
 * TASK-0378 导入/导出面板（展示组件）：注入动作、报告如实、失败不吞、
 * 处理中禁用。
 */

beforeAll(async () => {
	Object.assign(window, {
		vetta: { i18n: { initialState: { language: "zh" }, onLanguageChanged: () => () => {} } },
	});
	await initI18n();
	await i18n.changeLanguage("zh");
});

describe("记忆导入/导出面板（TASK-0378）", () => {
	it("导入报告如实：新导入、跳过重复、已撤销跳过", async () => {
		const onImport = vi.fn(async () => ({
			imported: 3,
			skippedDuplicates: 1,
			skippedSuppressed: 1,
		}));
		render(<MemoryTransfer onImport={onImport} onExport={vi.fn()} />);
		await userEvent.click(screen.getByRole("button", { name: /导入/ }));
		await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
		const report = await screen.findByTestId("memory-transfer-report");
		expect(report.textContent).toContain("3");
		expect(report.textContent).toContain("1");
	});

	it("导出显示条数；失败不吞", async () => {
		const onExport = vi.fn(async () => ({ exportedCount: 7 }));
		const first = render(<MemoryTransfer onImport={vi.fn()} onExport={onExport} />);
		await userEvent.click(first.getByRole("button", { name: /导出/ }));
		await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
		expect(await first.findByText(/7/)).toBeTruthy();
		first.unmount();

		const failing = vi.fn(async () => {
			throw new Error("文件不存在");
		});
		const second = render(<MemoryTransfer onImport={failing} onExport={vi.fn()} />);
		await userEvent.click(second.getByRole("button", { name: /导入/ }));
		expect(await second.findByText(/文件不存在/)).toBeTruthy();
	});
});
