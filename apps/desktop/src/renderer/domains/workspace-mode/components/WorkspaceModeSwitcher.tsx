// Copyright The Open Forge contributors.
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import type { WorkspaceMode } from "@shared/store/atoms";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceMode } from "../hooks/useWorkspaceMode";

/**
 * work/coding 模式切换（IA 定稿 §1）：住在 PageHeader 左簇的项目级偏好。
 * 没有可归属的项目 cwd 时不渲染——一个切了也不生效的控件比没有控件更糟。
 */
export function WorkspaceModeSwitcher(): JSX.Element | null {
	const { t } = useTranslation("chat");
	const { cwd, mode, setMode } = useWorkspaceMode();
	const items = useMemo<readonly SegmentedControlItem<WorkspaceMode>[]>(
		() => [
			{ key: "coding", label: t("workspace.mode.coding"), icon: "icon-[solar--code-linear]" },
			{ key: "work", label: t("workspace.mode.work"), icon: "icon-[solar--case-linear]" },
		],
		[t],
	);
	if (!cwd) return null;
	return (
		<div role="group" aria-label={t("workspace.mode.switch")}>
			<SegmentedControl items={[...items]} value={mode} onChange={setMode} />
		</div>
	);
}
