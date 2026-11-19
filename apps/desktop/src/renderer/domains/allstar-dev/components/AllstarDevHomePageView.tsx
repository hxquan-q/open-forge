// Modified by The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { cn, Spin } from "@vetta-org/ui";
import { AllstarProjectConfigDialog } from "./AllstarProjectConfigDialog";
import { AllstarDevSessionsDialog } from "./AllstarDevSessionsDialog";
import { AllstarSessionRow } from "./AllstarSessionRow";
import { projectAvatarStyle, projectInitial } from "./projectAvatar";
import type { AllstarDevHomePageModel, AllstarDevProjectCard } from "../hooks/useAllstarDevHomePageModel";

/** 卡片直显会话条数；更多走「全部 N 个」（第二批：会话弹窗）。 */
const CARD_VISIBLE_SESSIONS = 4;

/**
 * 版块首页的纯展示层：只消费 {@link AllstarDevHomePageModel} 的稳定 view model，
 * 不读业务状态、不调 IPC。布局遵循 DESIGN.md——平坦分层（1px 边框、无阴影）、
 * 七档字号、卡片网格 auto-fill+minmax、列表项 13px。
 */
export function AllstarDevHomePageView({ model }: { model: AllstarDevHomePageModel }): JSX.Element {
	if (model.loading) {
		return (
			<div className="flex h-full w-full items-center justify-center gap-2.5 px-8 pb-8">
				<Spin size="md" className="text-primary" />
				<span className="text-[13px] text-muted-foreground">{model.labels.loading}</span>
			</div>
		);
	}
	return (
		// w-full：父级是 MainContentFrame 内容区的行向 flex 容器，主轴方向不自动 stretch，
		// 不声明宽度的子项会退化成「页头文案 + 按钮组」的 max-content（实测约 700px），
		// 网格只排得下 3 列、右侧留大片空白，且窗口越宽空白越大（BUG-0193）。
		// min-w-0：断开 flex 链上的 min-content 宽度传导，让网格在窄窗口下由
		// 自身 auto-fill 列宽消化宽度收缩（BUG-0188 教训的网格版）。
		<div className="flex h-full w-full min-w-0 flex-col gap-5 px-8 pb-8 pt-6">
			<header className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h1 className="text-[15px] font-medium text-foreground">{model.labels.title}</h1>
					<p className="text-[13px] text-muted-foreground">{model.labels.intro}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2.5">
					<Button
						variant="outline"
						onClick={model.onOpenExistingProject}
						title={model.labels.openProject}
					>
						<span aria-hidden className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
						{model.labels.openProject}
					</Button>
					{model.projects.length <= 1 ? (
						// 唯一候选：点按即建，不必再弹选择层；无候选时禁用（走「打开已有项目」登记）。
						<Button
							variant="primary"
							disabled={model.projects.length === 0}
							onClick={() => model.onStartNewSession(model.projects[0]?.cwd ?? "")}
						>
							<span aria-hidden className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
							{model.labels.newSession}
						</Button>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="primary">
									<span aria-hidden className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
									{model.labels.newSession}
									<span aria-hidden className="icon-[solar--alt-arrow-down-linear] h-3 w-3 opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{model.projects.map((project) => (
									<DropdownMenuItem
										key={project.cwd}
										onSelect={() => model.onStartNewSession(project.cwd)}
									>
										{project.name}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</header>
			<section className="flex min-h-0 flex-1 flex-col gap-3">
				<div className="flex items-baseline gap-2">
					<h2 className="text-[13px] font-medium text-foreground">{model.labels.projectsTitle}</h2>
					<span className="text-xs text-muted-foreground">
						{model.labels.projectCount(model.projectCards.length)}
					</span>
				</div>
				{model.projectCards.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border/50 px-3.5 py-10">
						<span aria-hidden className="icon-[solar--code-linear] h-10 w-10 text-muted-foreground/60" />
						<p className="text-[13px] text-foreground">{model.labels.emptyTitle}</p>
						<p className="text-xs text-muted-foreground">{model.labels.emptyHint}</p>
					</div>
				) : (
					/*
					 * 列宽 16.25rem（260px）：在 13rem 的基线上按用户要求放大 125%，卡片里
					 * 一句会话标题与「N 个会话 + ···」不再挤成一团。
					 * gap-x-8（32px）：用户要求卡片左右各留 10px 余量（12+10+10），比
					 * DESIGN.md 的 gap-5 上限更宽，是有意的版块特例；纵向仍用 gap-3 保持行距节奏。
					 */
					<div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(16.25rem,1fr))] gap-x-8 gap-y-3 overflow-y-auto pb-1">

						{model.projectCards.map((card) => (
							<AllstarDevProjectCardView
								key={card.cwd}
								card={card}
								model={model}
							/>
						))}
						{/* ADR-0151 决策 7：一键归入版块的空卡片（打开已有项目入口）。 */}
						<AllstarDevAddProjectCardView label={model.labels.openProject} onClick={model.onOpenExistingProject} />
					</div>
				)}
			</section>
			<AllstarProjectConfigDialog configuration={model.projectConfig} labels={model.labels} />
			{/* 第二批：卡片「全部 N 个 →」打开的会话弹窗；关闭或项目失配时自身不渲染。 */}
			<AllstarDevSessionsDialog model={model} />
		</div>
	);
}

function AllstarDevProjectCardView({ card, model }: { card: AllstarDevProjectCard; model: AllstarDevHomePageModel }): JSX.Element {
	const { labels } = model;
	// 卡片只直显最近 4 条；完整列表走「全部 N 个」（onOpenAllSessions，第二批弹窗）。
	const visibleSessions = card.sessions.slice(0, CARD_VISIBLE_SESSIONS);
	return (
		<article className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-accent/30">
			<header className="flex items-start justify-between gap-1">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span
						aria-hidden
						className={cn(
							"flex size-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-medium",
							projectAvatarStyle(card.projectName),
						)}
					>
						{projectInitial(card.projectName)}
					</span>
					<div className="flex min-w-0 flex-col">
						<h3 className="min-w-0 truncate text-[13px] font-medium text-foreground">{card.projectName}</h3>
						<span className="text-xs text-muted-foreground">{labels.sessionCount(card.totalSessions)}</span>
					</div>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={labels.projectActions}
							className="opacity-70 transition-opacity group-hover:opacity-100"
						>
							<span aria-hidden className="icon-[solar--menu-dots-bold] h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => model.onConfigureProject(card.cwd, card.projectName)}>
							<span aria-hidden className="icon-[solar--settings-linear] h-3.5 w-3.5" />
							{labels.configureProject}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => model.onRevealProject(card.cwd)}>
							<span aria-hidden className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
							{labels.revealInFolder}
						</DropdownMenuItem>
						{/* 移除放最后并分隔：只撤销版块登记，不删磁盘内容，文案刻意不写「删除」。 */}
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => model.onRemoveFromBoard(card.cwd)}>
							<span aria-hidden className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
							{labels.removeFromBoard}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</header>
			{visibleSessions.length === 0 ? (
				<p className="flex min-h-0 flex-1 items-center text-xs text-muted-foreground">
					{labels.emptyCardHint}
				</p>
			) : (
				<ul className="flex min-h-0 flex-1 flex-col">
					{visibleSessions.map((session) => (
						<li key={session.path}>
							{/*
							 * 行结构（标题按钮 + 独立 `···` 菜单）收在 AllstarSessionRow 里：
							 * 团队会话不做特质化标识（与弹窗口径一致，列表内一视同仁），
							 * 打开目标的种类分派留在 model 的 onOpenSession。
							 */}
							<AllstarSessionRow
								cwd={card.cwd}
								session={session}
								labels={labels}
								onOpen={() => model.onOpenSession(card.cwd, session)}
								onRename={model.onRenameSession}
								onDelete={model.onDeleteSession}
								onReveal={model.onRevealSession}
							/>
						</li>
					))}
				</ul>
			)}
			{/* mt-auto：会话不足 4 条时不留空行占位，底部操作行贴卡片底。 */}
			<footer className="mt-auto flex items-center justify-between gap-2 pt-1">
				<Button variant="ghost" size="xs" onClick={() => model.onStartNewSession(card.cwd)}>
					<span aria-hidden className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
					{labels.cardNewSession}
				</Button>
				{card.totalSessions > CARD_VISIBLE_SESSIONS && (
					<Button variant="ghost" size="xs" onClick={() => model.onOpenAllSessions(card.cwd)}>
						{labels.moreSessions(card.totalSessions)}
						<span aria-hidden className="icon-[solar--alt-arrow-right-linear] h-3 w-3" />
					</Button>
				)}
			</footer>
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
			className="flex h-auto min-h-24 w-full flex-col items-center justify-center gap-2 border-dashed px-3.5 py-6 text-muted-foreground"
			onClick={onClick}
		>
			<span aria-hidden className="icon-[solar--add-folder-linear] h-8 w-8 text-muted-foreground/60" />
			<span className="text-xs">{label}</span>
		</Button>
	);
}
