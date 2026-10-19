// Copyright The Open Forge contributors.

import type { WeKnoraAgent } from "@preload/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { useTranslation } from "react-i18next";

export interface AgentSelectorProps {
	readonly agents: readonly WeKnoraAgent[];
	readonly selectedAgentId: string | null;
	readonly disabled?: boolean;
	readonly onSelect: (agentId: string) => void;
}

/**
 * 智能体选择器（AC-17）。
 *
 * 列出**全部**可见智能体名称；被禁用的也照常显示、不做任何标记（用户 2026-10-16 裁定）——
 * 选到它时由服务端返回 `stream_error`，走 AC-21⑥ 通道原样展示。
 */
export function AgentSelector({ agents, selectedAgentId, disabled, onSelect }: AgentSelectorProps): JSX.Element {
	const { t } = useTranslation("weknora");

	return (
		<Select value={selectedAgentId ?? ""} onValueChange={onSelect} disabled={disabled}>
			<SelectTrigger aria-label={t("agent.label")} className="w-56">
				<SelectValue placeholder={t("agent.placeholder")} />
			</SelectTrigger>
			<SelectContent>
				{agents.map((agent) => (
					<SelectItem key={agent.id} value={agent.id}>
						{agent.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
