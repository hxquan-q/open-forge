// @vitest-environment jsdom

import { confirmDialogAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useSchedulerPermissionTiersModel } from "./useSchedulerPermissionTiersModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

describe("useSchedulerPermissionTiersModel", () => {
	it("defaults every tier off and does not pre-check enable-all", () => {
		const store = createStore();
		const onFieldChange = vi.fn();
		const { result } = renderHook(
			() => useSchedulerPermissionTiersModel({}, onFieldChange),
			{ wrapper: wrapperFor(store) },
		);
		expect(result.current.options.every((option) => option.enabled === false)).toBe(true);
	});

	it("enable-all opens a risk confirmation before applying all tiers", () => {
		const store = createStore();
		const onFieldChange = vi.fn();
		const { result } = renderHook(
			() => useSchedulerPermissionTiersModel({}, onFieldChange),
			{ wrapper: wrapperFor(store) },
		);

		act(() => result.current.onEnableAll());
		const confirm = store.get(confirmDialogAtom);
		expect(confirm?.title).toBe("form.permissionTiers.enableAllConfirmTitle");
		expect(onFieldChange).not.toHaveBeenCalled();

		act(() => confirm?.onConfirm(false));
		expect(onFieldChange).toHaveBeenCalledWith(
			"permissionTiers",
			expect.objectContaining({
				allowWorkspaceWrite: true,
				allowCommonCommands: true,
				allowBatchDelete: true,
				allowSystemTools: true,
				autoApprovePrompts: true,
			}),
		);
	});
});

function wrapperFor(store: ReturnType<typeof createStore>) {
	return function TestProvider({ children }: { children: ReactNode }): JSX.Element {
		return <Provider store={store}>{children}</Provider>;
	};
}
