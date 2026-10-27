// Modified by The Open Forge contributors.
import { useGitRepoStatus } from "@shared/hooks/useGitRepoStatus";
import { activeSessionAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";

/**
 * 输入栏的 git 分支标签（演示定稿）：code 模式会话 + 项目是 git 仓库时显示在
 * 执行模式（权限）选项之后。数据与 Git 页签共用缓存。
 */
export function InputBarGitBranchChip({
	cwd,
	visible,
}: {
	cwd: string | undefined | null;
	visible: boolean;
}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const { status } = useGitRepoStatus(cwd ?? undefined, { pollMs: 8000 });
	if (!visible || activeSession?.capabilityProfile !== "coding" || !status) return null;
	return (
		<span
			data-testid="git-branch-chip"
			title={t("inputBar.toolbar.gitBranchTitle")}
			className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted/50 px-2 py-1 text-[11px] leading-4 text-muted-foreground"
		>
			<span aria-hidden className="icon-[mdi--source-branch] h-3 w-3" />
			<span className="max-w-40 truncate">{status.branch}</span>
		</span>
	);
}
