// Copyright The Open Forge contributors.
import type { JSX } from "react";
import { Button } from "@vetta-org/ui";
import { SettingEmptyRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface ArchivedSessionRowView {
	readonly path: string;
	readonly name: string;
	/** 已本地化的归档日期；格式化归渲染层，节视图只负责排版。 */
	readonly archivedAtLabel: string;
}

export interface ArchivedSessionsSettingsViewLabels {
	readonly empty: string;
	readonly sectionTitle: string;
	readonly unarchive: string;
	readonly deleteSession: string;
}

export interface ArchivedSessionsSettingsViewProps {
	readonly labels: ArchivedSessionsSettingsViewLabels;
	readonly sessions: readonly ArchivedSessionRowView[];
	readonly section: SettingSectionMeta;
	readonly onUnarchive: (path: string) => void;
	readonly onDelete: (path: string) => void;
}

/**
 * 「已归档」页的会话节。会话可能属于已归档项目或远端项目，所以行只依赖归档时
 * 留下的名字快照，不去回读会话文件；「删除」是永久删除，与侧栏删除同语义。
 */
export function ArchivedSessionsSettingsView({
	labels,
	sessions,
	section,
	onUnarchive,
	onDelete,
}: ArchivedSessionsSettingsViewProps): JSX.Element {
	return (
		<SettingSection title={labels.sectionTitle} section={section}>
			{sessions.length === 0 ? (
				<SettingEmptyRow icon="icon-[mdi--archive-off-outline]" label={labels.empty} />
			) : (
				sessions.map((entry) => (
					<div
						key={entry.path}
						className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
					>
						<span className="icon-[mdi--message-text-outline] h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<div className="text-[13px] font-medium text-foreground">{entry.name}</div>
							<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.path}</div>
						</div>
						<span className="shrink-0 text-[11px] text-muted-foreground">{entry.archivedAtLabel}</span>
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
								title={labels.deleteSession}
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
