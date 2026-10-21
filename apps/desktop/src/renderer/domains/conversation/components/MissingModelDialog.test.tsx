// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { missingModelDialogOpenAtom } from "@shared/store/atoms";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingModelDialog } from "./MissingModelDialog";

const navigate = vi.fn();

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const store = getDefaultStore();

describe("MissingModelDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		store.set(missingModelDialogOpenAtom, true);
	});

	afterEach(cleanup);

	it("展示标题、正文与【取消】/【去配置模型 key】两个动作", () => {
		render(<MissingModelDialog />);

		expect(screen.getByText("chat:missingModelDialog.title")).toBeTruthy();
		expect(screen.getByText("chat:missingModelDialog.body")).toBeTruthy();
		expect(screen.getByRole("button", { name: "common:actions.cancel" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "chat:missingModelDialog.configureAction" })).toBeTruthy();
		// 不提供右上角关闭按钮:关闭入口只保留【取消】/【去配置模型 key】。
		expect(screen.queryByText("Close")).toBeNull();
	});

	it("点【取消】关闭对话框且零副作用(不跳转)", async () => {
		const user = userEvent.setup();
		render(<MissingModelDialog />);

		await user.click(screen.getByRole("button", { name: "common:actions.cancel" }));

		expect(store.get(missingModelDialogOpenAtom)).toBe(false);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("点【去配置模型 key】关闭对话框并直达模型预设服务商分区", async () => {
		const user = userEvent.setup();
		render(<MissingModelDialog />);

		await user.click(screen.getByRole("button", { name: "chat:missingModelDialog.configureAction" }));

		expect(store.get(missingModelDialogOpenAtom)).toBe(false);
		expect(navigate).toHaveBeenCalledWith({
			to: "/settings/$tab",
			params: { tab: "models" },
			search: { section: "models-preset-providers" },
		});
	});

	it("不点不消失:Esc 与外部点击都不关闭", async () => {
		const user = userEvent.setup();
		render(<MissingModelDialog />);

		await user.keyboard("{Escape}");
		expect(store.get(missingModelDialogOpenAtom)).toBe(true);

		fireEvent.pointerDown(document.body);
		fireEvent.mouseDown(document.body);
		expect(store.get(missingModelDialogOpenAtom)).toBe(true);
	});
});
