// Modified by The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { activeSessionAtom, confirmDialogAtom } from "@shared/store/atoms";
import type { ToolResultReview } from "@vetta/runtime-storage/conversation";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

type RollbackPhase = "idle" | "pending" | "restored" | "alreadyRolledBack" | "conflict" | "unavailable";

/**
 * Write/Edit 审查卡的元数据与回滚入口（TASK-0094）。
 * - 只读展示：状态 + 增删行统计，来自 `details.review`，与 git 状态无关。
 * - 回滚受 hash 守卫：文件被外部改过会返回冲突，绝不盲覆盖；
 *   动作本身不可再撤销，先走全局确认框。
 * - `interactive=false`（导出/只读渲染）时只展示元数据，不出按钮。
 */
export function ReviewChangeControls({
	review,
	interactive,
}: {
	readonly review: ToolResultReview | undefined;
	readonly interactive: boolean;
}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const runtimeId = useAtomValue(activeSessionAtom)?.runtimeId;
	const confirm = useSetAtom(confirmDialogAtom);
	const [phase, setPhase] = useState<RollbackPhase>("idle");

	const runRollback = useCallback(async () => {
		if (review === undefined || runtimeId === undefined) return;
		setPhase("pending");
		try {
			const outcome = await window.vetta.reviewChanges.rollback({
				sessionId: runtimeId,
				snapshotId: review.snapshotId,
			});
			setPhase(
				outcome.kind === "restored"
					? "restored"
					: outcome.kind === "already-rolled-back"
						? "alreadyRolledBack"
						: outcome.kind === "conflict"
							? "conflict"
							: "unavailable",
			);
		} catch {
			setPhase("unavailable");
		}
	}, [review, runtimeId]);

	if (review === undefined) return null;

	const statsLabel =
		review.binary === true
			? t("reviewChange.binary")
			: review.truncated === true
				? t("reviewChange.truncated")
				: t("reviewChange.lines", { added: review.addedLines, removed: review.removedLines });
	const showRollback =
		interactive &&
		review.rollbackable &&
		review.state === "active" &&
		runtimeId !== undefined &&
		(phase === "idle" || phase === "pending" || phase === "conflict" || phase === "unavailable");

	return (
		<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/60">
			<span>{t(`reviewChange.status.${review.status}`)}</span>
			<span className="tabular-nums">{statsLabel}</span>
			{phase === "restored" ? <span>{t("reviewChange.restored")}</span> : null}
			{phase === "alreadyRolledBack" ? <span>{t("reviewChange.alreadyRolledBack")}</span> : null}
			{phase === "conflict" ? <span className="text-amber-400">{t("reviewChange.conflict")}</span> : null}
			{phase === "unavailable" ? <span className="text-destructive/70">{t("reviewChange.unavailable")}</span> : null}
			{showRollback ? (
				<Button
					variant="outline"
					size="xs"
					className="ml-auto"
					disabled={phase === "pending"}
					onClick={() =>
						confirm({
							title: t("reviewChange.confirmTitle"),
							message: t("reviewChange.confirmMessage"),
							confirmLabel: t("reviewChange.confirmLabel"),
							variant: "danger",
							onConfirm: () => void runRollback(),
						})
					}
				>
					{phase === "pending" ? t("reviewChange.reverting") : t("reviewChange.revert")}
				</Button>
			) : null}
		</div>
	);
}
