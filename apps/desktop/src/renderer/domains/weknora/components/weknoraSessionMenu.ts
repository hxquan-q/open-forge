// Copyright The Open Forge contributors.

import type { WeKnoraSessionMenuItem } from "./WeKnoraSessionContextMenu";

/**
 * 右键会话菜单的项生成（02-plan D6 的 `buildSessionMenuItems`）。
 *
 * 从 `ConversationList` 抽出的纯函数：只描述「有哪些项、点它们做什么」，不碰组件状态与
 * 定位/关闭行为（那归 `WeKnoraSessionContextMenu`）。文案由调用方经 `labels` 解析后注入，
 * 本模块零硬编码文案（红线 C4）。
 */
export interface WeKnoraSessionMenuLabels {
	/** 「删除会话」项文案；禁删时调用方已换成原因文案（如「回答生成中…」）。 */
	readonly delete: string;
	/** 「多选」项文案。 */
	readonly multiSelect: string;
	/** 「导出会话」项文案。 */
	readonly export: string;
}

export interface WeKnoraSessionMenuInput {
	readonly labels: WeKnoraSessionMenuLabels;
	/** 目标会话是否禁删（streaming 中，AC-10）。 */
	readonly deleteDisabled: boolean;
	/** 「导出会话」是否禁用（导出进行中，防重复点击，T05）。 */
	readonly exportDisabled: boolean;
	/** 当前是否已在多选模式（已在则不再给「多选」项，避免重复进入清空选择）。 */
	readonly multiSelectActive: boolean;
	readonly onDelete: () => void;
	readonly onEnterMultiSelect: () => void;
	readonly onExport: () => void;
}

export function buildSessionMenuItems(input: WeKnoraSessionMenuInput): readonly WeKnoraSessionMenuItem[] {
	const items: WeKnoraSessionMenuItem[] = [];
	if (!input.multiSelectActive) {
		items.push({
			id: "multi-select",
			label: input.labels.multiSelect,
			iconClassName: "icon-[solar--checklist-minimalistic-linear]",
			onSelect: input.onEnterMultiSelect,
		});
	}
	items.push({
		id: "export",
		label: input.labels.export,
		iconClassName: "icon-[solar--download-minimalistic-linear]",
		disabled: input.exportDisabled,
		onSelect: input.onExport,
	});
	items.push({
		id: "delete",
		label: input.labels.delete,
		iconClassName: "icon-[solar--trash-bin-trash-linear]",
		danger: true,
		disabled: input.deleteDisabled,
		onSelect: input.onDelete,
	});
	return items;
}
