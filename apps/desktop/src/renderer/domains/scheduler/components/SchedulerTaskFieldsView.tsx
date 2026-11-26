// Modified by The Open Forge contributors.
import { SkillPromptArea } from "@domains/conversation/components/SkillPromptArea";
import { ModelSelect } from "@shared/components/ModelSelect";
import type { ScheduledTaskTrigger } from "@shared/store/atoms";
import type { AutomationMonthDay, AutomationSchedule } from "@/shared/automation";
import { AUTOMATION_INTERVAL_MAX_MINUTES } from "@/shared/automation";
import { Popover, PopoverContent, PopoverTrigger } from "@vetta-org/ui";
import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useSchedulerPermissionTiersModel } from "../hooks/useSchedulerPermissionTiersModel";
import type { SchedulerTaskFieldsModel } from "../hooks/useSchedulerTaskFieldsModel";
import {
	CRON_FIELDS,
	type CronFieldSpec,
	formatCronField,
	pad2,
	parseCronField,
	splitCron,
} from "./schedule-picker/automation-schedule";
import type { SchedulerTaskDraft } from "./SchedulerTaskFields";
import { SchedulerPermissionTiersView } from "./SchedulerPermissionTiersView";

const HOST_EVENTS = [
	"session.created",
	"project.opened",
	"automation.panelOpened",
	"session.switched",
] as const;

function triggerKind(value: SchedulerTaskDraft): "cron" | "event" | "manual" {
	return value.trigger?.type ?? "cron";
}

function triggerLabel(value: SchedulerTaskDraft, t: TFunction<"automation">): string {
	const kind = triggerKind(value);
	if (kind === "manual") return t("trigger.manual");
	if (kind === "event") {
		const event = value.trigger?.type === "event" ? value.trigger.event : "session.created";
		return t(`trigger.events.${event}`);
	}
	return t("trigger.cron");
}

export interface SchedulerTaskFieldsViewProps extends SchedulerTaskFieldsModel {
	readonly promptMinHeight: number;
	readonly showEnabled: boolean;
	readonly showWorkDirSelector: boolean;
	readonly value: SchedulerTaskDraft;
}

export function SchedulerTaskFieldsView({
	defaultExecutionMode,
	executionIcon,
	executionLabel,
	executionMode,
	mode,
	namePlaceholderText,
	promptMinHeight,
	sandboxUnavailableReason,
	schedule,
	scheduleLabel,
	scheduleModes,
	showEnabled,
	showWorkDirSelector,
	value,
	workDirOptions,
	onFieldChange,
	onScheduleChange,
	onScheduleModeChange,
}: SchedulerTaskFieldsViewProps): JSX.Element {
	const { t } = useTranslation("automation");
	const [workDirPopoverOpen, setWorkDirPopoverOpen] = useState(false);
	const [triggerPopoverOpen, setTriggerPopoverOpen] = useState(false);
	const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
	const [executionPopoverOpen, setExecutionPopoverOpen] = useState(false);
	const permissionTiers = useSchedulerPermissionTiersModel(value, onFieldChange);
	const kind = triggerKind(value);

	const setTrigger = (next: ScheduledTaskTrigger): void => {
		onFieldChange("trigger", next);
		setTriggerPopoverOpen(false);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--clock-time-eight-outline] h-4 w-4 text-primary" />
				</div>
				<input
					type="text"
					value={value.name ?? ""}
					onChange={(event) => onFieldChange("name", event.target.value)}
					className="w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none! focus:shadow-none! focus-visible:shadow-none!"
					placeholder={namePlaceholderText}
				/>
			</div>

			<SkillPromptArea
				prompt={value.prompt ?? ""}
				onPromptChange={(prompt) => onFieldChange("prompt", prompt)}
				skill={value.skill ?? null}
				onSkillChange={(skill) => onFieldChange("skill", skill)}
				placeholder={t("form.promptPlaceholder")}
				minHeight={promptMinHeight}
				cwd={value.cwd}
			/>

			<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/30 p-3">
				{showWorkDirSelector && (
					<Popover open={workDirPopoverOpen} onOpenChange={setWorkDirPopoverOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
							>
								<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
								<span className="max-w-[140px] truncate">
									{workDirOptions.find((option) => option.cwd === value.cwd)?.name ?? t("form.selectWorkDir")}
								</span>
								<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
							</button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-56 p-1">
							{workDirOptions.map((option) => (
								<button
									key={option.cwd}
									type="button"
									onClick={() => {
										onFieldChange("cwd", option.cwd);
										setWorkDirPopoverOpen(false);
									}}
									className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
										value.cwd === option.cwd ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className="icon-[mdi--folder-outline] h-3.5 w-3.5" />
									<span className="truncate">{option.name}</span>
								</button>
							))}
						</PopoverContent>
					</Popover>
				)}

				<Popover open={triggerPopoverOpen} onOpenChange={setTriggerPopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--flash-outline] h-3.5 w-3.5" />
							<span className="max-w-[180px] truncate">{triggerLabel(value, t)}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-64 p-1">
						{(
							[
								{ type: "cron" as const, label: t("trigger.cron") },
								{ type: "event" as const, label: t("trigger.event") },
								{ type: "manual" as const, label: t("trigger.manual") },
							] as const
						).map((option) => (
							<button
								key={option.type}
								type="button"
								onClick={() => {
									if (option.type === "cron") setTrigger({ type: "cron" });
									else if (option.type === "manual") setTrigger({ type: "manual" });
									else setTrigger({ type: "event", event: "session.created" });
								}}
								className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
									kind === option.type ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50"
								}`}
							>
								{option.label}
							</button>
						))}
						{kind === "event" ? (
							<div className="mt-1 border-t border-border/40 pt-1">
								{HOST_EVENTS.map((event) => (
									<button
										key={event}
										type="button"
										onClick={() => setTrigger({ type: "event", event })}
										className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
											value.trigger?.type === "event" && value.trigger.event === event
												? "bg-primary/10 text-primary"
												: "text-foreground hover:bg-accent/50"
										}`}
									>
										{t(`trigger.events.${event}`)}
									</button>
								))}
							</div>
						) : null}
					</PopoverContent>
				</Popover>

				{kind === "cron" ? (
				<Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className="icon-[mdi--clock-outline] h-3.5 w-3.5" />
							<span className="max-w-[180px] truncate">{scheduleLabel}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-3">
						<div className="mb-2.5 grid grid-cols-4 gap-1">
							{scheduleModes.map((scheduleMode) => (
								<button
									key={scheduleMode.key}
									type="button"
									onClick={() => onScheduleModeChange(scheduleMode.key)}
									className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
										mode === scheduleMode.key
											? "bg-primary/10 text-primary"
											: "text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground"
									}`}
								>
									{scheduleMode.label}
								</button>
							))}
						</div>
						<KindEditor schedule={schedule} onChange={onScheduleChange} />
					</PopoverContent>
				</Popover>
				) : (
					<span className="flex h-8 items-center rounded-lg border border-border/40 bg-card/20 px-2.5 text-[11px] text-muted-foreground/70">
						{kind === "manual" ? t("trigger.manualHint") : t("trigger.eventHint")}
					</span>
				)}

				<Popover open={executionPopoverOpen} onOpenChange={setExecutionPopoverOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="flex h-8 items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
						>
							<span className={`${executionIcon} h-3.5 w-3.5`} />
							<span className="max-w-[140px] truncate">{executionLabel}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 opacity-60" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-56 p-1">
						{[
							{ value: "inherit" as const, label: t("form.inherit", { mode: defaultExecutionMode === "sandbox" ? t("form.sandbox") : t("form.fullAccess") }), icon: "icon-[mdi--shield-outline]" },
							{ value: "full-access" as const, label: t("form.fullAccess"), icon: "icon-[mdi--shield-check-outline]" },
							{ value: "sandbox" as const, label: t("form.useSandbox"), icon: "icon-[mdi--shield-lock-outline]", disabled: Boolean(sandboxUnavailableReason) },
						].map((option) => {
							const isSelected = executionMode === option.value;
							return (
								<button
									key={option.value}
									type="button"
									disabled={option.disabled}
									title={option.disabled ? sandboxUnavailableReason ?? undefined : undefined}
									onClick={() => {
										onFieldChange("executionMode", option.value);
										setExecutionPopoverOpen(false);
									}}
									className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
										isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className={`${option.icon} h-3.5 w-3.5`} />
									<span className="flex-1 truncate text-left">{option.label}</span>
									{isSelected && <span className="icon-[mdi--check] h-3.5 w-3.5" />}
								</button>
							);
						})}
					</PopoverContent>
				</Popover>

				<ModelSelect
					value={value.modelKey ?? null}
					onChange={(key) => onFieldChange("modelKey", key)}
					placeholder={t("form.modelSelect")}
					triggerClassName="h-8 rounded-lg border-border/50 bg-card/40 px-2.5 text-muted-foreground hover:border-primary/30 hover:bg-card/70 hover:text-foreground"
				/>

				{showEnabled && (
					<button
						type="button"
						onClick={() => onFieldChange("enabled", !(value.enabled ?? true))}
						className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
							value.enabled ?? true
								? "border-primary/30 bg-primary/10 text-primary"
								: "border-border/50 bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground"
						}`}
					>
						<span className={`${value.enabled ?? true ? "icon-[mdi--toggle-switch]" : "icon-[mdi--toggle-switch-off-outline]"} h-3.5 w-3.5`} />
						<span>{value.enabled ?? true ? t("form.enabled") : t("form.disabled")}</span>
					</button>
				)}
			</div>

			<SchedulerPermissionTiersView {...permissionTiers} />
		</div>
	);
}

const editorInputClass =
	// border-transparent 而非 border-none：无效 cron 需要叠 border-destructive 色，border-none 会把边框样式压掉。
	"h-9 rounded-lg border border-transparent bg-muted px-3 text-sm text-foreground focus:outline-none [color-scheme:dark]";

const editorNumberClass =
	"h-9 w-16 rounded-lg border-none bg-muted px-2 text-center text-sm text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function chipClassName(selected: boolean): string {
	return `flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[12px] tabular-nums transition-colors ${
		selected ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground hover:text-foreground"
	}`;
}

/** 弹层内按档位展开的编辑器：直编 v2 判别联合，不再有中间形状。 */
function KindEditor({
	schedule,
	onChange,
}: {
	readonly schedule: AutomationSchedule;
	readonly onChange: (schedule: AutomationSchedule) => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	switch (schedule.kind) {
		case "once": {
			const date = new Date(schedule.at);
			const value = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
			return (
				<input
					type="datetime-local"
					aria-label={t("form.time")}
					value={value}
					onChange={(event) => {
						const next = new Date(event.target.value);
						if (!Number.isNaN(next.getTime())) onChange({ kind: "once", at: next.getTime() });
					}}
					className={editorInputClass}
				/>
			);
		}
		case "hourly":
			return (
				<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
					{t("form.atMinutePrefix")}
					<input
						type="number"
						min={0}
						max={59}
						aria-label={t("form.minuteLabel")}
						value={schedule.minute}
						onChange={(event) => {
							const minute = Number.parseInt(event.target.value, 10);
							if (minute >= 0 && minute <= 59) onChange({ kind: "hourly", minute });
						}}
						className={editorNumberClass}
					/>
					{t("form.atMinuteSuffix")}
				</label>
			);
		case "daily":
			return <TimeEditor hour={schedule.hour} minute={schedule.minute} onChange={(time) => onChange({ ...schedule, ...time })} />;
		case "weekly": {
			const names = t("schedule.weekdayNames", { returnObjects: true }) as string[];
			// 周一在前，符合日常习惯；取值仍是 cron 的 0 = 周日。
			const order = [1, 2, 3, 4, 5, 6, 0];
			return (
				<div className="space-y-2">
					<div role="group" aria-label={t("form.weekdays")} className="flex flex-wrap gap-1">
						{order.map((day) => {
							const selected = schedule.weekdays.includes(day);
							return (
								<button
									key={day}
									type="button"
									aria-pressed={selected}
									onClick={() =>
										onChange({
											...schedule,
											weekdays: selected
												? schedule.weekdays.filter((value) => value !== day)
												: [...schedule.weekdays, day],
										})
									}
									className={chipClassName(selected)}
								>
									{names[day]}
								</button>
							);
						})}
					</div>
					<TimeEditor hour={schedule.hour} minute={schedule.minute} onChange={(time) => onChange({ ...schedule, ...time })} />
				</div>
			);
		}
		case "monthly": {
			const toggle = (day: AutomationMonthDay): void => {
				const selected = schedule.days.includes(day);
				onChange({
					...schedule,
					days: selected ? schedule.days.filter((value) => value !== day) : [...schedule.days, day],
				});
			};
			return (
				<div className="space-y-2">
					<div role="group" aria-label={t("form.monthDays")} className="grid grid-cols-7 gap-1">
						{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
							<button
								key={day}
								type="button"
								aria-pressed={schedule.days.includes(day)}
								onClick={() => toggle(day)}
								className={chipClassName(schedule.days.includes(day))}
							>
								{day}
							</button>
						))}
						<button
							type="button"
							aria-pressed={schedule.days.includes("last")}
							onClick={() => toggle("last")}
							className={`${chipClassName(schedule.days.includes("last"))} col-span-3`}
						>
							{t("schedule.lastDay")}
						</button>
					</div>
					<TimeEditor hour={schedule.hour} minute={schedule.minute} onChange={(time) => onChange({ ...schedule, ...time })} />
					<p className="text-[11px] text-muted-foreground/70">{t("form.monthlyShortMonthHint")}</p>
				</div>
			);
		}
		case "interval":
			return (
				<div>
					<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
						{t("form.intervalPrefix")}
						<input
							type="number"
							min={1}
							max={AUTOMATION_INTERVAL_MAX_MINUTES}
							aria-label={t("form.intervalLabel")}
							value={schedule.everyMinutes}
							onChange={(event) => {
								const everyMinutes = Number.parseInt(event.target.value, 10);
								// 改了间隔就从现在重新起算，下一次在 n 分钟后。
								if (everyMinutes >= 1 && everyMinutes <= AUTOMATION_INTERVAL_MAX_MINUTES) {
									onChange({ kind: "interval", everyMinutes, startAt: Date.now() });
								}
							}}
							className={editorNumberClass}
						/>
						{t("form.intervalSuffix")}
					</label>
					<p className="mt-1.5 text-[11px] text-muted-foreground/70">{t("form.intervalHint")}</p>
				</div>
			);
		case "custom":
			return (
				<div>
					<CustomCronEditor cron={schedule.cron} onChange={(cron) => onChange({ kind: "custom", cron })} />
					<p className="mt-1.5 text-[11px] text-muted-foreground/70">{t("form.cronHint")}</p>
				</div>
			);
	}
}

function TimeEditor({
	hour,
	minute,
	onChange,
}: {
	readonly hour: number;
	readonly minute: number;
	readonly onChange: (time: { hour: number; minute: number }) => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	return (
		<input
			type="time"
			aria-label={t("form.time")}
			value={`${pad2(hour)}:${pad2(minute)}`}
			onChange={(event) => {
				const [nextHour, nextMinute] = event.target.value.split(":").map(Number);
				if (Number.isInteger(nextHour) && Number.isInteger(nextMinute)) {
					onChange({ hour: nextHour, minute: nextMinute });
				}
			}}
			className={editorInputClass}
		/>
	);
}

/** 五段可视化多选与 cron 文本实时互相同步；文本里有可视化表达不了的写法时，对应段只读。 */
function CustomCronEditor({
	cron,
	onChange,
}: {
	readonly cron: string;
	readonly onChange: (cron: string) => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	const [text, setText] = useState(cron);
	useEffect(() => setText(cron), [cron]);
	const fields = splitCron(cron);
	const valid = fields.length === 5;

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1.5">
				{CRON_FIELDS.map((spec, index) => (
					<CronFieldPicker
						key={spec.key}
						spec={spec}
						field={valid ? fields[index] : "*"}
						onChange={(nextField) => {
							const next = valid ? [...fields] : ["*", "*", "*", "*", "*"];
							next[index] = nextField;
							onChange(next.join(" "));
						}}
					/>
				))}
			</div>
			<input
				type="text"
				spellCheck={false}
				aria-label={t("form.cronExpression")}
				value={text}
				onChange={(event) => {
					setText(event.target.value);
					if (splitCron(event.target.value).length === 5) onChange(event.target.value.trim());
				}}
				className={`${editorInputClass} w-full font-mono ${valid ? "" : "border-destructive/60"}`}
				placeholder="0 9 * * 1-5"
			/>
		</div>
	);
}

function CronFieldPicker({
	spec,
	field,
	onChange,
}: {
	readonly spec: CronFieldSpec;
	readonly field: string;
	readonly onChange: (field: string) => void;
}): JSX.Element {
	const { t } = useTranslation("automation");
	const parsed = parseCronField(field, spec);
	const values = Array.from({ length: spec.max - spec.min + 1 }, (_, index) => spec.min + index);
	const names = spec.key === "weekday" ? (t("schedule.weekdayNames", { returnObjects: true }) as string[]) : null;
	const summary = parsed === null ? t("form.cronAny") : field;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={parsed === undefined}
					title={parsed === undefined ? t("form.cronTextOnly") : undefined}
					className="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-60"
				>
					<span>{t(`form.cronField.${spec.key}`)}</span>
					<span className="max-w-[90px] truncate font-mono text-foreground">{summary}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<button
					type="button"
					aria-pressed={parsed === null}
					onClick={() => onChange("*")}
					className={`${chipClassName(parsed === null)} mb-1.5 w-full`}
				>
					{t("form.cronAny")}
				</button>
				<div className={`grid gap-1 ${spec.key === "minute" ? "grid-cols-10" : "grid-cols-7"}`}>
					{values.map((value) => {
						const selected = parsed?.has(value) ?? false;
						return (
							<button
								key={value}
								type="button"
								aria-pressed={selected}
								onClick={() => {
									const next = new Set(parsed ?? []);
									if (selected) next.delete(value);
									else next.add(value);
									onChange(formatCronField(next.size > 0 ? next : null));
								}}
								className={chipClassName(selected)}
							>
								{names ? names[value] : value}
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}

