// Modified by The Open Forge contributors.
import { ActivityPanel, CurrentScenarioActivityPanel } from "@domains/activity-panel/components/ActivityPanel";
import { BottomPanelHost } from "@domains/bottom-panel/components/BottomPanelHost";
import { useWorkspaceRightPanel, WorkDocumentSections, WorkWorkspacePanel } from "@domains/workspace-mode";
import { cn } from "@shared/lib/utils";
import { PerfSendProfiler } from "@shared/lib/perf-send";
import { type ChatTimelineItem, type WorkspaceMode } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ActivityTabId } from "@domains/activity-panel/registry/types";
import type { ConversationScenario } from "@vetta-org/plugin-sdk";
import { memo, type ReactNode } from "react";
import { ChatExportHost } from "../ChatExportHost";

export interface DefaultChatViewProps {
	readonly children: ReactNode;
	/** 消息流上方的常驻条（Team 的成员胶囊条就住在这里）。 */
	readonly subHeader?: ReactNode;
	readonly messages: readonly ChatTimelineItem[];
	readonly workspace: ActivityWorkspace;
	readonly rootClassName?: string;
	readonly exportState?: {
		readonly title: string;
		readonly onFinished: () => void;
	};
	readonly activity?: {
		readonly enablePluginTabs?: boolean;
		readonly enabledBuiltinTabs?: readonly ActivityTabId[];
		/** Hosts that do not drive the global scenario atom (Team) pass their own scenario. */
		readonly pluginScenario?: ConversationScenario;
	};
	/**
	 * 工作区模式（IA 定稿 §2/§3）：work 时右栏换成 WorkWorkspacePanel 插槽面板，
	 * coding（默认）保持现有 ActivityPanel。Team 等自定义 activity 的宿主不传此值。
	 */
	readonly workspaceMode?: WorkspaceMode;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
	return left === right || (left.length === right.length && left.every((id, index) => id === right[index]));
}

function sameOptionalIds(left?: readonly string[], right?: readonly string[]): boolean {
	if (!left || !right) return left === right;
	return sameIds(left, right);
}

function sameActivity(
	left: DefaultChatViewProps["activity"],
	right: DefaultChatViewProps["activity"],
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return left.enablePluginTabs === right.enablePluginTabs &&
		left.pluginScenario === right.pluginScenario &&
		sameOptionalIds(left.enabledBuiltinTabs, right.enabledBuiltinTabs);
}

/** 演示定稿：code 会话的活动面板内置页签白名单（文件 / Git / 终端 / 浏览器），插件页签不参与。 */
const CODING_ACTIVITY_BUILTIN_TABS = ["file", "git", "terminal", "browser"] as const;

const ActivityColumn = memo(
	function ActivityColumn({
		workspace,
		activity,
		workspaceMode,
	}: Pick<DefaultChatViewProps, "workspace" | "activity" | "workspaceMode">) {
		const rightPanel = useWorkspaceRightPanel({
			mode: workspaceMode,
			runtimeIds: workspace.runtimeIds,
			hasExplicitActivity: Boolean(activity),
		});
		if (rightPanel === "work") {
			return (
				<WorkWorkspacePanel>
					<WorkDocumentSections runtimeIds={workspace.runtimeIds} />
				</WorkWorkspacePanel>
			);
		}
		if (rightPanel === "none") return null;
		const coding = workspaceMode === "coding";
		return activity ? (
			<ActivityPanel
				workspace={workspace}
				enablePluginTabs={coding ? false : activity.enablePluginTabs}
				enabledBuiltinTabs={coding ? CODING_ACTIVITY_BUILTIN_TABS : activity.enabledBuiltinTabs}
				pluginScenario={activity.pluginScenario}
				hotTracking={coding}
			/>
		) : (
			<CurrentScenarioActivityPanel
				workspace={workspace}
				enablePluginTabs={coding ? false : undefined}
				enabledBuiltinTabs={coding ? CODING_ACTIVITY_BUILTIN_TABS : undefined}
				hotTracking={coding}
			/>
		);
	},
	(previous, next) =>
		previous.workspace.id === next.workspace.id &&
		previous.workspace.cwd === next.workspace.cwd &&
		sameIds(previous.workspace.runtimeIds, next.workspace.runtimeIds) &&
		sameActivity(previous.activity, next.activity) &&
		previous.workspaceMode === next.workspaceMode,
);

export function DefaultChatView({
	children,
	subHeader,
	messages,
	workspace,
	rootClassName,
	exportState,
	activity,
	workspaceMode,
}: DefaultChatViewProps): JSX.Element {
	return (
		<PerfSendProfiler id="ChatView(total)">
			<div className={cn("flex h-full min-w-0 flex-1 flex-col bg-background", rootClassName)}>
				{exportState ? (
					<ChatExportHost messages={messages} title={exportState.title} onFinished={exportState.onFinished} />
				) : null}
				<div className="flex min-h-0 flex-1 gap-2 overflow-visible">
					{/*
					 * 用 clip + clip-margin 代替 overflow-hidden：活动面板收起时底部面板要铺到
					 * 窗口边缘，右边得越过这一行的 gap-2 再加 AppFrame 的 p-2（共 16px），
					 * 而消息流本身仍然需要被裁住。
					 */}
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip [overflow-clip-margin:16px]">
						{subHeader}
						{children}
						{/*
						 * 底部面板住在消息列内部，宽度跟着消息列走、不伸到活动面板下方：
						 * 活动面板是与消息流并列的一列，横穿它的底边会把两列看成一块。
						 */}
						<BottomPanelHost />
					</div>
					{/*
					 * 右栏单独一个 profiler id：工作区模式切换的耗时要在「右栏换装」与
					 * 「其余重渲」之间可归因，否则两者挤在 ChatView(total) 里分不开。
					 */}
					<PerfSendProfiler id="ChatView:rightColumn">
						<ActivityColumn workspace={workspace} activity={activity} workspaceMode={workspaceMode} />
					</PerfSendProfiler>
				</div>
			</div>
		</PerfSendProfiler>
	);
}

export function ChatComposer({ children }: { children: ReactNode }) {
	return (
		<div className="relative shrink-0">
			<PerfSendProfiler id="InputBar">{children}</PerfSendProfiler>
		</div>
	);
}

export function ChatError({ children }: { children?: ReactNode }) {
	return children ? (
		<div
			className="mx-auto mb-2 w-full max-w-2xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
			role="alert"
		>
			{children}
		</div>
	) : null;
}
