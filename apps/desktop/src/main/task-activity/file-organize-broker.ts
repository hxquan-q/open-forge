import { rename, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type {
	CodingAgentFileOrganizeFunctionRequest,
	FileOrganizeItemResult,
	FileOrganizeOutcome,
} from "@vetta/coding-agent/function-extensions";
import type { ActionApprovalBroker } from "../app-actions/approval-broker.js";
import { readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { getSharedRuntime } from "../runtime.js";

const log = getAppLogger("file-organize");

const FILE_ORGANIZE_PRESENTATION = "agent.file-organize";

/** 渲染层生命周期与文件整理执行端口之间的可重绑路由（同 sandbox 授权 broker 模式）。 */
export class DesktopFileOrganizeBroker {
	private actionApprovals: ActionApprovalBroker | undefined;

	bindActionApprovalBroker(broker: ActionApprovalBroker): void {
		this.actionApprovals = broker;
	}

	readonly handle = async (
		request: CodingAgentFileOrganizeFunctionRequest,
		signal?: AbortSignal,
	): Promise<FileOrganizeOutcome> => {
		try {
			return await this.organize(request, signal);
		} catch (error) {
			log.warn(`file organize failed: ${error instanceof Error ? error.message : String(error)}`);
			return { confirmed: false, items: [] };
		}
	};

	private async organize(
		request: CodingAgentFileOrganizeFunctionRequest,
		signal: AbortSignal | undefined,
	): Promise<FileOrganizeOutcome> {
		const cwd = await this.sessionCwd(request.sessionId);
		if (!cwd) return { confirmed: false, items: [] };

		// 相对路径落到项目根；任何越出项目根的源/目标一律拒绝执行。
		const resolved = request.plan.operations.map((operation) => ({
			operation,
			from: safeJoin(cwd, operation.from),
			to: safeJoin(cwd, operation.to),
		}));
		if (resolved.some((item) => !item.from || !item.to)) {
			return { confirmed: false, items: [] };
		}

		const broker = this.actionApprovals;
		if (!broker) return { confirmed: false, items: [] };
		const decision = await broker.request(
			{
				actionId: `file-organize:${request.turnId}:${request.plan.operations.length}`,
				approvalPresentation: FILE_ORGANIZE_PRESENTATION,
				input: {
					operations: request.plan.operations.map((operation) => ({
						type: operation.type,
						from: operation.from,
						to: operation.to,
						...(operation.reason ? { reason: operation.reason } : {}),
					})),
				},
				title: mainT("fileOrganize.title"),
				summary: mainT("fileOrganize.summary", { count: request.plan.operations.length }),
				permission: "fs:batch-rename",
			},
			signal,
		);
		if (!decision.approved) return { confirmed: false, items: [] };

		const items: FileOrganizeItemResult[] = [];
		for (const entry of resolved) {
			if (signal?.aborted) {
				items.push({ from: entry.operation.from, to: entry.operation.to, status: "cancelled" });
				continue;
			}
			items.push(
				await applyOperation(entry.from as string, entry.to as string, entry.operation.from, entry.operation.to),
			);
		}
		return { confirmed: true, items };
	}

	private async sessionCwd(sessionId: string): Promise<string | undefined> {
		const sessionPath = getSharedRuntime().getSessionPath(sessionId);
		if (!sessionPath) return undefined;
		return readSessionCwdFromHeader(sessionPath);
	}
}

/** 目标必须仍在项目根内，且不允许把文件移出项目。 */
export function safeJoin(cwd: string, path: string): string | undefined {
	const resolved = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
	const relativePath = relative(cwd, resolved);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
	return resolved;
}

export async function applyOperation(
	fromPath: string,
	toPath: string,
	fromLabel: string,
	toLabel: string,
): Promise<FileOrganizeItemResult> {
	try {
		await stat(fromPath);
	} catch {
		return { from: fromLabel, to: toLabel, status: "skipped-source-missing" };
	}
	try {
		await stat(toPath);
		return { from: fromLabel, to: toLabel, status: "skipped-target-exists" };
	} catch {
		// 目标不存在才继续；重试时已成功的项会落到 skipped-target-exists/source-missing。
	}
	try {
		await rename(fromPath, toPath);
		return { from: fromLabel, to: toLabel, status: "renamed" };
	} catch (error) {
		return {
			from: fromLabel,
			to: toLabel,
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

const sharedFileOrganizeBroker = new DesktopFileOrganizeBroker();

export function getDesktopFileOrganizeBroker(): DesktopFileOrganizeBroker {
	return sharedFileOrganizeBroker;
}
