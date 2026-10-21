// Copyright The Open Forge contributors.

import type { DialogWriteFileEntry } from "@preload/api";
import { useCallback, useState } from "react";
import type { WeKnoraErrorCode } from "../atoms";
import { exportFileNames, loadAllMessages, serializeExport, type WeKnoraExportFormat } from "../services/weknoraExport";
import type { WeKnoraSessionRemoval } from "./useWeKnoraHistory";
import { errorCodeOf } from "./weKnoraModelSupport";

/** 批量删除里单个会话的失败明细（D5：名 + 错误由调用方按 id 补全）。 */
export interface WeKnoraBatchDeleteFailure {
	readonly sessionId: string;
	readonly errorCode: WeKnoraErrorCode;
}

/** 批量删除的聚合结果（D5：部分失败如实报，绝不假装成功）。 */
export interface WeKnoraBatchDeleteResult {
	readonly succeeded: readonly string[];
	readonly failed: readonly WeKnoraBatchDeleteFailure[];
}

/** 批量导出里单个会话的失败明细（AC-9 / D5：失败绝不静默，逐会话给原因）。 */
export interface WeKnoraBatchExportFailure {
	readonly sessionId: string;
	/** 失败阶段：`load` = 拉取 / 序列化；`write` = 写盘。 */
	readonly kind: "load" | "write";
	/** `load` 失败的归一化错误码；`write` 失败为 `null`（走通用写盘失败文案）。 */
	readonly errorCode: WeKnoraErrorCode | null;
}

/** 批量导出的聚合结果（AC-9：成功 N / 失败 M 明细）。 */
export interface WeKnoraBatchExportResult {
	readonly succeeded: readonly string[];
	readonly failed: readonly WeKnoraBatchExportFailure[];
}

export interface WeKnoraBatchActions {
	/** 批量删除进行中（驱动确认按钮防重复）。 */
	readonly running: boolean;
	/** 批量导出进行中（驱动操作条按钮防重复；含目录选择阶段）。 */
	readonly exportRunning: boolean;
	/** 逐个调用删除原语，聚合成功 / 失败明细（D5）。 */
	readonly deleteSessions: (sessionIds: readonly string[]) => Promise<WeKnoraBatchDeleteResult>;
	/**
	 * 批量导出（AC-9）：选目录（**同会话内**，取消返回 `null`、零写入）→ 逐会话拉全量 + 序列化 →
	 * 一次性批量写盘 → 聚合「成功 N / 失败 M（明细）」。
	 */
	readonly exportSessions: (
		sessionIds: readonly string[],
		format: WeKnoraExportFormat,
	) => Promise<WeKnoraBatchExportResult | null>;
}

/** 路径末段（写盘返回的是绝对路径，用文件名回映射到会话）。 */
function baseNameOf(path: string): string {
	const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return index >= 0 ? path.slice(index + 1) : path;
}

/** 逐会话已序列化、待写盘的文件（`utf8` / `base64` 恰好其一）。 */
interface PendingExportFile {
	readonly sessionId: string;
	readonly name: string;
	readonly entry: DialogWriteFileEntry;
}

/**
 * 历史会话的批量动作编排（T04 批量删除 + T05 批量导出）。
 *
 * 批量删除复用 `removeSession` 逐会话原语**串行**循环——不并发（避免同一时刻多条删除把
 * `deletingSessionId` / `deleteError` 反复覆写），不乐观改列表；每个会话的结果聚合成
 * 「成功 N / 失败 M（会话 id + 错误码）」，失败绝不静默（D5）。
 *
 * 批量导出同理**串行**拉取（逐会话 `loadAllMessages` → 序列化），再一次性
 * `write-files-to-directory` 落盘；**目录须在本次会话内经 `select-directory` 选定**
 * （主进程白名单重启清空，不依赖跨会话记忆）。写盘结果按文件名回映射到会话，
 * 与拉取阶段的失败合并成同一份「成功 / 失败明细」。
 *
 * 「当前会话回空态」与「列表重拉」属跨 actor 编排，留在组装层（`useWeKnoraModel`）；
 * 单会话导出属另一 actor，见 `useWeKnoraExport`。
 */
export function useWeKnoraBatchActions(input: {
	removeSession: (sessionId: string) => Promise<WeKnoraSessionRemoval>;
	/** 会话 id → 标题（文件名基名用；空标题由 `safeFileName` 回退「未命名会话」）。 */
	titleOf: (sessionId: string) => string;
}): WeKnoraBatchActions {
	const { removeSession, titleOf } = input;
	const [running, setRunning] = useState(false);
	const [exportRunning, setExportRunning] = useState(false);

	const deleteSessions = useCallback(
		async (sessionIds: readonly string[]): Promise<WeKnoraBatchDeleteResult> => {
			setRunning(true);
			const succeeded: string[] = [];
			const failed: WeKnoraBatchDeleteFailure[] = [];
			try {
				for (const sessionId of sessionIds) {
					const outcome = await removeSession(sessionId);
					if (outcome.ok) succeeded.push(sessionId);
					else failed.push({ sessionId, errorCode: outcome.errorCode ?? "unknown" });
				}
			} finally {
				setRunning(false);
			}
			return { succeeded, failed };
		},
		[removeSession],
	);

	const exportSessions = useCallback(
		async (sessionIds: readonly string[], format: WeKnoraExportFormat): Promise<WeKnoraBatchExportResult | null> => {
			setExportRunning(true);
			try {
				// 目录必须在**本次会话内**由用户选定（主进程白名单重启清空）；取消即零写入。
				const directory = await window.vetta.dialog.selectDirectory();
				if (directory === null) return null;

				// 文件名按标题净化 + 批内去重（AC-7）；下标与会话一一对应。
				const fileNames = exportFileNames(
					sessionIds.map((sessionId) => titleOf(sessionId)),
					format,
				);
				const pending: PendingExportFile[] = [];
				const failed: WeKnoraBatchExportFailure[] = [];
				for (let index = 0; index < sessionIds.length; index += 1) {
					const sessionId = sessionIds[index];
					const name = fileNames[index];
					if (sessionId === undefined || name === undefined) continue;
					try {
						const messages = await loadAllMessages(sessionId);
						const payload = await serializeExport(messages, format);
						const entry: DialogWriteFileEntry =
							payload.encoding === "base64"
								? { name, base64: payload.content }
								: { name, utf8: payload.content };
						pending.push({ sessionId, name, entry });
					} catch (error) {
						// 拉取 / 序列化失败：记入明细，不中断整批（D5）。
						failed.push({ sessionId, kind: "load", errorCode: errorCodeOf(error) });
					}
				}

				if (pending.length === 0) return { succeeded: [], failed };

				const writeResult = await window.vetta.dialog.writeFilesToDirectory({
					directory,
					files: pending.map((file) => file.entry),
				});

				// 写盘结果按文件名回映射到会话（批内名字唯一，可安全回查）。
				const sessionByFileName = new Map(pending.map((file) => [file.name, file.sessionId]));
				const succeeded: string[] = [];
				for (const path of writeResult.written) {
					const sessionId = sessionByFileName.get(baseNameOf(path));
					if (sessionId !== undefined) succeeded.push(sessionId);
				}
				for (const entry of writeResult.failed) {
					const sessionId = sessionByFileName.get(entry.name);
					if (sessionId !== undefined) failed.push({ sessionId, kind: "write", errorCode: null });
				}
				return { succeeded, failed };
			} finally {
				setExportRunning(false);
			}
		},
		[titleOf],
	);

	return { running, exportRunning, deleteSessions, exportSessions };
}
