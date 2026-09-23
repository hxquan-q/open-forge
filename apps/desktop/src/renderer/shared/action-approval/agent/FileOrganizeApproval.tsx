import { type ActiveActionApproval, useActionApproval } from "../useActionApproval";
import { useManageApprovalFrame } from "../manage/useManageApprovalShell";

/** TASK-0018：文件整理计划审阅——完整变更预览，确认后才执行。 */

interface OrganizeOperation {
	readonly type: string;
	readonly from: string;
	readonly to: string;
	readonly reason?: string;
}

function parseOperations(input: unknown): readonly OrganizeOperation[] {
	if (typeof input !== "object" || input === null) return [];
	const raw = (input as { operations?: unknown }).operations;
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(item): item is OrganizeOperation =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as OrganizeOperation).from === "string" &&
			typeof (item as OrganizeOperation).to === "string",
	);
}

export function FileOrganizeApproval(): JSX.Element | null {
	const approval = useActionApproval("agent.file-organize");
	if (!approval) return null;
	return <FileOrganizeApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function FileOrganizeApprovalContent({ approval }: { readonly approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const operations = parseOperations(request.input);

	return (
		<Frame
			presentation="dialog"
			title={t("actionApproval.fileOrganize.title")}
			summary={t("actionApproval.fileOrganize.summary", { count: operations.length })}
			icon="icon-[solar--folder-move-linear]"
			labels={frameLabels(request.permission, t("actionApproval.fileOrganize.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
		>
			<ul className="max-h-72 space-y-1.5 overflow-y-auto px-5 pt-4">
				{operations.map((operation) => (
					<li
						key={`${operation.from}->${operation.to}`}
						className="rounded-lg border border-border/50 bg-card/40 px-3 py-2"
					>
						<p className="truncate text-[12px] text-foreground">
							<span className="text-muted-foreground/70">{operation.from}</span>
							<span className="mx-1.5 text-muted-foreground/50">→</span>
							{operation.to}
						</p>
						{operation.reason ? (
							<p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">{operation.reason}</p>
						) : null}
					</li>
				))}
			</ul>
		</Frame>
	);
}
