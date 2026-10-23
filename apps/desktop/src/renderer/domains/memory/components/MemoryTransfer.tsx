// Modified by The Open Forge contributors.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@vetta-org/ui";

/**
 * 记忆导入/导出面板（TASK-0378）：展示组件——导入/导出动作由宿主注入
 * （Renderer 不直连主进程模块）；报告如实（新导入/跳过重复/已撤销跳过/
 * 条数），错误不吞，处理中禁用按钮。
 */
export interface MemoryTransferReport {
	readonly imported?: number;
	readonly skippedDuplicates?: number;
	readonly skippedSuppressed?: number;
	readonly exportedCount?: number;
	readonly error?: string;
}

export function MemoryTransfer(props: {
	readonly onImport: () => Promise<MemoryTransferReport>;
	readonly onExport: () => Promise<MemoryTransferReport>;
}) {
	const { t } = useTranslation("memory");
	const [report, setReport] = useState<MemoryTransferReport | null>(null);
	const [busy, setBusy] = useState<"import" | "export" | null>(null);

	const run = async (action: "import" | "export") => {
		setBusy(action);
		setReport(null);
		try {
			setReport(action === "import" ? await props.onImport() : await props.onExport());
		} catch (error) {
			setReport({ error: error instanceof Error ? error.message : String(error) });
		} finally {
			setBusy(null);
		}
	};

	return (
		<section className="space-y-2 rounded-lg border p-4" aria-label={t("transfer.title", "导入 / 导出")}>
			<h2 className="text-sm font-semibold">{t("transfer.title", "导入 / 导出")}</h2>
			<p className="text-xs text-muted-foreground">
				{t("transfer.description", "从旧 MEMORY.md 显式导入（不修改原文件），或导出当前记忆为 Markdown。")}
			</p>
			<div className="flex gap-2">
				<Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("import")}>
					{busy === "import" ? t("transfer.busy", "处理中…") : t("transfer.import", "导入 MEMORY.md")}
				</Button>
				<Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("export")}>
					{busy === "export" ? t("transfer.busy", "处理中…") : t("transfer.export", "导出 Markdown")}
				</Button>
			</div>
			{report === null ? null : (
				<p className="text-xs text-muted-foreground" data-testid="memory-transfer-report">
					{report.error !== undefined
						? report.error
						: t("transfer.report", {
								defaultValue:
									"新导入 {{imported}} · 跳过重复 {{duplicates}} · 已撤销跳过 {{suppressed}} · 已导出 {{exported}}",
								imported: report.imported ?? 0,
								duplicates: report.skippedDuplicates ?? 0,
								suppressed: report.skippedSuppressed ?? 0,
								exported: report.exportedCount ?? 0,
							})}
				</p>
			)}
		</section>
	);
}
