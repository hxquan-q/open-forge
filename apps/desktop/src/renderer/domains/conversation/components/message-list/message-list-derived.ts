// Modified by The Open Forge contributors.
import type { ChatTimelineItem } from "@shared/store/atoms";
import type { Usage } from "@vetta/ai/protocol";

/** user 消息（含占位）的模型标注参与模型切换徽标推导。 */
function userItemModel(message: ChatTimelineItem): { readonly provider: string; readonly id: string } | undefined {
	if (message.kind === "user") return message.model;
	if (message.kind === "placeholder" && message.role === "user") return message.model;
	return undefined;
}

/** User-message identity that drives model-switch banners; ignores streaming assistant ticks. */
export function userModelSwitchFingerprint(messages: readonly ChatTimelineItem[]): string {
	const parts: string[] = [];
	for (const message of messages) {
		const model = userItemModel(message);
		if (
			model === undefined &&
			message.kind !== "user" &&
			!(message.kind === "placeholder" && message.role === "user")
		)
			continue;
		parts.push(message.id, model?.provider ?? "", model?.id ?? "");
	}
	return parts.join("\0");
}

export function collectModelSwitchLabels(
	messages: readonly ChatTimelineItem[],
	modelNames: ReadonlyMap<string, string>,
): Map<string, string> {
	const switches = new Map<string, string>();
	let previousKey: string | null = null;
	for (const message of messages) {
		if (message.kind !== "user" && !(message.kind === "placeholder" && message.role === "user")) continue;
		const model = userItemModel(message);
		const key = model ? `${model.provider}/${model.id}` : null;
		if (key && previousKey && key !== previousKey) {
			switches.set(message.id, modelNames.get(key) ?? key);
		}
		if (key) previousKey = key;
	}
	return switches;
}

/** Preserve row memoization when only streamed text or placeholder hydration changed. */
export function collectAgentUsages(
	messages: readonly ChatTimelineItem[],
	previous?: readonly Usage[],
): readonly Usage[] {
	const usages: Usage[] = [];
	for (const message of messages) {
		if (message.kind === "agent" && message.usages) usages.push(...message.usages);
		if (message.kind === "placeholder" && message.role === "assistant" && message.usages)
			usages.push(...message.usages);
	}
	if (previous && previous.length === usages.length && previous.every((usage, index) => usage === usages[index])) {
		return previous;
	}
	return usages;
}
