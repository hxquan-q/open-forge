import { WorkspaceModeSwitcher } from "@domains/workspace-mode";
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
	/** 模式归属的 cwd：新会话页传待创建会话的 cwd，切换器据此读写（BUG-0037）。 */
	readonly workspaceCwd: string;
}

/**
 * hero 与输入框之间的会话前置选项：项目 / 智能体 / work-coding 切换。
 * 进入对话后不再展示第二套 work/coding 入口——已开跑的会话按创建时模式走，
 * 此处消失（送出去的 hint 文案依旧告诉用户「本会话按当前模式开」）。
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
	workspaceCwd,
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
				{/* work/coding 切换只在这里出现：进入对话后不再有「切换」语义，由底部 hint 转述。
				    模式按待创建会话的 cwd 归属，因此显式下发 workspaceCwd（BUG-0037）。 */}
				<WorkspaceModeSwitcher cwdOverride={workspaceCwd} />
			</div>
			<NewSessionWorkspaceHint mode={workspaceMode} />
		</div>
	);
}
