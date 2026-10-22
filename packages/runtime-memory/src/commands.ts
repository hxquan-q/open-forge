// Modified by The Open Forge contributors.

import { MEMORY_CONTRACT_ERROR_CODES, MemoryContractError } from "./errors.js";
import { isMemoryKind, type MemoryRevision, type MemoryValidTime } from "./records.js";
import type { MemorySourceReference } from "./sources.js";

/**
 * 记忆写入/读取命令合同。工具层（coding-agent）与存储层（runtime-node）
 * 共同消费；本模块只校验形状与修订并发规则，不执行 I/O。
 *
 * - remember：新建家族；
 * - correct：追加修订，必须携带 expectedRevision（乐观并发）；
 * - forget：删除整个家族并阻断旧来源重抽取；「撤销更正」是独立操作，
 *   forget 绝不自动恢复 parent 为当前值。
 */

export interface MemoryRememberCommand {
	readonly action: "remember";
	readonly content: string;
	readonly kind: MemoryRevision["kind"];
	readonly scopeName: string;
	readonly validFrom?: MemoryValidTime;
	readonly sources?: readonly MemorySourceReference[];
}

export interface MemoryCorrectCommand {
	readonly action: "correct";
	readonly memoryId: string;
	/** 乐观并发：必须等于家族当前修订号，不符报 REVISION_CONFLICT。 */
	readonly expectedRevision: number;
	readonly content: string;
	readonly validFrom?: MemoryValidTime;
	readonly sources?: readonly MemorySourceReference[];
}

export interface MemoryForcreateCommand {
	readonly action: "forget";
	readonly memoryId: string;
	/** 是否同时处理原始来源（宿主按现有会话/文件删除能力执行）。 */
	readonly alsoProcessSources?: boolean;
}

export type MemoryWriteCommand = MemoryRememberCommand | MemoryCorrectCommand | MemoryForcreateCommand;

export function parseMemoryWriteCommand(value: unknown): MemoryWriteCommand {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "记忆命令必须是对象");
	}
	const record = value as Record<string, unknown>;
	switch (record.action) {
		case "remember": {
			if (typeof record.content !== "string" || record.content.trim() === "") {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"remember.content 必须是非空字符串",
				);
			}
			if (!isMemoryKind(record.kind)) {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					`remember.kind 必须是合法记忆种类，收到：${String(record.kind)}`,
				);
			}
			if (typeof record.scopeName !== "string" || record.scopeName.trim() === "") {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"remember.scopeName 必须是非空字符串",
				);
			}
			return {
				action: "remember",
				content: record.content,
				kind: record.kind,
				scopeName: record.scopeName,
				...(record.validFrom === undefined ? {} : { validFrom: record.validFrom as MemoryValidTime }),
				...(record.sources === undefined ? {} : { sources: record.sources as MemorySourceReference[] }),
			};
		}
		case "correct": {
			if (typeof record.memoryId !== "string" || record.memoryId.trim() === "") {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"correct.memoryId 必须是非空字符串",
				);
			}
			if (
				typeof record.expectedRevision !== "number" ||
				!Number.isInteger(record.expectedRevision) ||
				record.expectedRevision < 0
			) {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"correct.expectedRevision 必须是非负整数",
				);
			}
			if (typeof record.content !== "string" || record.content.trim() === "") {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"correct.content 必须是非空字符串",
				);
			}
			return {
				action: "correct",
				memoryId: record.memoryId,
				expectedRevision: record.expectedRevision,
				content: record.content,
				...(record.validFrom === undefined ? {} : { validFrom: record.validFrom as MemoryValidTime }),
				...(record.sources === undefined ? {} : { sources: record.sources as MemorySourceReference[] }),
			};
		}
		case "forget": {
			if (typeof record.memoryId !== "string" || record.memoryId.trim() === "") {
				throw new MemoryContractError(
					MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
					"forget.memoryId 必须是非空字符串",
				);
			}
			return {
				action: "forget",
				memoryId: record.memoryId,
				...(record.alsoProcessSources === undefined
					? {}
					: { alsoProcessSources: record.alsoProcessSources === true }),
			};
		}
		default:
			throw new MemoryContractError(
				MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT,
				`action 必须是 remember/correct/forget，收到：${String(record.action)}`,
			);
	}
}

/** correct 提交时的并发检查：版本不符返回可解释冲突，不 last-write-wins。 */
export function assertExpectedRevision(expectedRevision: number, currentRevision: number): void {
	if (!Number.isInteger(currentRevision) || currentRevision < 0) {
		throw new MemoryContractError(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_INPUT, "当前修订号非法");
	}
	if (expectedRevision !== currentRevision) {
		throw new MemoryContractError(
			MEMORY_CONTRACT_ERROR_CODES.REVISION_CONFLICT,
			`expectedRevision ${expectedRevision} 与当前修订 ${currentRevision} 不符；请重读后重试`,
		);
	}
}
