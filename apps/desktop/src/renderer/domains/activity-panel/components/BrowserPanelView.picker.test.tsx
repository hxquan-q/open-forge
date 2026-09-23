// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { BrowserPanelView, type BrowserPanelLabels } from "@vetta-org/theme-ui/activity";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: BrowserPanelLabels = {
	noSession: "no-session",
	back: "back",
	forward: "forward",
	stop: "stop",
	reload: "reload",
	addressPlaceholder: "url",
	openExternal: "external",
	empty: "empty",
	loading: "loading",
	failed: "failed",
	retry: "retry",
	picker: "Pick element",
	pickerActive: "Picking an element",
	pickerHint: "Hover then click",
};

afterEach(cleanup);

describe("BrowserPanelView picker chrome", () => {
	it("lets the user turn picker on from the toolbar and shows the no-click hint", async () => {
		const user = userEvent.setup();
		const onTogglePicker = vi.fn();
		render(
			<BrowserPanelView
				workspaceId="ws-1"
				labels={labels}
				address="https://example.com"
				canBack={false}
				canForward={false}
				loading={false}
				failed={false}
				hasPage={true}
				currentUrl="https://example.com"
				partition="persist:vetta-browser"
				webviewRef={createRef<HTMLElement>()}
				onAddressChange={() => undefined}
				onAddressSubmit={(event) => event.preventDefault()}
				onBack={() => undefined}
				onForward={() => undefined}
				onStop={() => undefined}
				onReload={() => undefined}
				onOpenExternal={() => undefined}
				onRetry={() => undefined}
				pickerEnabled={true}
				pickerDisabled={false}
				onTogglePicker={onTogglePicker}
			/>,
		);
		expect(screen.getByText("Hover then click")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Picking an element" }));
		expect(onTogglePicker).toHaveBeenCalledTimes(1);
	});

	it("keeps the address bar visible in the empty state and disables picker", () => {
		render(
			<BrowserPanelView
				workspaceId="ws-1"
				labels={labels}
				address=""
				canBack={false}
				canForward={false}
				loading={false}
				failed={false}
				hasPage={false}
				currentUrl=""
				partition="persist:vetta-browser"
				webviewRef={createRef<HTMLElement>()}
				onAddressChange={() => undefined}
				onAddressSubmit={(event) => event.preventDefault()}
				onBack={() => undefined}
				onForward={() => undefined}
				onStop={() => undefined}
				onReload={() => undefined}
				onOpenExternal={() => undefined}
				onRetry={() => undefined}
				pickerEnabled={false}
				pickerDisabled={true}
				onTogglePicker={() => undefined}
			/>,
		);
		expect(screen.getByPlaceholderText("url")).toBeTruthy();
		expect(screen.getByText("empty")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Pick element" })).toHaveProperty("disabled", true);
	});
});
