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
		<div className="flex flex-col gap-5 px-8 pb-8 pt-6">
			<p className="text-[13px] text-muted-foreground">{model.labels.intro}</p>
			<section className="flex flex-col gap-3">
				<h2 className="text-[15px] font-medium text-foreground">{model.labels.projectsTitle}</h2>
				{model.projectCards.length === 0 ? (
					<AllstarDevHomeEmptyState model={model} />
				) : (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
						{model.projectCards.map((card) => (
							<AllstarDevProjectCardView
								key={card.cwd}
								card={card}
								labels={model.labels}
								onOpenSession={model.onOpenSession}
								onStartNewSession={model.onStartNewSession}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function AllstarDevHomeEmptyState({ model }: { model: AllstarDevHomePageModel }): JSX.Element {
	return (
		<div className="flex flex-col items-center gap-2 rounded-xl border border-border/50 px-3.5 py-10">
			<span aria-hidden className="icon-[solar--code-linear] h-10 w-10 text-muted-foreground/60" />
			<p className="text-[13px] text-foreground">{model.labels.emptyTitle}</p>
			<p className="mb-2 text-xs text-muted-foreground">{model.labels.emptyHint}</p>
			<div className="flex items-center gap-2.5">
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
	onStartNewSession,
}: {
	card: AllstarDevProjectCard;
	labels: AllstarDevHomePageModel["labels"];
	onOpenSession: AllstarDevHomePageModel["onOpenSession"];
	onStartNewSession: AllstarDevHomePageModel["onStartNewSession"];
}): JSX.Element {
	const hiddenCount = card.totalSessions - card.sessions.length;
	return (
		<article className="flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40">
			<header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3">
				<h3 className="truncate text-[13px] font-medium text-foreground">{card.projectName}</h3>
				<span className="shrink-0 text-xs text-muted-foreground">{card.totalSessions}</span>
			</header>
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
			<footer className="border-t border-border/40 p-2">
				<Button
					variant="ghost"
					size="sm"
					className="w-full text-xs"
					onClick={() => onStartNewSession(card.cwd)}
				>
					{labels.newSession}
				</Button>
			</footer>
		</article>
	);
}
