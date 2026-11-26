// Modified by The Open Forge contributors.
import type {
	ExecutionModeOverride,
	AutomationSchedule,
	ScheduledTaskPermissionTiers,
	ScheduledTaskTrigger,
	SelectedSkill,
} from "@shared/store/atoms";
import { useSchedulerTaskFieldsModel } from "../hooks/useSchedulerTaskFieldsModel";
import { SchedulerTaskFieldsView } from "./SchedulerTaskFieldsView";

export interface SchedulerTaskDraft {
	name?: string;
	prompt?: string;
	/** v2 调度判别联合（ADR-0155）；event / manual 触发的任务不带计划。 */
	schedule?: AutomationSchedule;
	enabled?: boolean;
	cwd?: string;
	/** 新建时的运行策略；same-session 绑定既有会话（编辑态沿用任务自身 runTarget，不走这里）。 */
	runMode?: "new-session" | "same-session";
	sessionPath?: string;
	modelKey?: string | null;
	executionMode?: ExecutionModeOverride;
	skill?: SelectedSkill | null;
	permissionTiers?: ScheduledTaskPermissionTiers;
	trigger?: ScheduledTaskTrigger;
}

interface SchedulerTaskFieldsProps {
	value: SchedulerTaskDraft;
	onChange: (value: SchedulerTaskDraft) => void;
	namePlaceholder?: string;
	showEnabled?: boolean;
	showWorkDirSelector?: boolean;
	promptMinHeight?: number;
}

export function SchedulerTaskFields({
	value,
	onChange,
	namePlaceholder,
	showEnabled = false,
	showWorkDirSelector = true,
	promptMinHeight = 140,
}: SchedulerTaskFieldsProps): JSX.Element {
	return (
		<SchedulerTaskFieldsView
			{...useSchedulerTaskFieldsModel({ namePlaceholder, onChange, value })}
			value={value}
			showEnabled={showEnabled}
			showWorkDirSelector={showWorkDirSelector}
			promptMinHeight={promptMinHeight}
		/>
	);
}
