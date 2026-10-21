// Copyright The Open Forge contributors.

import { i18n } from "@shared/i18n";
import { showToast } from "@shared/store/toast-atoms";
import { useCallback, useState } from "react";
import { exportFileName, loadAllMessages, serializeExport, type WeKnoraExportFormat } from "../services/weknoraExport";

/** 单会话导出的对外动作（T05 / AC-3）。 */
export interface WeKnoraExportActions {
	/** 导出进行中（防重复点击：导出中禁住入口）。 */
	readonly exporting: boolean;
	/**
	 * 单会话导出（AC-3）：拉全量 → 序列化 → 系统保存对话框（主进程缺省目录 = 桌面）→ 写出。
	 * 用户在保存对话框取消时**零写入**、无反馈；失败不静默（出错误 toast）。
	 */
	readonly exportSession: (sessionId: string, format: WeKnoraExportFormat) => Promise<void>;
}

/**
 * 单会话导出编排（T05）。
 *
 * 数据面复用既有合同：`loadAllMessages`（分页拉全，D7）走 `window.vetta.weknora.loadMessages`，
 * 落盘走既有 `window.vetta.dialog.saveData`（C8：不建第二套事实源）。**默认目录 = 桌面**由主进程
 * `save-data` 的缺省行为落实（T03），渲染层不持有桌面路径、不额外传 `defaultDirectory`。
 *
 * 失败反馈走全局 toast（用户可见文案全走 i18n，红线 C4）；`showToast` 是命令式入口，
 * 非组件环境用 `i18n.t` 解析文案（AGENTS.md §7）。
 */
export function useWeKnoraExport(input: { titleOf: (sessionId: string) => string }): WeKnoraExportActions {
	const { titleOf } = input;
	const [exporting, setExporting] = useState(false);

	const exportSession = useCallback(
		async (sessionId: string, format: WeKnoraExportFormat): Promise<void> => {
			setExporting(true);
			try {
				// 先拉全量再弹保存框：save-data 需要一次拿到完整内容，故顺序不可颠倒。
				const messages = await loadAllMessages(sessionId);
				const payload = await serializeExport(messages, format);
				const saved = await window.vetta.dialog.saveData(
					exportFileName(titleOf(sessionId), format),
					payload.content,
					payload.encoding,
					{ title: i18n.t("weknora:export.saveTitle") },
				);
				// 取消：不写盘、不打扰（与「取消零写入」一致）。
				if (saved === null) return;
				showToast({ message: i18n.t("weknora:export.singleSuccess"), variant: "success" });
			} catch {
				// 拉取 / 序列化 / 写盘任一失败都要可见（不静默）。
				showToast({ message: i18n.t("weknora:export.singleFailed"), variant: "error" });
			} finally {
				setExporting(false);
			}
		},
		[titleOf],
	);

	return { exporting, exportSession };
}
