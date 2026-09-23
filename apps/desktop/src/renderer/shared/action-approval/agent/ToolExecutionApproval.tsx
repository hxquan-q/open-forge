import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import { type ActiveActionApproval, useActionApproval } from "../useActionApproval";
import { useManageApprovalFrame } from "../manage/useManageApprovalShell";

/** TASK-0016：高风险工具执行审批（L3/L4）。允许一次 / 记住到本项目 / 拒绝。 */

interface ApprovalInput {
	readonly toolName: string;
	readonly level: string;
	readonly summary: string;
	readonly affectedResources: readonly string[];
	readonly rememberAvailable: boolean;
}

function parseInput(input: unknown): ApprovalInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const raw = input as Record<string, unknown>;
	if (typeof raw.toolName !== "string" || typeof raw.summary !== "string") return null;
	return {
		toolName: raw.toolName,
		level: typeof raw.level === "string" ? raw.level : "L3",
		summary: raw.summary,
		affectedResources: Array.isArray(raw.affectedResources)
			? raw.affectedResources.filter((item): item is string => typeof item === "string")
			: [],
		rememberAvailable: raw.rememberAvailable === true,
	};
}

export function ToolExecutionApproval(): JSX.Element | null {
	const approval = useActionApproval("agent.tool-approval");
	if (!approval) return null;
	return <ToolExecutionApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function ToolExecutionApprovalContent({ approval }: { readonly approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [remember, setRemember] = useState(false);
	const levelBadge =
		input?.level === "L4" ? t("actionApproval.taskApproval.levelL4") : input?.level === "L3" ? t("actionApproval.taskApproval.levelL3") : input?.level;

	return (
		<Frame
			presentation="dialog"
			title={t("actionApproval.taskApproval.title", { tool: input?.toolName ?? request.actionId })}
			summary={input?.summary ?? request.summary}
			icon="icon-[solar--shield-warning-linear]"
			badge={levelBadge}
			destructive={input?.level === "L4"}
			labels={frameLabels(request.permission, t("actionApproval.taskApproval.allowOnce"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve(input?.rememberAvailable && remember ? { remember: true } : undefined)}
		>
			{input && input.affectedResources.length > 0 ? (
				<div className="space-y-1.5 px-5 pt-4">
					<p className="text-[12px] font-medium text-muted-foreground">{t("actionApproval.taskApproval.affectedResources")}</p>
					<ul className="space-y-1">
						{input.affectedResources.map((resource) => (
							<li key={resource} className="truncate rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12px] text-foreground">
								{resource}
							</li>
						))}
					</ul>
				</div>
			) : null}
			{input?.rememberAvailable ? (
				<label className="mx-5 mt-4 flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
					<input
						type="checkbox"
						checked={remember}
						onChange={(event) => setRemember(event.target.checked)}
						className="h-4 w-4 accent-[var(--primary)]"
					/>
					<span className="text-[12px] text-muted-foreground">{t("actionApproval.taskApproval.rememberProject")}</span>
				</label>
			) : null}
			{input?.level === "L4" ? (
				<p className="mx-5 mt-3 text-[12px] text-amber-400">{t("actionApproval.taskApproval.l4AlwaysConfirm")}</p>
			) : null}
			<div className="flex justify-end gap-2 px-5 pb-1 pt-4">
				<Button variant="outline" size="sm" onClick={reject} disabled={responding}>
					{t("actionApproval.reject")}
				</Button>
				<Button size="sm" onClick={() => approve(input?.rememberAvailable && remember ? { remember: true } : undefined)} disabled={responding}>
					{t("actionApproval.taskApproval.allowOnce")}
				</Button>
			</div>
		</Frame>
	);
}
