// Copyright The Open Forge contributors.
import { Button } from "@vetta-org/ui";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { showToast } from "@shared/store/toast-atoms";
import { useAtomValue } from "jotai";
import { defaultConversationCwdAtom, projectsAtom, selectedTaskIdAtom, scheduledTasksAtom } from "@shared/store/atoms";
import { useScheduledTasks } from "../hooks/useScheduledTasks";
import { AutomationDiscoverDialog } from "./AutomationDiscoverDialog";

export function AutomationPackageActions(): JSX.Element {
	const { t } = useTranslation("automation");
	const selectedTaskId = useAtomValue(selectedTaskIdAtom);
	const tasks = useAtomValue(scheduledTasksAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const projects = useAtomValue(projectsAtom);
	const { refreshTasks } = useScheduledTasks();
	const [discoverOpen, setDiscoverOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	const resolveCwd = useCallback((): string => {
		return defaultCwd ?? projects[0]?.cwd ?? "";
	}, [defaultCwd, projects]);

	const handleExport = useCallback(async () => {
		const ids = selectedTaskId ? [selectedTaskId] : tasks.map((task) => task.id);
		if (ids.length === 0) {
			showToast({ variant: "warning", message: t("package.exportEmpty") });
			return;
		}
		setBusy(true);
		try {
			const result = await window.vetta.scheduler.exportAutomationPackages(ids);
			if (result.status === "exported") {
				showToast({ variant: "success", message: t("package.exportSuccess") });
			}
		} catch {
			showToast({ variant: "error", message: t("package.exportFailed") });
		} finally {
			setBusy(false);
		}
	}, [selectedTaskId, t, tasks]);

	const handleImport = useCallback(async () => {
		const cwd = resolveCwd();
		if (!cwd) {
			showToast({ variant: "warning", message: t("package.needWorkspace") });
			return;
		}
		setBusy(true);
		try {
			const result = await window.vetta.scheduler.importAutomationPackage(cwd);
			if (result.status === "imported") {
				await refreshTasks();
				showToast({
					variant: "success",
					message: t("package.importDisabled", { id: result.taskId }),
				});
			} else if (result.status === "rejected") {
				showToast({
					variant: "error",
					message: t("package.importRejected", { reasons: result.reasons.join("; ") }),
				});
			}
		} catch {
			showToast({ variant: "error", message: t("package.importFailed") });
		} finally {
			setBusy(false);
		}
	}, [refreshTasks, resolveCwd, t]);

	return (
		<>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => void handleImport()}
					title={t("package.importTitle")}
				>
					{t("package.import")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => void handleExport()}
					title={t("package.exportTitle")}
				>
					{t("package.export")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => setDiscoverOpen(true)}
					title={t("package.discoverTitle")}
				>
					{t("package.discover")}
				</Button>
			</div>
			<AutomationDiscoverDialog
				open={discoverOpen}
				defaultCwd={resolveCwd()}
				onClose={() => setDiscoverOpen(false)}
				onImported={async () => {
					await refreshTasks();
					setDiscoverOpen(false);
				}}
			/>
		</>
	);
}
