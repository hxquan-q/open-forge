// Modified by The Open Forge contributors.
import type { AutomationListFilter } from "../automation-status";
import { useTaskListModel } from "../hooks/useTaskListModel";
import { TaskListView } from "./TaskListView";

interface TaskListProps {
	readonly selectedTaskId: string | null;
	readonly filter: AutomationListFilter;
	readonly search: string;
	readonly onSelectTask: (id: string) => void;
}

export function TaskList({ selectedTaskId, filter, search, onSelectTask }: TaskListProps): JSX.Element {
	const model = useTaskListModel({ selectedTaskId, filter, search });
	return (
		<TaskListView items={model.items} emptyLabel={model.emptyLabel} onSelectTask={onSelectTask} />
	);
}
