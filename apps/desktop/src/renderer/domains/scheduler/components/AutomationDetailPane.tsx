// Modified by The Open Forge contributors.
import type { ScheduledTask } from "@shared/store/atoms";
import {
	Button,
	ButtonGroup,
	ButtonGroupItem,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@vetta-org/ui";
import { AutomationDetailPaneView } from "@vetta-org/theme-ui/scheduler";
import { useTranslation } from "react-i18next";
import type { SchedulerTaskDraft } from "./SchedulerTaskFields";
import { SchedulerTaskFields } from "./SchedulerTaskFields";
import { ExecutionHistory } from "./ExecutionHistory";
import { useAutomationDetailModel } from "../hooks/useAutomationDetailModel";

interface AutomationDetailPaneProps {
	readonly task: ScheduledTask | null;
	readonly createInitial?: Partial<SchedulerTaskDraft> | undefined;
	readonly onClose: () => void;
	readonly onCreated?: (task: ScheduledTask) => void;
}

export function AutomationDetailPane({
	task,
	createInitial,
	onClose,
	onCreated,
}: AutomationDetailPaneProps): JSX.Element {
	const { t } = useTranslation("automation");
	const model = useAutomationDetailModel({ task, createInitial, onClose, onCreated });

	return (
		<AutomationDetailPaneView
			statusLabel={model.statusLabel}
			statusTone={model.tone}
			closeLabel={t("detail.close")}
			onClose={model.onDiscard}
			headerActions={
				<>
					{model.mode === "edit" ? (
						<>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={model.onToggleEnabled}
							>
								{model.task?.enabled ? t("detail.pause") : t("detail.enable")}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={model.running}
								onClick={model.onRunNow}
							>
								{t("detail.runNow")}
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<ButtonGroup>
										<ButtonGroupItem
											title={t("detail.more")}
											aria-label={t("detail.more")}
											icon={<span className="icon-[solar--more-linear] size-4" />}
										/>
									</ButtonGroup>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onSelect={model.onDelete}>
										{t("detail.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					) : null}
				</>
			}
			body={
				<SchedulerTaskFields
					value={model.draft}
					onChange={model.onChange}
					namePlaceholder={model.mode === "edit" ? t("detail.namePlaceholderEdit") : t("detail.namePlaceholderNew")}
					showEnabled={false}
					showWorkDirSelector={false}
					promptMinHeight={160}
				/>
			}
			history={model.mode === "edit" && model.task ? <ExecutionHistory taskId={model.task.id} embedded /> : undefined}
			footer={
				<>
					{model.error ? (
						<p className="flex-1 truncate text-[12px] text-destructive">{model.error}</p>
					) : null}
					{model.mode === "edit" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!model.canOpenChat}
							onClick={model.onOpenChat}
						>
							{t("detail.openChat")}
						</Button>
					) : null}
					<Button type="button" variant="ghost" size="sm" onClick={model.onDiscard}>
						{model.mode === "edit" ? t("detail.discard") : t("detail.cancel")}
					</Button>
					<Button
						type="button"
						variant="primary"
						size="sm"
						disabled={!model.canSubmit || model.submitting}
						onClick={model.onSubmit}
					>
						{model.submitting
							? t("detail.saving")
							: model.mode === "edit"
								? t("detail.save")
								: t("detail.create")}
					</Button>
				</>
			}
		/>
	);
}
