// Modified by The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shared/components/ui/select";
import { Spin } from "@vetta-org/ui";
import type { AllstarDevHomePageModel, AllstarDevProjectCard } from "../hooks/useAllstarDevHomePageModel";

/**
 * 版块首页的纯展示层：只消费 {@link AllstarDevHomePageModel} 的稳定 view model，
 * 不读业务状态、不调 IPC。布局遵循 DESIGN.md——平坦分层（1px 边框、无阴影）、
 * 七档字号、卡片网格 auto-fill+minmax、列表项 13px。
 */
export function AllstarDevHomePageView({ model }: { model: AllstarDevHomePageModel }): JSX.Element {
	if (model.loading) {
		return (
			<div className="flex h-full items-center justify-center gap-2.5 px-8 pb-8">
				<Spin size="md" className="text-primary" />
				<span className="text-[13px] text-muted-foreground">{model.labels.loading}</span>
			</div>
		);
	}
	return (
		<div className="flex h-full flex-col gap-5 px-8 pb-8 pt-6">
			<p className="text-[13px] text-muted-foreground">{model.labels.intro}</p>
			<section className="flex min-h-0 flex-1 flex-col gap-3">
				<h2 className="text-[15px] font-medium text-foreground">{model.labels.projectsTitle}</h2>
				{model.projectCards.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border/50 px-3.5 py-10">
						<span aria-hidden className="icon-[solar--code-linear] h-10 w-10 text-muted-foreground/60" />
						<p className="text-[13px] text-foreground">{model.labels.emptyTitle}</p>
						<p className="text-xs text-muted-foreground">{model.labels.emptyHint}</p>
					</div>
				) : (
					<div className="flex gap-3 overflow-x-auto pb-1">
						{model.projectCards.map((card) => (
							<AllstarDevProjectCardView
								key={card.cwd}
								card={card}
								labels={model.labels}
								onOpenSession={model.onOpenSession}
							/>
						))}
						{/* ADR-0151 决策 7：一键归入版块的空卡片（打开已有项目入口）。 */}
						<AllstarDevAddProjectCardView label={model.labels.openProject} onClick={model.onOpenExistingProject} />
					</div>
				)}
			</section>
			<div className="flex items-center justify-center gap-2.5 border-t border-border/40 pt-4">
				<Button
					variant="outline"
					onClick={model.onOpenExistingProject}
					title={model.labels.openProject}
				>
					<span aria-hidden className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
					{model.labels.openProject}
				</Button>
				<Select value={model.selectedCwd} onValueChange={model.onSelectProject}>
					<SelectTrigger className="w-64" aria-label={model.labels.emptyProjectLabel}>
						<SelectValue placeholder={model.labels.emptyProjectLabel} />
					</SelectTrigger>
					<SelectContent>
						{model.projects.map((project) => (
							<SelectItem key={project.cwd} value={project.cwd}>
								{project.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="primary"
					disabled={!model.selectedCwd}
					onClick={() => model.onStartNewSession(model.selectedCwd)}
				>
					{model.labels.newSession}
				</Button>
			</div>
		</div>
	);
}

function AllstarDevProjectCardView({
	card,
	labels,
	onOpenSession,
}: {
	card: AllstarDevProjectCard;
	labels: AllstarDevHomePageModel["labels"];
	onOpenSession: AllstarDevHomePageModel["onOpenSession"];
}): JSX.Element {
	const hiddenCount = card.totalSessions - card.sessions.length;
	return (
		<article className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40">
			<header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3">
				<h3 className="truncate text-[13px] font-medium text-foreground">{card.projectName}</h3>
				<span className="shrink-0 text-xs text-muted-foreground">{card.totalSessions}</span>
			</header>
			{card.sessions.length === 0 ? (
				<p className="border-t border-border/40 px-3.5 py-4 text-xs text-muted-foreground">
					{labels.emptyCardHint}
				</p>
			) : (
				<ul className="flex-1 border-t border-border/40">
					{card.sessions.map((session) => (
						<li key={session.path} className="border-b border-border/40 last:border-b-0">
							<Button
								variant="ghost"
								className="h-auto w-full justify-start rounded-none px-3.5 py-2 text-left font-normal"
								onClick={() => onOpenSession(card.cwd, session.path)}
							>
								<span className="truncate text-[13px] text-foreground">{session.title}</span>
							</Button>
						</li>
					))}
					{hiddenCount > 0 && (
						<li className="border-t border-border/40 px-3.5 py-1.5 text-xs text-muted-foreground">
							{labels.moreSessions(hiddenCount)}
						</li>
					)}
				</ul>
			)}
		</article>
	);
}

function AllstarDevAddProjectCardView({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<Button
			variant="outline"
			className="flex h-auto w-60 shrink-0 flex-col items-center justify-center gap-2 border-dashed px-3.5 py-6 text-muted-foreground"
			onClick={onClick}
		>
			<span aria-hidden className="icon-[solar--add-folder-linear] h-8 w-8 text-muted-foreground/60" />
			<span className="text-xs">{label}</span>
		</Button>
	);
}
