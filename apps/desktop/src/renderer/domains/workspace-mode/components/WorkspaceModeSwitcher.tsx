// Copyright The Open Forge contributors.
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import type { WorkspaceMode } from "@shared/store/atoms";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceMode } from "../hooks/useWorkspaceMode";
import { WORKSPACE_MODE_ICON } from "../lib/workspace-session-flow";

/**
 * work/coding 模式切换（IA 定稿 §1）：住在 PageHeader 左簇的项目级偏好。
 * 没有可归属的项目 cwd 时不渲染——一个切了也不生效的控件比没有控件更糟。
 */
export function WorkspaceModeSwitcher(): JSX.Element | null {
	const { t } = useTranslation("chat");
	const { cwd, mode, setMode } = useWorkspaceMode();
	const items = useMemo<readonly SegmentedControlItem<WorkspaceMode>[]>(
		() => [
			{ key: "coding", label: t("workspace.mode.coding"), icon: WORKSPACE_MODE_ICON.coding },
			{ key: "work", label: t("workspace.mode.work"), icon: WORKSPACE_MODE_ICON.work },
		],
		[t],
	);
	if (!cwd) return null;
	const hint = t("workspace.mode.hint");
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<div role="group" aria-label={t("workspace.mode.switch")} title={hint}>
					<SegmentedControl items={[...items]} value={mode} onChange={setMode} />
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6}>
				{hint}
			</TooltipContent>
		</Tooltip>
	);
}
