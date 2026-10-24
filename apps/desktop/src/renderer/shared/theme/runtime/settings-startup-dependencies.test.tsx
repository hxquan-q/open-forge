// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const settings = vi.hoisted(() => ({ evaluations: 0 }));
vi.mock("@vetta-org/theme-ui/settings", async (original) => {
	settings.evaluations += 1;
	return original();
});

import { RemoteProjectPickerDialog } from "../../../domains/project/components/sidebar/add-project/RemoteProjectPickerDialog";
import { ShortcutRecorder } from "../../../domains/settings/components/ShortcutRecorder";

describe("startup settings dependencies", () => {
	it("imports the SSH form and shortcut recorder without evaluating the full settings catalog", () => {
		expect(RemoteProjectPickerDialog).toBeTypeOf("function");
		expect(ShortcutRecorder).toBeTypeOf("function");
		expect(settings.evaluations).toBe(0);
	});
	it("records a shortcut and preserves the reset action through the lightweight view", () => {
		const onChange = vi.fn();
		const onReset = vi.fn();
		render(
			<ShortcutRecorder
				value="mod+j"
				onChange={onChange}
				onReset={onReset}
				isDefault={false}
				placeholder="Press keys"
				resetLabel="Reset shortcut"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /J/ }));
		expect(screen.getByRole("button", { name: "Press keys" })).toBeTruthy();
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(onChange).toHaveBeenCalledWith("mod+k");
		fireEvent.click(screen.getByRole("button", { name: "Reset shortcut" }));
		expect(onReset).toHaveBeenCalledOnce();
	});
});
