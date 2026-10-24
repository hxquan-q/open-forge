// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type BrowserLiveEditCardProps, type BrowserPanelLabels, BrowserPanelView } from "@vetta-org/theme-ui/activity";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: BrowserPanelLabels = {
	noSession: "no-session",
	back: "back",
	forward: "forward",
	stop: "stop",
	reload: "reload",
	addressPlaceholder: "url",
	addressLabel: "Page address",
	agentReady: "Shared with Agent",
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
				hostRef={createRef<HTMLDivElement>()}
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
				hostRef={createRef<HTMLDivElement>()}
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

	function liveEditModel(overrides: Partial<BrowserLiveEditCardProps> = {}): BrowserLiveEditCardProps {
		return {
			title: "Save button",
			target: "form > button#save",
			edits: [],
			busy: false,
			hasElement: true,
			error: null,
			styleProperties: ["color", "backgroundColor"],
			labels: {
				title: "Adjust element",
				textPlaceholder: "New text",
				applyText: "Apply text",
				styleProperty: "Property",
				styleValuePlaceholder: "Value",
				applyStyle: "Apply style",
				edits: "Edits",
				revertOne: "Revert",
				revertAll: "Revert all",
				send: "Send to Agent",
				comment: "Tell the Agent",
				commentPlaceholder: "How should this element change?",
				discard: "Discard",
				stale: "Selection is stale",
				failed: "Edit failed",
			},
			onApplyText: vi.fn(),
			onApplyStyle: vi.fn(),
			onRevertEdit: vi.fn(),
			onRevertAll: vi.fn(),
			onSend: vi.fn(),
			onDiscard: vi.fn(),
			...overrides,
		};
	}

	function panelView(liveEdit?: BrowserLiveEditCardProps, agentStatus?: string, viewLabels = labels) {
		return (
			<BrowserPanelView
				workspaceId="ws-1"
				labels={viewLabels}
				address="https://example.com"
				canBack={false}
				canForward={false}
				loading={false}
				failed={false}
				hasPage={true}
				currentUrl="https://example.com"
				hostRef={createRef<HTMLDivElement>()}
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
				onTogglePicker={() => undefined}
				liveEdit={liveEdit}
				agentStatus={agentStatus}
			/>
		);
	}

	function renderPanel(liveEdit?: BrowserLiveEditCardProps) {
		return render(panelView(liveEdit));
	}

	it("announces Agent operations without replacing the address or the native page host", async () => {
		const user = userEvent.setup();
		const panel = render(panelView(undefined, "Agent is reading this page"));
		const address = screen.getByRole("textbox", { name: "Page address" });
		await user.click(address);
		const host = panel.container.querySelector("[data-browser-view-host]");
		expect(screen.getByRole("status").textContent).toBe("Agent is reading this page");
		panel.rerender(panelView(undefined, "Agent is clicking an element"));
		expect(screen.getByRole("status").textContent).toBe("Agent is clicking an element");
		expect(document.activeElement).toBe(address);
		expect(panel.container.querySelector("[data-browser-view-host]")).toBe(host);
		panel.rerender(panelView());
		expect(screen.getByRole("status").textContent).toBe("Shared with Agent");
		expect(document.activeElement).toBe(address);
	});

	it("accepts the previous label contract and uses its localized address hint as the name", () => {
		const previousLabels = { ...labels, addressLabel: undefined, agentReady: undefined };
		render(panelView(undefined, undefined, previousLabels));
		expect(screen.getByRole("textbox", { name: "url" })).toBeTruthy();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("renders a native-view host placeholder instead of a <webview> element", () => {
		const { container } = renderPanel();
		// TASK-0072：弹窗许可（http(s) 同 view 打开）与隔离属性（contextIsolation/nodeIntegration）
		// 已迁至主进程 browser-view-host 的 WebContentsView 创建参数，由 browser-view-host.test.ts 覆盖。
		expect(container.querySelector("webview")).toBeNull();
		expect(container.querySelector("[data-browser-view-host]")).not.toBeNull();
	});

	it("选中后渲染即时预览卡：文本/样式提交、逐条与全部撤销、发送与放弃", async () => {
		const user = userEvent.setup();
		const model = liveEditModel({
			edits: [
				{
					kind: "style",
					property: "color",
					before: "",
					after: "red",
					target: "form > button#save",
				},
				{
					kind: "text",
					before: "Save",
					after: "Send",
					target: "form > button#save",
				},
			],
		});
		const { container } = renderPanel(model);
		expect(screen.getByText("Save button")).toBeTruthy();
		expect(screen.getByText("Edits (2)")).toBeTruthy();

		await user.type(screen.getByPlaceholderText("New text"), "Send");
		await user.click(screen.getByRole("button", { name: "Apply text" }));
		expect(model.onApplyText).toHaveBeenCalledWith("Send");

		await user.type(screen.getByPlaceholderText("Value"), "red");
		await user.click(screen.getByRole("button", { name: "Apply style" }));
		expect(model.onApplyStyle).toHaveBeenCalledWith("color", "red");

		await user.click(screen.getAllByRole("button", { name: "Revert" })[1]);
		expect(model.onRevertEdit).toHaveBeenCalledWith(1);
		await user.click(screen.getByRole("button", { name: "Revert all" }));
		expect(model.onRevertAll).toHaveBeenCalledTimes(1);
		await user.type(screen.getByRole("textbox", { name: "Tell the Agent" }), "Make it blue");
		await user.click(screen.getByRole("button", { name: "Send to Agent" }));
		expect(model.onSend).toHaveBeenCalledWith("Make it blue");
		const bar = container.querySelector("[data-browser-selection-bar]");
		expect(bar?.className).toContain("w-full");
		expect(bar?.className).not.toContain("w-72");
		const host = container.querySelector("[data-browser-view-host]");
		expect(host?.parentElement?.nextElementSibling).toBe(bar?.parentElement);
		await user.click(screen.getAllByRole("button", { name: "Discard" })[0]);
		expect(model.onDiscard).toHaveBeenCalled();
	});

	it("元素失效时显示 stale 提示并禁用输入", () => {
		renderPanel(liveEditModel({ hasElement: false, error: "stale_reference" }));
		expect(screen.getByText("Selection is stale")).toBeTruthy();
		expect(screen.getByPlaceholderText("New text")).toHaveProperty("disabled", true);
	});
});
