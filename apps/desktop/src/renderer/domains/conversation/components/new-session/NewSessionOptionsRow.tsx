import type { WorkspaceMode } from "@shared/store/atoms";
import { NewSessionProjectSelector } from "./project-selector/NewSessionProjectSelector";
import type { ProjectOption, ProjectSelection } from "./project-selector/project-selection";
import { NewSessionAgentSelector } from "./NewSessionAgentSelector";
import { NewSessionWorkspaceHint } from "./NewSessionWorkspaceHint";
import type { NewSessionTargetKey } from "./target";

interface NewSessionOptionsRowProps {
	readonly selection: ProjectSelection;
	readonly options: readonly ProjectOption[];
	readonly takenNames: readonly string[];
	readonly creatingProject: boolean;
	readonly onSelectProject: (cwd: string | null) => void;
	readonly onSelectPendingProject: (name: string) => void;
	readonly targetKey?: NewSessionTargetKey | null;
	readonly onSelectTarget?: (targetKey: NewSessionTargetKey | null) => void;
	/** 窄插槽下项目选择器改挂到输入框下方，这一行只留智能体 chip。 */
	readonly showProjectSelector?: boolean;
	readonly workspaceMode: WorkspaceMode;
}

/**
 * hero 与输入框之间的会话前置选项：项目 / 智能体。工作区档位不在此切换——新会话默认
 * 文档与研究档，「代码」模式的入口在侧边栏「Allstar自主开发」版块入口（结构约束由
 * shared/hooks/agent-mode-entry-points.test.ts 守住）；进入对话后底部 hint 依旧按当前
 * 档位告诉用户「本会话按该模式开」。
 */
export function NewSessionOptionsRow({
	selection,
	options,
	takenNames,
	creatingProject,
	onSelectProject,
	onSelectPendingProject,
	targetKey = null,
	onSelectTarget = () => undefined,
	showProjectSelector = true,
	workspaceMode,
}: NewSessionOptionsRowProps): JSX.Element {
	return (
		// 与 hero 标题、输入框卡片共用 max-w-2xl 且不加横向 padding：chip 左缘压在标题基线上。
		<div className="mx-auto mb-4 flex w-full max-w-2xl flex-col gap-2">
			<div className="flex items-center gap-2">
				{showProjectSelector && (
					<NewSessionProjectSelector
						selection={selection}
						options={options}
						takenNames={takenNames}
						creating={creatingProject}
						onSelectProject={onSelectProject}
						onSelectPendingProject={onSelectPendingProject}
					/>
				)}
				<NewSessionAgentSelector selectedKey={targetKey} onSelect={onSelectTarget} />
			</div>
			<NewSessionWorkspaceHint mode={workspaceMode} />
		</div>
	);
}
