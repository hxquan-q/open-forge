// Copyright The Open Forge contributors.
/**
 * 定时 / 事件 / 手动触发器合同（TASK-0118）。
 * 缺省等同 `{ type: "cron" }`，保持存量任务行为不变。
 */

export const AUTOMATION_HOST_EVENT_NAMES = [
	"session.created",
	"project.opened",
	"automation.panelOpened",
	"session.switched",
] as const;

export type AutomationHostEventName = (typeof AUTOMATION_HOST_EVENT_NAMES)[number];

export type AutomationTriggerType = "cron" | "event" | "manual";

export interface AutomationTaskTriggerCron {
	readonly type: "cron";
}

export interface AutomationTaskTriggerEvent {
	readonly type: "event";
	readonly event: AutomationHostEventName;
}

export interface AutomationTaskTriggerManual {
	readonly type: "manual";
}

export type AutomationTaskTrigger =
	| AutomationTaskTriggerCron
	| AutomationTaskTriggerEvent
	| AutomationTaskTriggerManual;

export function isAutomationHostEventName(value: unknown): value is AutomationHostEventName {
	return typeof value === "string" && (AUTOMATION_HOST_EVENT_NAMES as readonly string[]).includes(value);
}

/** 归一化：非法结构返回 undefined；缺省 / cron 空对象 → `{ type: "cron" }`。 */
export function normalizeAutomationTaskTrigger(value: unknown): AutomationTaskTrigger | undefined {
	if (value === undefined || value === null) return { type: "cron" };
	if (typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (record.type === "cron") {
		if (Object.keys(record).some((key) => key !== "type")) return undefined;
		return { type: "cron" };
	}
	if (record.type === "manual") {
		if (Object.keys(record).some((key) => key !== "type")) return undefined;
		return { type: "manual" };
	}
	if (record.type === "event") {
		if (!isAutomationHostEventName(record.event)) return undefined;
		const extra = Object.keys(record).filter((key) => key !== "type" && key !== "event");
		if (extra.length > 0) return undefined;
		return { type: "event", event: record.event };
	}
	return undefined;
}

export function resolveAutomationTaskTrigger(value: AutomationTaskTrigger | undefined): AutomationTaskTrigger {
	return value ?? { type: "cron" };
}

export function isCronTriggered(trigger: AutomationTaskTrigger | undefined): boolean {
	return resolveAutomationTaskTrigger(trigger).type === "cron";
}
