// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { DesktopArtifactReadOutcome } from "@preload/api-types/task";
import { pathTokenText } from "@shared/lib/input-tokens";
import { taskStateBySessionAtom } from "@shared/store/atoms";
import { sendMessageFnRef } from "@shared/store/chat-atoms";
import type { ArtifactDescriptor, RuntimeSessionTaskState, RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkDocumentSections } from "./WorkDocumentSections";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			options?.targetUri ? `${key}:${options.targetUri}` : key,
	}),
}));

const selectFiles = vi.fn();
const getState = vi.fn();
const runCommand = vi.fn();
const readArtifact = vi.fn();
const exportArtifact = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			dialog: { selectFiles: (...args: unknown[]) => selectFiles(...args) },
			task: {
				getState: (...args: unknown[]) => getState(...args),
				runCommand: (...args: unknown[]) => runCommand(...args),
				readArtifact: (...args: unknown[]) => readArtifact(...args),
				exportArtifact: (...args: unknown[]) => exportArtifact(...args),
			},
		},
	}),
);

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@shared/store/toast-atoms", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@shared/store/toast-atoms")>();
	return { ...actual, showToast: showToastMock };
});

function taskSnapshot(overrides: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: { taskId: "task-1", rootSessionId: "runtime-1" },
		status: "awaiting_review",
		title: "整理季度材料",
		createdAt: 100,
		updatedAt: 120,
		artifactIds: ["artifact-1"],
		pendingApprovalIds: [],
		...overrides,
	};
}

function artifactDescriptor(overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: "artifact-1",
		kind: "document",
		status: "generated",
		title: "季度纪要.md",
		uri: "C:/session/artifacts/quarter.md",
		version: 1,
		sourceSessionId: "runtime-1",
		createdAt: 100,
		updatedAt: 120,
		...overrides,
	};
}

function taskState(overrides: Partial<RuntimeSessionTaskState> = {}): RuntimeSessionTaskState {
	return {
		tasks: [taskSnapshot()],
		artifacts: [artifactDescriptor()],
		pendingApprovals: [],
		approvalDecisions: new Map(),
		...overrides,
	};
}

function renderSections(runtimeIds: readonly string[] = ["runtime-1"], seed: RuntimeSessionTaskState = taskState()) {
	const store = createStore();
	store.set(taskStateBySessionAtom, new Map([["runtime-1", seed]]));
	const utils = render(
		<Provider store={store}>
			<WorkDocumentSections runtimeIds={runtimeIds} />
		</Provider>,
	);
	return { store, ...utils };
}

beforeEach(() => {
	getState.mockReset().mockResolvedValue(taskState());
	runCommand.mockReset();
	readArtifact.mockReset();
	exportArtifact.mockReset();
	selectFiles.mockReset().mockResolvedValue([]);
	showToastMock.mockClear();
});

afterEach(() => {
	cleanup();
	sendMessageFnRef.current = null;
});

describe("WorkDocumentSections sources", () => {
	it("选择文件并填写目标后发起任务，创建成功再走全局发送通道", async () => {
		const user = userEvent.setup();
		const sendMessage = vi.fn().mockResolvedValue({ status: "sent" });
		sendMessageFnRef.current = sendMessage;
		selectFiles.mockResolvedValue(["C:/资料/报告.docx"]);
		runCommand.mockResolvedValue({ ok: true, state: taskState() });

		renderSections();
		await user.click(await screen.findByRole("button", { name: "workspace.work.sources.pickFile" }));
		const source = await screen.findByText("报告.docx");
		expect(source.getAttribute("title")).toBe("C:/资料/报告.docx");
		await user.type(screen.getByPlaceholderText("workspace.work.sources.goalPlaceholder"), "整理成一页纪要");
		await user.click(screen.getByRole("button", { name: "workspace.work.sources.start" }));

		await waitFor(() => {
			expect(runCommand).toHaveBeenCalledWith("runtime-1", { type: "create", title: "整理成一页纪要" });
		});
		await waitFor(() => {
			expect(sendMessage).toHaveBeenCalledWith(`${pathTokenText("C:/资料/报告.docx")} 整理成一页纪要`);
		});
		expect(showToastMock).not.toHaveBeenCalled();
	});

	it("未选择来源文件时不能发起任务", async () => {
		const user = userEvent.setup();
		const sendMessage = vi.fn();
		sendMessageFnRef.current = sendMessage;
		renderSections();
		await user.type(screen.getByPlaceholderText("workspace.work.sources.goalPlaceholder"), "整理成一页纪要");
		expect((screen.getByRole("button", { name: "workspace.work.sources.start" }) as HTMLButtonElement).disabled).toBe(
			true,
		);
		expect(runCommand).not.toHaveBeenCalled();
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("来源列表只显示文件名并支持移除，移除后不再随任务发送", async () => {
		const user = userEvent.setup();
		const sendMessage = vi.fn().mockResolvedValue({ status: "sent" });
		sendMessageFnRef.current = sendMessage;
		selectFiles.mockResolvedValue(["C:/资料/报告.docx", "C:/资料/附录.md"]);
		runCommand.mockResolvedValue({ ok: true, state: taskState() });

		renderSections();
		await user.click(await screen.findByRole("button", { name: "workspace.work.sources.pickFile" }));
		await screen.findByText("报告.docx");
		await screen.findByText("附录.md");

		const reportItem = screen.getByText("报告.docx").closest("li");
		await user.click(within(reportItem!).getByRole("button"));

		expect(screen.queryByText("报告.docx")).toBeNull();
		await user.type(screen.getByPlaceholderText("workspace.work.sources.goalPlaceholder"), "整理成一页纪要");
		await user.click(screen.getByRole("button", { name: "workspace.work.sources.start" }));
		await waitFor(() => {
			expect(sendMessage).toHaveBeenCalledWith(`${pathTokenText("C:/资料/附录.md")} 整理成一页纪要`);
		});
	});
	it("create 失败时提示任务命令失败，不发送消息", async () => {
		const user = userEvent.setup();
		const sendMessage = vi.fn();
		sendMessageFnRef.current = sendMessage;
		selectFiles.mockResolvedValue(["C:/a.md"]);
		runCommand.mockResolvedValue({ ok: false, code: "task_command_failed", message: "boom" });

		renderSections();
		await user.click(await screen.findByRole("button", { name: "workspace.work.sources.pickFile" }));
		await user.type(screen.getByPlaceholderText("workspace.work.sources.goalPlaceholder"), "x");
		await user.click(screen.getByRole("button", { name: "workspace.work.sources.start" }));

		await waitFor(() => {
			expect(showToastMock).toHaveBeenCalledWith(
				expect.objectContaining({ message: "activityPanel.task.error.commandFailed", variant: "error" }),
			);
		});
		expect(sendMessage).not.toHaveBeenCalled();
	});
});

describe("WorkDocumentSections plan", () => {
	it("计划状态按语义分级：等待审阅用警告色，执行中带共享呼吸点", () => {
		const seed = taskState({
			tasks: [
				taskSnapshot({ identity: { taskId: "task-live", rootSessionId: "runtime-1" }, status: "running" }),
				taskSnapshot({ identity: { taskId: "task-review", rootSessionId: "runtime-1" }, status: "awaiting_review" }),
			],
			artifacts: [],
		});
		renderSections(["runtime-1"], seed);

		const plan = document.querySelector('[data-section="plan"]');
		expect(plan?.querySelector(".text-amber-400")?.textContent).toBe("activityPanel.task.status.awaitingReview");
		expect(plan?.querySelector(".text-emerald-400")?.textContent).toBe("activityPanel.task.status.running");
		expect(plan?.querySelector(".vetta-live-dot")).not.toBeNull();
	});
	it("已有任务时展示标题与状态，重开会话后主进程快照补齐产物", async () => {
		const seed = taskState({ artifacts: [] });
		renderSections(["runtime-1"], seed);
		const plan = document.querySelector('[data-section="plan"]');
		expect(plan?.textContent).toContain("整理季度材料");
		expect(plan?.textContent).toContain("activityPanel.task.status.awaitingReview");
		expect(await screen.findByRole("button", { name: "季度纪要.md" })).toBeTruthy();
	});
});

describe("WorkDocumentSections artifacts", () => {
	it("点击产物读取内容，成功时展示预览并在截断时提示", async () => {
		const user = userEvent.setup();
		readArtifact.mockResolvedValue({
			status: "ok",
			content: "第一行\n第二行",
			truncated: true,
			title: "季度纪要.md",
		} satisfies DesktopArtifactReadOutcome);
		renderSections();

		await user.click(await screen.findByRole("button", { name: "季度纪要.md" }));
		const pre = await screen.findByLabelText("季度纪要.md");
		expect(pre.textContent).toContain("第二行");
		expect(pre.textContent).toContain("workspace.work.artifacts.truncated");
		expect(showToastMock).not.toHaveBeenCalled();
	});

	it("readArtifact 返回 source-missing 时用 toast 提示且不展示预览", async () => {
		const user = userEvent.setup();
		readArtifact.mockResolvedValue({ status: "source-missing", artifactId: "artifact-1" });
		renderSections();

		await user.click(await screen.findByRole("button", { name: "季度纪要.md" }));
		await waitFor(() => {
			expect(showToastMock).toHaveBeenCalledWith(
				expect.objectContaining({ message: "workspace.work.artifacts.sourceMissing", variant: "error" }),
			);
		});
		expect(screen.queryByText("第二行")).toBeNull();
	});

	it("读取异常走通用失败 toast", async () => {
		readArtifact.mockRejectedValue(new Error("offline"));
		const user = userEvent.setup();
		renderSections();
		await user.click(await screen.findByRole("button", { name: "季度纪要.md" }));
		await waitFor(() => {
			expect(showToastMock).toHaveBeenCalledWith(
				expect.objectContaining({ message: "workspace.work.artifacts.previewUnavailable", variant: "error" }),
			);
		});
	});
});

describe("WorkDocumentSections review", () => {
	it("等待审阅的任务提供三个动作并发送对应 review 命令", async () => {
		const user = userEvent.setup();
		runCommand.mockResolvedValue({ ok: true, state: taskState() });
		renderSections();

		await user.click(await screen.findByRole("button", { name: "activityPanel.task.action.approve" }));
		expect(runCommand).toHaveBeenCalledWith("runtime-1", { type: "review", taskId: "task-1", decision: "approved" });
		await user.click(screen.getByRole("button", { name: "activityPanel.task.action.requestChanges" }));
		expect(runCommand).toHaveBeenCalledWith("runtime-1", {
			type: "review",
			taskId: "task-1",
			decision: "changes_requested",
		});
		await user.click(screen.getByRole("button", { name: "activityPanel.task.action.reject" }));
		expect(runCommand).toHaveBeenCalledWith("runtime-1", { type: "review", taskId: "task-1", decision: "rejected" });
		expect(showToastMock).not.toHaveBeenCalled();
	});

	it("accepted 产物可导出并展示导出路径", async () => {
		const user = userEvent.setup();
		const seed = taskState({ artifacts: [artifactDescriptor({ status: "accepted" })] });
		getState.mockResolvedValue(seed);
		exportArtifact.mockResolvedValue({ status: "exported", targetUri: "D:/out/季度纪要.md" });
		renderSections(["runtime-1"], seed);

		await user.click(await screen.findByRole("button", { name: "workspace.work.review.export" }));
		expect(await screen.findByText(/workspace\.work\.review\.exported:D:\/out\/季度纪要\.md/)).toBeTruthy();
		expect(exportArtifact).toHaveBeenCalledWith("runtime-1", "artifact-1");
		expect(showToastMock).not.toHaveBeenCalled();
	});

	it("非 accepted 产物不提供导出按钮", async () => {
		const seed = taskState({ artifacts: [artifactDescriptor({ status: "generated" })] });
		getState.mockResolvedValue(seed);
		renderSections(["runtime-1"], seed);

		expect(await screen.findByRole("button", { name: "季度纪要.md" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "workspace.work.review.export" })).toBeNull();
	});

	it("导出 cancelled / source-missing 分支呈现结果行与错误 toast", async () => {
		const user = userEvent.setup();
		const seed = taskState({ artifacts: [artifactDescriptor({ status: "accepted" })] });
		getState.mockResolvedValue(seed);
		renderSections(["runtime-1"], seed);

		exportArtifact.mockResolvedValueOnce({ status: "cancelled" });
		await user.click(await screen.findByRole("button", { name: "workspace.work.review.export" }));
		expect(await screen.findByText("workspace.work.review.cancelled")).toBeTruthy();
		expect(showToastMock).not.toHaveBeenCalled();

		exportArtifact.mockResolvedValueOnce({ status: "source-missing", artifactId: "artifact-1" });
		await user.click(screen.getByRole("button", { name: "workspace.work.review.export" }));
		expect(await screen.findByText("workspace.work.review.sourceMissing")).toBeTruthy();
		expect(showToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ message: "workspace.work.review.sourceMissing", variant: "error" }),
		);
	});
});
