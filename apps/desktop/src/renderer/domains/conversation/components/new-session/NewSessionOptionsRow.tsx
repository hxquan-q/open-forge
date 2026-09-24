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
 * hero 与输入框之间的会话前置选项：项目与智能体。
 * Work/Coding 只保留页头工作区开关；新会话从当前工作区派生，不再放第二套同名控件。
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
