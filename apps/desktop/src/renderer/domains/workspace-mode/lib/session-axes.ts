// Copyright The Open Forge contributors.
import type { WorkspaceMode } from "@shared/store/atoms";

export type SessionAxis = "work" | "coding";

export interface DerivedSessionAxes {
	readonly agentMode: SessionAxis;
	readonly capabilityProfile: SessionAxis;
}

/** 页头工作区选择在创建会话时同时派生解释模式与工具集，不把三轴拆开给用户。 */
export function deriveSessionAxesFromWorkspaceMode(mode: WorkspaceMode): DerivedSessionAxes {
	return mode === "work"
		? { agentMode: "work", capabilityProfile: "work" }
		: { agentMode: "coding", capabilityProfile: "coding" };
}

export function formatSessionAxesBadge(input: {
	readonly agentMode?: string;
	readonly capabilityProfile?: string;
	readonly interpretation: string;
	readonly profile: string;
	readonly template: string;
}): string | null {
	if (!input.agentMode && !input.capabilityProfile) return null;
	return input.template.replace("{{interpretation}}", input.interpretation).replace("{{profile}}", input.profile);
}
