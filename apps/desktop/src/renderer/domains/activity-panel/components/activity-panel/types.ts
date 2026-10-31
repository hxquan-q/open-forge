// Copyright The Open Forge contributors.
import type { TabBarDragEvent, TabBarItem } from "@shared/components/ui/tab-bar";
import type { ActivityTabKey } from "@shared/lib/project-profile";
import type { FloatingActivityTabPlacement } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ConversationScenario } from "@vetta-org/plugin-sdk";
import type { RefObject } from "react";
import type { ResolvedActivityTab } from "../../registry/types";
import type { ActivityTabBounds, ActivityTabPoint } from "../../services/floating-activity-tab";
import type { HiddenTabEntry } from "../PluginTabPicker";

export interface ActivityPanelProps {
	workspace: ActivityWorkspace;
	enablePluginTabs?: boolean;
	knowledgeHistory?: boolean;
	/** Host-selected static abilities. Omitted means every built-in contribution. */
	enabledBuiltinTabs?: readonly string[];
	pluginScenario?: ConversationScenario;
	/**
	 * §11.3（REQ-0030）：LLM 行为热追踪（AI 命令投屏/文件跟随/页签跟随）是 code 模式
	 * 独有。host 按会话档位/项目档位传入；缺省 false——非 coding 挂载点不跟随，
	 * 也不显示 AI 终端回放页签（terminal 内置页签被滤除）。
	 */
	hotTracking?: boolean;
}

export interface ActivityPanelModel {
	activeTab: ActivityTabKey;
	/** 已注册且未 attach 的插件 tab，供「+」菜单从可添加池挂入。 */
	availablePluginTabs: HiddenTabEntry[];
	bottomSheet: boolean;
	cwd: string | null;
	workspaceId: string;
	dockPreviewBounds: ActivityTabBounds | null;
	floatingTabs: readonly FloatingActivityTabPlacement[];
	isOpen: boolean;
	isResizing: boolean;
	knowledgeHistory: boolean;
	maxWidth: number;
	mainTabListRef: RefObject<HTMLDivElement | null>;
	minWidth: number;
	/** 当前需挂载的 tab：激活项、浮动项及显式 keepAlive 项。 */
	mountedTabs: ResolvedActivityTab[];
	narrowSheet: boolean;
	overflowTabs: HiddenTabEntry[];
	panelRef: RefObject<HTMLDivElement | null>;
	restorableTabs: HiddenTabEntry[];
	showTabPicker: boolean;
	tabItems: TabBarItem<ActivityTabKey>[];
	width: number;
}

export interface ActivityPanelActions {
	onAttachPluginTab: (key: string) => void;
	onClose: () => void;
	onFloatingResize: (key: ActivityTabKey, delta: ActivityTabPoint) => void;
	onFloatingResizeEnd: (key: ActivityTabKey) => void;
	onFloatingTabDragEnd: (event: TabBarDragEvent<ActivityTabKey>) => boolean | undefined;
	onFloatingTabDragMove: (event: TabBarDragEvent<ActivityTabKey>) => void;
	onFloatingTabDragStart: (event: TabBarDragEvent<ActivityTabKey>) => void;
	onFloatingTabFocus: (key: ActivityTabKey) => void;
	onOverflowChange: (keys: ActivityTabKey[]) => void;
	onRemoveTab: (key: ActivityTabKey) => void;
	onReorderTabs: (keys: ActivityTabKey[]) => void;
	onResizeStart: () => void;
	onResize: (width: number) => void;
	onResizeEnd: (width: number) => void;
	onRestoreTab: (key: string) => void;
	onTabChange: (key: ActivityTabKey) => void;
	onTabDragEnd: (event: TabBarDragEvent<ActivityTabKey>) => boolean | undefined;
	onTabDragMove: (event: TabBarDragEvent<ActivityTabKey>) => void;
	onTabDragStart: (event: TabBarDragEvent<ActivityTabKey>) => void;
}
