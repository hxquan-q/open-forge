// Modified by The Open Forge contributors.

import type { SessionExecutionMode } from "@shared/store/atoms";
import { defaultConversationCwdAtom, getProjectDisplayName, projectsAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutomationSchedule, AutomationScheduleKind } from "@/shared/automation";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";
import { defaultScheduleFor, SCHEDULE_KINDS } from "../components/schedule-picker/automation-schedule";
import { describeSchedule } from "../components/schedule-picker/cron-utils";

export interface WorkDirOption {
	readonly cwd: string;
	readonly name: string;
}

export interface ScheduleModeOption {
	readonly key: AutomationScheduleKind;
	readonly label: string;
}

export interface SchedulerTaskFieldsModel {
	readonly defaultExecutionMode: SessionExecutionMode;
	readonly executionIcon: string;
	readonly executionLabel: string;
	readonly executionMode: SchedulerTaskDraft["executionMode"] | "inherit";
	readonly mode: AutomationScheduleKind;
	readonly namePlaceholderText: string;
	readonly sandboxUnavailableReason: string | null;
	readonly schedule: AutomationSchedule;
	readonly scheduleLabel: string;
	readonly scheduleModes: readonly ScheduleModeOption[];
	readonly workDirOptions: readonly WorkDirOption[];
	readonly onFieldChange: <Key extends keyof SchedulerTaskDraft>(key: Key, nextValue: SchedulerTaskDraft[Key]) => void;
	readonly onScheduleChange: (nextSchedule: AutomationSchedule) => void;
	readonly onScheduleModeChange: (kind: AutomationScheduleKind) => void;
}

interface UseSchedulerTaskFieldsModelOptions {
	readonly namePlaceholder: string | undefined;
	readonly onChange: (value: SchedulerTaskDraft) => void;
	readonly value: SchedulerTaskDraft;
}

/**
 * 编辑器直编 v2 判别联合（ADR-0155）：表单状态就是草稿的 schedule，
 * 不再经中间形状换算——hourly/monthly/custom/非整小时间隔也能按原档位编辑，
 * 不再落回「每天 9:00」毁损原计划。cron 触发下 schedule 缺省（新建的初稿）按每天默认展示。
 */
export function useSchedulerTaskFieldsModel({
	namePlaceholder,
	onChange,
	value,
}: UseSchedulerTaskFieldsModelOptions): SchedulerTaskFieldsModel {
	const { t } = useTranslation("automation");
	const projects = useAtomValue(projectsAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const projectName = useCallback((cwd: string) => getProjectDisplayName(cwd, defaultCwd), [defaultCwd]);
	const [defaultExecutionMode, setDefaultExecutionMode] = useState<SessionExecutionMode>("full-access");
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			setDefaultExecutionMode(config.defaultExecutionMode ?? "full-access");
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(t("form.sandboxUnavailable", { platform, reason }));
				return;
			}
			setSandboxUnavailableReason(null);
		});
	}, [t]);

	const workDirOptions = useMemo(() => {
		const seen = new Set<string>();
		const options: WorkDirOption[] = [];
		const add = (cwd: string | undefined, name?: string): void => {
			if (!cwd || seen.has(cwd)) return;
			seen.add(cwd);
			options.push({ cwd, name: name ?? projectName(cwd) });
		};
		add(defaultCwd, t("form.conversation"));
		add(value.cwd);
		for (const project of projects) add(project.cwd, project.name);
		return options;
	}, [defaultCwd, projects, projectName, value.cwd, t]);

	return useMemo(() => {
		const schedule = value.schedule ?? defaultScheduleFor("daily", Date.now());
		const executionMode = value.executionMode ?? "inherit";

		return {
			defaultExecutionMode,
			executionIcon:
				executionMode === "sandbox"
					? "icon-[mdi--shield-lock-outline]"
					: executionMode === "full-access"
						? "icon-[mdi--shield-check-outline]"
						: "icon-[mdi--shield-outline]",
			executionLabel:
				executionMode === "sandbox"
					? t("form.useSandbox")
					: executionMode === "full-access"
						? t("form.fullAccess")
						: t("form.inherit", {
								mode: defaultExecutionMode === "sandbox" ? t("form.sandbox") : t("form.fullAccess"),
							}),
			executionMode,
			mode: schedule.kind,
			namePlaceholderText: namePlaceholder ?? t("form.namePlaceholder"),
			sandboxUnavailableReason,
			schedule,
			scheduleLabel: describeSchedule(schedule, t),
			scheduleModes: SCHEDULE_KINDS.map((kind) => ({ key: kind, label: t(`scheduleMode.${kind}`) })),
			workDirOptions,
			onFieldChange: <Key extends keyof SchedulerTaskDraft>(key: Key, nextValue: SchedulerTaskDraft[Key]): void => {
				onChange({ ...value, [key]: nextValue });
			},
			onScheduleChange: (nextSchedule: AutomationSchedule): void => {
				onChange({ ...value, schedule: nextSchedule });
			},
			onScheduleModeChange: (kind: AutomationScheduleKind): void => {
				if (kind === schedule.kind) return;
				onChange({ ...value, schedule: defaultScheduleFor(kind, Date.now(), schedule) });
			},
		};
	}, [defaultExecutionMode, namePlaceholder, onChange, sandboxUnavailableReason, t, value, workDirOptions]);
}
