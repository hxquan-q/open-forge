// Copyright The Open Forge contributors.

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Button } from "@vetta-org/ui";
import { useTranslation } from "react-i18next";
import type { WeKnoraExportFormat } from "../services/weknoraExport";

export interface WeKnoraExportFormatDialogProps {
	readonly open: boolean;
	/** 弹窗标题（单会话 / 批量由调用方给不同文案，本组件零硬编码文案，红线 C4）。 */
	readonly title: string;
	readonly onSelect: (format: WeKnoraExportFormat) => void;
	readonly onCancel: () => void;
}

/** 三个格式项：格式值 + 文案 key + solar linear 图标（DESIGN.md 图标节）。 */
const FORMAT_OPTIONS = [
	{ format: "txt", labelKey: "export.formatTxt", iconClassName: "icon-[solar--document-text-linear]" },
	{ format: "md", labelKey: "export.formatMd", iconClassName: "icon-[solar--document-linear]" },
	{ format: "docx", labelKey: "export.formatDocx", iconClassName: "icon-[solar--document-add-linear]" },
] as const;

/**
 * 导出格式选择弹窗（T05 / AC-3）：单会话与批量导出共用的第一步。
 *
 * 纯展示：只把用户选的格式（`txt` / `md` / `docx`）经 `onSelect` 上报，不碰数据与 IPC
 * （导出编排在 `useWeKnoraExport` / `useWeKnoraBatchActions`）。关闭（Esc / 点遮罩 / 「取消」）
 * 一律走 `onCancel`，调用方据此中止流程、零写入。
 */
export function WeKnoraExportFormatDialog({
	open,
	title,
	onSelect,
	onCancel,
}: WeKnoraExportFormatDialogProps): JSX.Element {
	const { t } = useTranslation("weknora");

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onCancel();
			}}
		>
			<DialogContent className="max-w-[360px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{t("export.formatDescription")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					{FORMAT_OPTIONS.map((option) => (
						<Button
							key={option.format}
							className="justify-start"
							onClick={() => onSelect(option.format)}
							type="button"
							variant="outline"
						>
							<span aria-hidden="true" className={`${option.iconClassName} h-3.5 w-3.5 shrink-0`} />
							{t(option.labelKey)}
						</Button>
					))}
				</div>
				<DialogFooter>
					<Button onClick={onCancel} type="button" variant="outline">
						{t("export.cancel")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
