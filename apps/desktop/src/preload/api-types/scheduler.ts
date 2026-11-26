// Modified by The Open Forge contributors.
import type {
	AutomationTaskCreateRequest,
	AutomationTaskEvent,
	AutomationTaskUpdateRequest,
	ScheduledTask,
	TaskExecutionRecord,
} from "../../shared/automation.js";

export type {
	AutomationPermissionTiers,
	AutomationRunTarget,
	AutomationSchedule,
	AutomationTaskCreateRequest,
	AutomationTaskEvent,
	AutomationTaskTrigger,
	AutomationTaskUpdateRequest,
	ScheduledTask,
	TaskExecutionRecord,
} from "../../shared/automation.js";

/** 兼容别名：renderer 既有消费名。 */
export type TaskEvent = AutomationTaskEvent;
export type ScheduledTaskPermissionTiers = NonNullable<ScheduledTask["permissionTiers"]>;

export interface AutomationPackagePreview {
	pkg: {
		schemaVersion: 1;
		id: string;
		version: string;
		name: string;
		description?: string;
		requires: {
			minAppVersion?: string;
			taskSchemaVersion: number;
			capabilities?: string[];
			platforms?: Array<"win32" | "darwin" | "linux">;
		};
		task: {
			name: string;
			prompt: string;
			cron: string;
			isOnce?: boolean;
		};
	};
	contentSha256: string;
	compatible: boolean;
	reasons: string[];
}

export type AutomationPackageImportResult =
	| { status: "imported"; taskId: string; enabled: false }
	| { status: "canceled" }
	| { status: "rejected"; reasons: string[] };

export type AutomationPackageExportResult = { status: "exported"; path: string } | { status: "canceled" };

export interface DiscoveredAutomationPackage {
	pkg: AutomationPackagePreview["pkg"];
	contentSha256: string;
	sourceRepository: string;
	sourceUrl: string;
	stars: number;
	updatedAt: string;
}

export interface DesktopSchedulerApi {
	getTasks(): Promise<ScheduledTask[]>;
	createTask(task: AutomationTaskCreateRequest): Promise<ScheduledTask>;
	updateTask(id: string, patch: AutomationTaskUpdateRequest): Promise<void>;
	deleteTask(id: string): Promise<void>;
	toggleTask(id: string): Promise<void>;
	/** Disable a task (set enabled=false and stop its scheduled job) */
	disableTask(id: string): Promise<void>;
	getRecords(taskId: string): Promise<TaskExecutionRecord[]>;
	/** 当前正在执行的任务 id 列表（main 进程内存态快照）。 */
	getRunningTaskIds(): Promise<string[]>;
	/** 所有定时任务执行过的 session 路径（侧栏据此识别定时 session）。 */
	getScheduledSessionPaths(): Promise<string[]>;
	/** 按 session 路径删除其执行记录，返回受影响的 taskId 列表。 */
	deleteRecordsBySession(sessionPath: string): Promise<string[]>;
	runTaskNow(id: string): Promise<void>;
	abortTask(id: string): Promise<void>;
	onTaskEvent(handler: (event: TaskEvent) => void): () => void;
	exportAutomationPackages(taskIds: string[]): Promise<AutomationPackageExportResult>;
	importAutomationPackage(defaultCwd: string): Promise<AutomationPackageImportResult>;
	importAutomationPackageFromUrl(url: string, defaultCwd: string): Promise<AutomationPackageImportResult>;
	previewAutomationPackage(text: string): Promise<AutomationPackagePreview>;
	discoverAutomationPackages(): Promise<DiscoveredAutomationPackage[]>;
	emitAutomationHostEvent(
		eventName: "automation.panelOpened" | "session.switched",
		context?: { cwd?: string; sessionId?: string; sessionPath?: string },
	): Promise<void>;
}
