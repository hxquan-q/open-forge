// Modified by The Open Forge contributors.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDefaultStore } from "jotai";
import { activityPanelOpenAtom, taskStateBySessionAtom } from "@shared/store/atoms";
import type { RuntimeSessionTaskState } from "@vetta/runtime-core/task";
import { describe, expect, it, vi } from "vitest";
import { DefaultChatView, ChatComposer, ChatError } from "./DefaultChatView";

vi.hoisted(() => {
	// activity-atoms 在模块初始化即读 window.innerWidth 与 localStorage（node 环境无 DOM）。
	const storage = new Map<string, string>();
	const g = globalThis as Record<string, unknown>;
	g.window = { innerWidth: 1200 };
	g.localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, String(value)),
		removeItem: (key: string) => void storage.delete(key),
		clear: () => storage.clear(),
		key: () => null,
		length: 0,
	};
});

const workspace = { id: "conversation:test", cwd: null, runtimeIds: [] };

vi.mock("@domains/activity-panel/components/ActivityPanel", () => ({
	ActivityPanel: () => createElement("aside", { "data-testid": "activity-panel" }),
	CurrentScenarioActivityPanel: () => createElement("aside", { "data-testid": "activity-panel" }),
}));

vi.mock("@domains/workspace-mode/components/WorkWorkspacePanel", () => ({
	WorkWorkspacePanel: ({ children }: { children?: ReactNode }) =>
		createElement("aside", { "data-testid": "work-panel" }, children),
}));

vi.mock("@domains/workspace-mode/components/WorkDocumentSections", () => ({
	WorkDocumentSections: () => createElement("div", { "data-testid": "work-document-sections" }),
}));

vi.mock("@domains/bottom-panel/components/BottomPanelHost", () => ({
	BottomPanelHost: () => createElement("section", { "data-testid": "bottom-panel" }),
}));

vi.mock("../ChatExportHost", () => ({
	ChatExportHost: () => null,
}));

describe("DefaultChatView layout", () => {
	it("keeps the activity panel outside the input column (drop is owned by InputBar card)", () => {
		const html = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workspace}>
				<div data-testid="message-list" />
				<ChatError>Send failed</ChatError>
				<ChatComposer>
					<div data-testid="input-bar" />
				</ChatComposer>
			</DefaultChatView>,
		);

		const messageList = html.indexOf('data-testid="message-list"');
		const inputBar = html.indexOf('data-testid="input-bar"');
		const activityPanel = html.indexOf('data-testid="activity-panel"');

		expect(messageList).toBeLessThan(inputBar);
		expect(html.indexOf('role="alert"')).toBeGreaterThan(messageList);
		expect(html.indexOf('role="alert"')).toBeLessThan(inputBar);
		expect(inputBar).toBeLessThan(activityPanel);
	});

	it("底部面板住在消息列内部：排在输入框之后、活动面板之前", () => {
		const html = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workspace}>
				<div data-testid="message-list" />
				<ChatComposer>
					<div data-testid="input-bar" />
				</ChatComposer>
			</DefaultChatView>,
		);

		const inputBar = html.indexOf('data-testid="input-bar"');
		const activityPanel = html.indexOf('data-testid="activity-panel"');
		const bottomPanel = html.indexOf('data-testid="bottom-panel"');

		// 夹在输入框与活动面板之间 = 它是消息列的最后一个子节点，宽度跟着消息列走，
		// 不会横穿到右侧活动面板底下把两列看成一块。
		expect(bottomPanel).toBeGreaterThan(inputBar);
		expect(bottomPanel).toBeLessThan(activityPanel);
	});

	it("work 模式右栏：空态不占位，有任务/产物才出工作面板；预览仍让位", () => {
		const store = getDefaultStore();
		const workWorkspace = { ...workspace, runtimeIds: ["runtime-1"] };
		const stateWithTask: RuntimeSessionTaskState = {
			tasks: [
				{
					schemaVersion: 1,
					identity: { taskId: "task-1", rootSessionId: "runtime-1" },
					status: "running",
					createdAt: 100,
					updatedAt: 120,
					artifactIds: [],
					pendingApprovalIds: [],
				},
			],
			artifacts: [],
			pendingApprovals: [],
			approvalDecisions: new Map(),
		};

		// 空投影：右侧整条不占位，也不退回执行轨迹。
		const emptyHtml = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workWorkspace} workspaceMode="work">
				<div />
			</DefaultChatView>,
		);
		expect(emptyHtml).not.toContain('data-testid="work-panel"');
		expect(emptyHtml).not.toContain('data-testid="activity-panel"');

		// 投影出现任务/产物后，右栏出工作面板。
		store.set(taskStateBySessionAtom, new Map([["runtime-1", stateWithTask]]));
		const workHtml = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workWorkspace} workspaceMode="work">
				<div />
			</DefaultChatView>,
		);
		store.set(taskStateBySessionAtom, new Map());
		expect(workHtml).toContain('data-testid="work-panel"');
		expect(workHtml).toContain('data-testid="work-document-sections"');
		expect(workHtml).not.toContain('data-testid="activity-panel"');

		// 文件预览/浏览器等显式打开活动面板时，work 面板让位——预览能力不回退。
		getDefaultStore().set(activityPanelOpenAtom, true);
		const previewHtml = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workWorkspace} workspaceMode="work">
				<div />
			</DefaultChatView>,
		);
		getDefaultStore().set(activityPanelOpenAtom, false);
		expect(previewHtml).toContain('data-testid="activity-panel"');
		expect(previewHtml).not.toContain('data-testid="work-panel"');

		const codingHtml = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workspace} workspaceMode="coding">
				<div />
			</DefaultChatView>,
		);
		expect(codingHtml).toContain('data-testid="activity-panel"');
		expect(codingHtml).not.toContain('data-testid="work-panel"');

		// Team 等自带 activity 配置的宿主在 work 模式下仍用自己的面板。
		const hostHtml = renderToStaticMarkup(
			<DefaultChatView
				messages={[]}
				workspace={workspace}
				workspaceMode="work"
				activity={{ enablePluginTabs: true }}
			>
				<div />
			</DefaultChatView>,
		);
		expect(hostHtml).toContain('data-testid="activity-panel"');
		expect(hostHtml).not.toContain('data-testid="work-panel"');
	});

	it("can compose a read-only feed without mounting a composer", () => {
		const html = renderToStaticMarkup(
			<DefaultChatView messages={[]} workspace={workspace}>
				<div data-testid="read-only-feed" />
			</DefaultChatView>,
		);

		expect(html).toContain('data-testid="read-only-feed"');
		expect(html).not.toContain('data-testid="input-bar"');
	});
});
