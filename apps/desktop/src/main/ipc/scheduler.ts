import { isAutomationHostEventName } from "@vetta/coding-agent/runtime";
import { ipcMain, type WebContents } from "electron";
import { emitAutomationHostEvent } from "../scheduler/automation-event-dispatcher.js";
import type { DiscoveredAutomationPackage } from "../scheduler/automation-package-discovery.js";
import {
	type AutomationPackageExportResult,
	type AutomationPackageImportResult,
	type AutomationPackagePreviewDto,
	AutomationPackageService,
} from "../scheduler/automation-package-service.js";
import { getRuntime } from "../scheduler/scheduler.js";
import type { SchedulerService } from "../scheduler/scheduler-service.js";
import { getRunningTaskIds } from "../scheduler/task-executor";
import type { ScheduledTask } from "../scheduler/task-storage";
import { deleteRecordsBySessionPath, loadAllScheduledSessionPaths, loadRecords } from "../scheduler/task-storage";

const CHANNELS = {
	GET_TASKS: "vetta:scheduler:get-tasks",
	CREATE_TASK: "vetta:scheduler:create-task",
	UPDATE_TASK: "vetta:scheduler:update-task",
	DELETE_TASK: "vetta:scheduler:delete-task",
	TOGGLE_TASK: "vetta:scheduler:toggle-task",
	DISABLE_TASK: "vetta:scheduler:disable-task",
	GET_RECORDS: "vetta:scheduler:get-records",
	GET_RUNNING: "vetta:scheduler:get-running",
	GET_SESSION_PATHS: "vetta:scheduler:get-session-paths",
	DELETE_RECORD_BY_SESSION: "vetta:scheduler:delete-record-by-session",
	RUN_NOW: "vetta:scheduler:run-now",
	ABORT: "vetta:scheduler:abort",
	EVENT: "vetta:scheduler:event",
	STREAM_EVENT: "vetta:scheduler:stream-event",
	PACKAGE_EXPORT: "vetta:scheduler:package-export",
	PACKAGE_IMPORT: "vetta:scheduler:package-import",
	PACKAGE_IMPORT_URL: "vetta:scheduler:package-import-url",
	PACKAGE_PREVIEW: "vetta:scheduler:package-preview",
	PACKAGE_DISCOVER: "vetta:scheduler:package-discover",
	EMIT_HOST_EVENT: "vetta:scheduler:emit-host-event",
} as const;

type TaskStreamHandler = (event: TaskStreamEvent) => void;
interface TaskStreamEvent {
	taskId: string;
	sessionId: string;
	type: "message.delta" | "thinking.delta" | "tool.start" | "tool.end" | "toolcall.start" | "session.lifecycle";
	delta?: string;
	toolCallId?: string;
	toolName?: string;
	args?: Record<string, unknown>;
	result?: unknown;
	isError?: boolean;
	phase?: string;
}

export type TaskEvent =
	| {
			type: "task.started";
			taskId: string;
			recordId: string;
			sessionId: string;
			sessionPath: string;
			cwd: string;
			sessionName: string;
			firstMessage: string;
	  }
	| { type: "task.completed"; taskId: string; recordId: string; status: "success" | "failed" }
	| { type: "task.failed"; taskId: string; error: string }
	| { type: "record.updated"; taskId: string; sessionId: string; status: "success" | "aborted" }
	| { type: "tasks.changed" };

const streamHandlers = new Set<TaskStreamHandler>();
const eventHandlers = new Set<(event: TaskEvent) => void>();

export function emitTaskStreamEvent(event: TaskStreamEvent): void {
	for (const handler of streamHandlers) {
		handler(event);
	}
}

export function emitTaskEvent(event: TaskEvent): void {
	for (const handler of eventHandlers) {
		handler(event);
	}
}

export function registerSchedulerIpc(webContents: WebContents, service: SchedulerService): () => void {
	const packageService = new AutomationPackageService(service);
	const streamHandler = (event: TaskStreamEvent) => {
		webContents.send(CHANNELS.STREAM_EVENT, event);
	};
	streamHandlers.add(streamHandler);

	const eventHandler = (event: TaskEvent) => {
		webContents.send(CHANNELS.EVENT, event);
	};
	eventHandlers.add(eventHandler);
	const unsubscribeTasksChanged = service.onTasksChanged(() => {
		emitTaskEvent({ type: "tasks.changed" });
	});

	ipcMain.handle(CHANNELS.GET_TASKS, async () => {
		return await service.listTasks();
	});

	ipcMain.handle(
		CHANNELS.CREATE_TASK,
		async (_, task: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus">) => {
			return await service.createTask(task);
		},
	);

	ipcMain.handle(CHANNELS.UPDATE_TASK, async (_, id: string, patch: Partial<ScheduledTask>) => {
		await service.updateTask(id, patch);
	});

	ipcMain.handle(CHANNELS.DELETE_TASK, async (_, id: string) => {
		await service.deleteTask(id);
	});

	ipcMain.handle(CHANNELS.TOGGLE_TASK, async (_, id: string) => {
		await service.toggleTask(id);
	});

	ipcMain.handle(CHANNELS.DISABLE_TASK, async (_, id: string) => {
		await service.setEnabled(id, false);
	});

	ipcMain.handle(CHANNELS.GET_RECORDS, async (_, taskId: string) => {
		return loadRecords(taskId);
	});

	ipcMain.handle(CHANNELS.GET_RUNNING, async () => {
		return getRunningTaskIds();
	});

	ipcMain.handle(CHANNELS.GET_SESSION_PATHS, async () => {
		return loadAllScheduledSessionPaths();
	});

	ipcMain.handle(CHANNELS.DELETE_RECORD_BY_SESSION, async (_, sessionPath: string) => {
		return deleteRecordsBySessionPath(sessionPath);
	});

	ipcMain.handle(CHANNELS.ABORT, async (_, taskId: string) => {
		await service.abort(taskId);
	});

	ipcMain.handle(CHANNELS.RUN_NOW, async (_, taskId: string) => {
		await service.runNow(taskId);
	});

	ipcMain.handle(CHANNELS.PACKAGE_EXPORT, async (_, taskIds: string[]): Promise<AutomationPackageExportResult> => {
		return await packageService.exportTasks(taskIds);
	});

	ipcMain.handle(CHANNELS.PACKAGE_IMPORT, async (_, defaultCwd: string): Promise<AutomationPackageImportResult> => {
		return await packageService.importFromDialog(defaultCwd);
	});

	ipcMain.handle(
		CHANNELS.PACKAGE_IMPORT_URL,
		async (_, url: string, defaultCwd: string): Promise<AutomationPackageImportResult> => {
			return await packageService.importFromUrl(url, defaultCwd);
		},
	);

	ipcMain.handle(CHANNELS.PACKAGE_PREVIEW, async (_, text: string): Promise<AutomationPackagePreviewDto> => {
		return await packageService.previewText(text);
	});

	ipcMain.handle(CHANNELS.PACKAGE_DISCOVER, async (): Promise<readonly DiscoveredAutomationPackage[]> => {
		return await packageService.discover();
	});

	ipcMain.handle(
		CHANNELS.EMIT_HOST_EVENT,
		async (
			_,
			eventName: string,
			context?: { cwd?: string; sessionId?: string; sessionPath?: string },
		): Promise<void> => {
			if (!isAutomationHostEventName(eventName)) return;
			// 仅允许渲染层报告的 UI 侧事件；session.created / project.opened 由主进程域发出。
			if (eventName !== "automation.panelOpened" && eventName !== "session.switched") return;
			emitAutomationHostEvent(eventName, context ?? {}, getRuntime);
		},
	);

	return () => {
		unsubscribeTasksChanged();
		streamHandlers.delete(streamHandler);
		eventHandlers.delete(eventHandler);
		ipcMain.removeHandler(CHANNELS.GET_TASKS);
		ipcMain.removeHandler(CHANNELS.CREATE_TASK);
		ipcMain.removeHandler(CHANNELS.UPDATE_TASK);
		ipcMain.removeHandler(CHANNELS.DELETE_TASK);
		ipcMain.removeHandler(CHANNELS.TOGGLE_TASK);
		ipcMain.removeHandler(CHANNELS.DISABLE_TASK);
		ipcMain.removeHandler(CHANNELS.GET_RECORDS);
		ipcMain.removeHandler(CHANNELS.GET_RUNNING);
		ipcMain.removeHandler(CHANNELS.GET_SESSION_PATHS);
		ipcMain.removeHandler(CHANNELS.DELETE_RECORD_BY_SESSION);
		ipcMain.removeHandler(CHANNELS.ABORT);
		ipcMain.removeHandler(CHANNELS.RUN_NOW);
		ipcMain.removeHandler(CHANNELS.PACKAGE_EXPORT);
		ipcMain.removeHandler(CHANNELS.PACKAGE_IMPORT);
		ipcMain.removeHandler(CHANNELS.PACKAGE_IMPORT_URL);
		ipcMain.removeHandler(CHANNELS.PACKAGE_PREVIEW);
		ipcMain.removeHandler(CHANNELS.PACKAGE_DISCOVER);
		ipcMain.removeHandler(CHANNELS.EMIT_HOST_EVENT);
	};
}
