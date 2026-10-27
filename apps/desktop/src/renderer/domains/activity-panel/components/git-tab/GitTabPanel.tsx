// Modified by The Open Forge contributors.
import { useGitRepoStatus } from "@shared/hooks/useGitRepoStatus";
import { Button } from "@shared/components/ui/button";
import { Spin } from "@vetta-org/ui";
import type { GitRepoChange } from "@preload/api-types/git";
import { useTranslation } from "react-i18next";

const STATUS_LABEL_KEY = {
	added: "activityPanel.git.status.added",
	modified: "activityPanel.git.status.modified",
	deleted: "activityPanel.git.status.deleted",
	untracked: "activityPanel.git.status.untracked",
	renamed: "activityPanel.git.status.renamed",
} as const satisfies Record<GitRepoChange["status"], string>;

/**
 * Git 页签（演示级，只读）：当前分支 + 工作区变更列表。数据经共享缓存拉取
 * （与输入栏分支标签同源），非 git 仓库显示占位说明。
 */
export function GitTabPanel({ cwd }: { cwd: string | undefined | null }): JSX.Element {
	const { t } = useTranslation("chat");
	const { status, refresh } = useGitRepoStatus(cwd ?? undefined);

	if (!cwd) {
		return <GitTabHint text={t("activityPanel.git.noProject")} />;
	}
	if (status === undefined) {
		return (
			<div className="flex h-full items-center justify-center gap-2.5">
				<Spin size="sm" className="text-primary" />
				<span className="text-xs text-muted-foreground">{t("activityPanel.git.loading")}</span>
			</div>
		);
	}
	if (status === null) {
		return <GitTabHint text={t("activityPanel.git.notRepo")} />;
	}
	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-2 px-3 pb-2 pt-3">
				<span aria-hidden className="icon-[mdi--source-branch] h-3.5 w-3.5 text-primary" />
				<span className="truncate text-[13px] font-medium text-foreground" title={status.branch}>
					{status.branch}
				</span>
				{status.changes.length > 0 ? (
					<span className="shrink-0 text-xs text-muted-foreground">
						{t("activityPanel.git.changeCount", { count: status.changes.length })}
					</span>
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					className="ml-auto shrink-0"
					title={t("activityPanel.git.refresh")}
					onClick={refresh}
				>
					<span aria-hidden className="icon-[solar--refresh-linear] h-3.5 w-3.5" />
				</Button>
			</header>
			{status.changes.length === 0 ? (
				<GitTabHint text={t("activityPanel.git.clean")} />
			) : (
				<ul className="min-h-0 flex-1 overflow-y-auto border-t border-border/40">
					{status.changes.map((change) => (
						<li
							key={`${change.status}:${change.path}`}
							className="flex items-center gap-2 border-b border-border/40 px-3 py-2 last:border-b-0"
							title={change.path}
						>
							<span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{t(STATUS_LABEL_KEY[change.status])}
							</span>
							<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
								{change.path}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function GitTabHint({ text }: { text: string }): JSX.Element {
	return (
		<div className="flex h-full items-center justify-center px-4">
			<p className="text-center text-xs text-muted-foreground">{text}</p>
		</div>
	);
}
