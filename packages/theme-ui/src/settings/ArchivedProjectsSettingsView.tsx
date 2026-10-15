// Modified by The Open Forge contributors.
import type { JSX } from "react";
import { Button } from "@vetta-org/ui";
import { SettingEmptyRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface ArchivedProjectRowView {
	readonly path: string;
	readonly name: string;
}

export interface ArchivedProjectsSettingsViewLabels {
	readonly empty: string;
	readonly sectionTitle: string;
	readonly unarchive: string;
	readonly deleteProject: string;
}

export interface ArchivedProjectsSettingsViewProps {
	readonly labels: ArchivedProjectsSettingsViewLabels;
	readonly projects: readonly ArchivedProjectRowView[];
	readonly section: SettingSectionMeta;
	readonly onUnarchive: (path: string) => void;
	readonly onDelete: (path: string) => void;
}

/** 「已归档」页里的一节：只渲染节标题与行，页标题与留白归页面壳。 */
export function ArchivedProjectsSettingsView({
	labels,
	projects,
	section,
	onUnarchive,
	onDelete,
}: ArchivedProjectsSettingsViewProps): JSX.Element {
	return (
		<SettingSection title={labels.sectionTitle} section={section}>
			{projects.length === 0 ? (
				<SettingEmptyRow icon="icon-[mdi--archive-off-outline]" label={labels.empty} />
			) : (
				projects.map((entry) => (
					<div
						key={entry.path}
						className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
					>
						<span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<div className="text-[13px] font-medium text-foreground">{entry.name}</div>
							<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="xs"
								onClick={() => onUnarchive(entry.path)}
								title={labels.unarchive}
							>
								<span className="icon-[mdi--archive-arrow-up-outline] h-3.5 w-3.5" />
								{labels.unarchive}
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={() => onDelete(entry.path)}
								title={labels.deleteProject}
								className="text-muted-foreground hover:text-destructive"
							>
								<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
				))
			)}
		</SettingSection>
	);
}
