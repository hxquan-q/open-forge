/**
 * Work 文件整理合同（TASK-0018）：分类/批量重命名的可审查执行。
 *
 * 计划先完整展示给用户审阅，确认后才执行；执行按文件产出明确终态，
 * 取消/部分失败保留逐文件结果，重试不重复应用已成功的写入。
 * 路径与授权检查沿用宿主（TASK-0016），Work 模式不构成旁路。
 */

export interface FileOrganizeRenameOperation {
	readonly type: "rename";
	readonly from: string;
	readonly to: string;
	readonly reason?: string;
}

export interface FileOrganizeMoveOperation {
	readonly type: "move";
	readonly from: string;
	readonly to: string;
	readonly reason?: string;
}

export type FileOrganizeOperation = FileOrganizeRenameOperation | FileOrganizeMoveOperation;

export interface FileOrganizePlan {
	readonly operations: readonly FileOrganizeOperation[];
}

/** 单文件终态：不静默跳过、不重复写入。 */
export type FileOrganizeItemStatus =
	| "renamed"
	| "skipped-target-exists"
	| "skipped-source-missing"
	| "failed"
	| "cancelled";

export interface FileOrganizeItemResult {
	readonly from: string;
	readonly to: string;
	readonly status: FileOrganizeItemStatus;
	readonly error?: string;
}

export interface FileOrganizeOutcome {
	readonly confirmed: boolean;
	readonly items: readonly FileOrganizeItemResult[];
}

export const FILE_ORGANIZE_TOOL_NAME = "organize_files";

/** 计划收窄：跨进程/模型输出属不可信输入。 */
export function readFileOrganizePlan(value: unknown): FileOrganizePlan | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const raw = value as Record<string, unknown>;
	if (!Array.isArray(raw.operations) || raw.operations.length === 0) return undefined;
	const operations: FileOrganizeOperation[] = [];
	for (const item of raw.operations) {
		if (typeof item !== "object" || item === null) return undefined;
		const operation = item as Record<string, unknown>;
		if (operation.type !== "rename" && operation.type !== "move") return undefined;
		if (typeof operation.from !== "string" || typeof operation.to !== "string") return undefined;
		if (operation.from.length === 0 || operation.to.length === 0) return undefined;
		if (operation.from === operation.to) return undefined;
		operations.push({
			type: operation.type,
			from: operation.from,
			to: operation.to,
			...(typeof operation.reason === "string" ? { reason: operation.reason } : {}),
		});
	}
	return { operations };
}
