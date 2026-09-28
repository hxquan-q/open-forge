// Copyright The Open Forge contributors.
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import { perfSendBegin } from "@shared/lib/perf-send";
import type { WorkspaceMode } from "@shared/store/atoms";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceMode } from "../hooks/useWorkspaceMode";
import { WORKSPACE_MODE_ICON } from "../lib/workspace-session-flow";

/**
 * work/coding 模式切换（IA 定稿 §1）：住在 PageHeader 左簇的项目级偏好。
 * 没有可归属的项目 cwd 时不渲染——一个切了也不生效的控件比没有控件更糟。
 *
 * `cwdOverride` 给「生效的 cwd 不是路由 cwd」的宿主用：新会话页的模式归属性按待创建
 * 会话的 cwd（选中项目时是项目路径），若这里仍按路由 cwd 读写，控件高亮会与只读确认句、
 * 实际开口径分叉，用户切了也不生效（BUG-0037）。
 */
export function WorkspaceModeSwitcher({
	cwdOverride,
}: {
	readonly cwdOverride?: string | null;
} = {}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const { cwd, mode, setMode } = useWorkspaceMode(cwdOverride);
	const items = useMemo<readonly SegmentedControlItem<WorkspaceMode>[]>(
		() => [
			{ key: "coding", label: t("workspace.mode.coding"), icon: WORKSPACE_MODE_ICON.coding },
			{ key: "work", label: t("workspace.mode.work"), icon: WORKSPACE_MODE_ICON.work },
		],
		[t],
	);
	/**
	 * 用户体感的「切换响应」是点击到右栏换完这一段，与发送链路同一套探针口径量：
	 * 窗口必须在 setMode 之前打开，否则被测的那次提交已经跑完，marks / commits 全是空的。
	 */
	const handleChange = useCallback(
		(next: WorkspaceMode) => {
			perfSendBegin("workspace-mode-switch");
			setMode(next);
		},
		[setMode],
	);
	if (!cwd) return null;
	const hint = t("workspace.mode.hint");
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<div role="group" aria-label={t("workspace.mode.switch")}>
					<SegmentedControl items={[...items]} value={mode} onChange={handleChange} />
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6}>
				{hint}
			</TooltipContent>
		</Tooltip>
	);
}
