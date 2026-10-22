// Modified by The Open Forge contributors.
import type { MigrationImportWizardState } from "@shared/store/atoms";
import { migrationImportWizardAtom } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { useAtomValue, useSetAtom } from "jotai";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { MigrationWizardReport } from "../hooks/useMigrationImportWizardModel";
import { useMigrationImportWizardModel } from "../hooks/useMigrationImportWizardModel";

/**
 * 项目迁移向导（ADR-0147）：预览 → 目标选择（现有本地项目 / 新路径）→
 * 冲突策略（默认跳过已有文件）→ 执行 → 结果报告。挂在 RootGlobalOverlays，
 * 由 chat 顶栏「导入会话归档」经 preview 分流打开。
 */
export function MigrationImportWizardDialog(): JSX.Element | null {
	const state = useAtomValue(migrationImportWizardAtom);
	const setWizard = useSetAtom(migrationImportWizardAtom);
	if (!state) return null;
	return (
		<MigrationImportWizardDialogBody
			key={state.preview.archivePath}
			onClose={() => setWizard(null)}
			state={state}
		/>
	);
}

function MigrationImportWizardDialogBody({
	state,
	onClose,
}: {
	state: MigrationImportWizardState;
	onClose: () => void;
}): JSX.Element {
	const model = useMigrationImportWizardModel(state);
	const { t } = useTranslation("project");
	const newInputId = useId();

	return (
		<Dialog open onOpenChange={(open) => !open && !model.applying && onClose()}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[min(560px,calc(100%-2rem))]">
				<DialogHeader>
					<DialogTitle className="text-[15px]">{t("migrationWizard.title")}</DialogTitle>
					<DialogDescription>{t("migrationWizard.description")}</DialogDescription>
				</DialogHeader>

				<div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto px-1">
					{/* 预览摘要：源路径 / 会话数 / 产物数与体量 */}
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-accent/20 px-3 py-2.5 text-[13px]">
						<dt className="text-muted-foreground">{t("migrationWizard.sourcePath")}</dt>
						<dd className="truncate font-mono text-[12px] text-foreground" title={state.preview.sourceCwd ?? ""}>
							{state.preview.sourceCwd ?? t("migrationWizard.sourceUnknown")}
						</dd>
						<dt className="text-muted-foreground">{t("migrationWizard.sessionCount")}</dt>
						<dd className="text-foreground">{t("migrationWizard.count", { count: state.preview.sessionCount })}</dd>
						<dt className="text-muted-foreground">{t("migrationWizard.workspaceFiles")}</dt>
						<dd className="text-foreground">
							{t("migrationWizard.workspaceSummary", {
								count: state.preview.workspaceFileCount,
								size: model.bytesLabel,
							})}
						</dd>
					</dl>

					{model.report ? (
						<MigrationWizardReportView report={model.report} />
					) : (
						<div className="flex flex-col gap-3">
							{/* 目标选择：现有本地项目下拉 */}
							<div className="flex flex-col gap-1.5">
								<span className="text-[12px] text-muted-foreground">{t("migrationWizard.existingTarget")}</span>
								<Select
									value={model.selectedCwd ?? undefined}
									onValueChange={model.selectExisting}
									disabled={model.localProjects.length === 0 || model.applying}
								>
									<SelectTrigger
										id="migration-wizard-existing-target"
										aria-label={t("migrationWizard.existingTarget")}
										className="w-full"
									>
										<SelectValue placeholder={t("migrationWizard.existingTargetPlaceholder")} />
									</SelectTrigger>
									<SelectContent>
										{model.localProjects.map((project) => (
											<SelectItem key={project.cwd} value={project.cwd}>
												{project.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* 目标选择：新路径（优先于下拉选择） */}
							<div className="flex flex-col gap-1.5">
								<label htmlFor={newInputId} className="text-[12px] text-muted-foreground">
									{t("migrationWizard.newPath")}
								</label>
								<div className="flex gap-2">
									<Input
										id={newInputId}
										value={model.newPath}
										placeholder={t("migrationWizard.newPathPlaceholder")}
										disabled={model.applying}
										onChange={(event) => model.setNewPath(event.currentTarget.value)}
										className="font-mono text-[12px]"
									/>
									<Button
										type="button"
										variant="outline"
										disabled={model.applying}
										onClick={() => void model.browse()}
									>
										{t("migrationWizard.browse")}
									</Button>
								</div>
							</div>

							{/* 冲突策略：默认跳过已有文件，复选才覆盖 */}
							<label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
								<input
									type="checkbox"
									checked={model.overwrite}
									disabled={model.applying}
									onChange={(event) => model.setOverwrite(event.currentTarget.checked)}
									className="h-3.5 w-3.5 accent-primary"
								/>
								<span>{t("migrationWizard.overwrite")}</span>
							</label>
							<p className="text-[12px] text-muted-foreground/80">{t("migrationWizard.overwriteHint")}</p>
						</div>
					)}

					{model.error !== null && (
						<div role="alert" className="text-[12px] text-destructive">
							<p>{t("migrationWizard.failed")}</p>
							<p className="mt-1 break-words font-mono">{model.error}</p>
						</div>
					)}
				</div>

				<DialogFooter>
					{model.report ? (
						<Button type="button" onClick={onClose}>
							{t("migrationWizard.done")}
						</Button>
					) : (
						<>
							<Button type="button" variant="outline" disabled={model.applying} onClick={onClose}>
								{t("migrationWizard.cancel")}
							</Button>
							<Button type="button" disabled={!model.canApply} onClick={model.apply}>
								{model.applying ? t("migrationWizard.applying") : t("migrationWizard.apply")}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function MigrationWizardReportView({ report }: { report: MigrationWizardReport }): JSX.Element {
	const { t } = useTranslation("project");
	return (
		<div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px]" role="status">
			<p className="text-foreground">{t("migrationWizard.reportSummary")}</p>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
				<dt className="text-muted-foreground">{t("migrationWizard.reportSessions")}</dt>
				<dd className="text-foreground">
					{t("migrationWizard.reportSessionsValue", {
						imported: report.importedSessions,
						skipped: report.skippedSessions,
					})}
				</dd>
				<dt className="text-muted-foreground">{t("migrationWizard.reportFiles")}</dt>
				<dd className="text-foreground">
					{t("migrationWizard.reportFilesValue", {
						written: report.written,
						skipped: report.skipped,
						overwritten: report.overwritten,
					})}
				</dd>
			</dl>
			{report.failed.length > 0 && (
				// 警告语义：报告内出现无法恢复的文件时用琥珀色提示（DESIGN 语义色表）。
				<div className="text-[12px] text-amber-400">
					<p>{t("migrationWizard.reportFailed")}</p>
					<ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 font-mono">
						{report.failed.map((path) => (
							<li key={path}>{path}</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
