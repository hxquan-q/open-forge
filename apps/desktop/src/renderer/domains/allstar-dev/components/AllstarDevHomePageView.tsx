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
import type { AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";

/**
 * 版块首页的纯展示层：只消费 {@link AllstarDevHomePageModel} 的稳定 view model，
 * 不读业务状态、不调 IPC。布局遵循 DESIGN.md——平坦分层（1px 边框、无阴影）、
 * 七档字号、section 间距 gap-5、列表项 13px。
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
				<h2 className="text-[15px] font-medium text-foreground">{model.labels.quickStartTitle}</h2>
				<div className="flex items-center gap-2.5">
					<Select value={model.selectedCwd} onValueChange={model.onSelectProject}>
						<SelectTrigger className="w-64" aria-label={model.labels.projectLabel}>
							<SelectValue placeholder={model.labels.projectLabel} />
						</SelectTrigger>
						<SelectContent>
							{model.projects.map((project) => (
								<SelectItem key={project.cwd} value={project.cwd}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button variant="primary" disabled={!model.selectedCwd} onClick={model.onStartNewSession}>
						{model.labels.newSession}
					</Button>
				</div>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-[15px] font-medium text-foreground">{model.labels.recentTitle}</h2>
				{model.recentSessions.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-xl border border-border/50 px-3.5 py-10">
						<span aria-hidden className="icon-[solar--code-linear] h-10 w-10 text-muted-foreground/60" />
						<p className="text-[13px] text-foreground">{model.labels.emptyTitle}</p>
						<p className="text-xs text-muted-foreground">{model.labels.emptyHint}</p>
					</div>
				) : (
					<ul className="overflow-hidden rounded-xl border border-border/50">
						{model.recentSessions.map((session, index) => (
							<li key={session.path} className={index > 0 ? "border-t border-border/40" : undefined}>
								<Button
									variant="ghost"
									className="h-auto w-full justify-between gap-3 px-3.5 py-2.5 text-left font-normal"
									onClick={() => model.onOpenSession(session.cwd, session.path)}
								>
									<span className="truncate text-[13px] text-foreground">{session.title}</span>
									<span className="shrink-0 text-xs text-muted-foreground">{session.projectName}</span>
								</Button>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
