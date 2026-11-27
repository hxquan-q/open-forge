// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	InputBarAttachmentActions,
	InputBarSendAction,
	InputBarSpeechAction,
} from "./InputBarToolbar";

vi.mock("./InputBarToolbarButton", () => ({
	InputBarToolbarButton: ({ title, onClick }: { title: string; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{title}
		</button>
	),
}));
vi.mock("../SendButton", () => ({
	SendButton: ({ onSend }: { onSend: () => void }) => (
		<button type="button" onClick={onSend}>
			Send
		</button>
	),
}));

afterEach(cleanup);

describe("InputBar toolbar abilities", () => {
	it("keeps image and file attachment actions independently callable", () => {
		const onSelectImages = vi.fn();
		const onSelectFiles = vi.fn();
		render(
			<InputBarAttachmentActions
				disabled={false}
				visible
				addImageTitle="Add image"
				attachFileTitle="Attach file"
				onSelectImages={onSelectImages}
				onSelectFiles={onSelectFiles}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Add image" }));
		fireEvent.click(screen.getByRole("button", { name: "Attach file" }));
		expect(onSelectImages).toHaveBeenCalledOnce();
		expect(onSelectFiles).toHaveBeenCalledOnce();
	});

	it("renders speech input only when that ability is available", () => {
		const onToggle = vi.fn();
		const input = {
			visible: false,
			active: false,
			disabled: false,
			title: "Dictate",
			statusText: null,
			onToggle,
		};
		const view = render(<InputBarSpeechAction input={input} />);
		expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();

		view.rerender(<InputBarSpeechAction input={{ ...input, visible: true }} />);
		fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it("preserves queue and normal send actions as separate states", () => {
		const onSend = vi.fn();
		const view = render(
			<InputBarSendAction
				canSend
				isEmpty={false}
				isStreaming
				queueTitle="Queue"
				onAbort={vi.fn()}
				onSend={onSend}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Queue" }));
		expect(onSend).toHaveBeenCalledOnce();

		view.rerender(
			<InputBarSendAction
				canSend
				isEmpty
				isStreaming={false}
				queueTitle="Queue"
				onAbort={vi.fn()}
				onSend={onSend}
			/>,
		);
		expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
	});

	it("keeps the send slot out of an inline line box so swapping to queue does not change the toolbar height", () => {
		const view = render(
		<InputBarSendAction canSend isEmpty isStreaming queueTitle="Queue" onAbort={vi.fn()} onSend={vi.fn()} />,
		);
		// 块级外壳会给 inline-flex 的 SendButton 留出行盒下沿空隙，比 32px 的队列按钮高几像素。
		expect((view.container.firstElementChild as HTMLElement).classList.contains("flex")).toBe(true);
	});
});
