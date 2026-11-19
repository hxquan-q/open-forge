// Modified by The Open Forge contributors.
import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";
import { cn } from "@vetta-org/ui";
import { projectAvatarStyle, projectInitial } from "./projectAvatar";
import type {
	AllstarDevHomePageModel,
	AllstarDevProjectCard,
} from "../hooks/useAllstarDevHomePageModel";

/**
 * 「全部会话」弹窗（第二批）：点卡片「全部 N 个 →」打开，平铺展示该项目的全部
 * 开发会话（model 已按 modifiedAt 降序），本地过滤标题，不分组、不分团队标签。
 *
 * 外层只做门控：open=false 或按 cwd 找不到卡片（版块册刷新、项目被移出）时静默
 * 不渲染，不抛错不报警。搜索关键字放内层组件的 useState——关闭即整体卸载，
 * 重新打开自然是空关键字，无需手动清理。
 */
export function AllstarDevSessionsDialog({ model }: { model: AllstarDevHomePageModel }): JSX.Element | null {
	const card = model.projectCards.find((candidate) => candidate.cwd === model.sessionsDialog.cwd);
	if (!model.sessionsDialog.open || !card) return null;
	return <AllstarDevSessionsDialogBody key={card.cwd} card={card} model={model} />;
}

function AllstarDevSessionsDialogBody({
	card,
	model,
}: {
	card: AllstarDevProjectCard;
	model: AllstarDevHomePageModel;
}): JSX.Element {
	const { labels } = model;
	const [keyword, setKeyword] = useState("");

	// 去首尾空格、大小写不敏感的标题包含匹配；空关键字不过滤（全量列表）。
	const normalized = keyword.trim().toLowerCase();
	const visibleSessions = normalized
		? card.sessions.filter((session) => session.title.toLowerCase().includes(normalized))
		: card.sessions;

	return (
		<Dialog open onOpenChange={(open) => !open && model.onCloseSessions()}>
			{/*
			 * ui 包 DialogContent 默认 grid + 自带右上角 ×（sr-only 文案硬编码英文）：
			 * 换 flex 纵向三段布局让滚动只发生在列表区（整页滚动会把搜索框滚出视野），
			 * 关闭按钮改为 head 内自带 i18n aria-label 的实现。
			 */}
			<DialogContent
				showCloseButton={false}
				onOpenAutoFocus={(event) => {
					// 覆盖默认的 preventDefault-only：打开后焦点落在搜索框，可直接键入过滤。
					event.preventDefault();
					document.getElementById("allstar-sessions-dialog-search")?.focus();
				}}
				className="flex max-h-[min(560px,calc(100dvh-4rem))] max-w-[min(520px,calc(100%-2rem))] flex-col gap-3 overflow-hidden"
			>
				{/* head：首字母块 + 项目名 + 关闭；shrink-0 不参与列表滚动。 */}
				<div className="flex shrink-0 items-center gap-2">
					<span
						aria-hidden
						className={cn(
							"flex size-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-medium",
							projectAvatarStyle(card.projectName),
						)}
					>
						{projectInitial(card.projectName)}
					</span>
					<DialogTitle className="min-w-0 flex-1 truncate text-[13px] font-medium">
						{card.projectName}
					</DialogTitle>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={labels.sessionsDialogClose}
						onClick={model.onCloseSessions}
					>
						<span aria-hidden className="icon-[solar--close-linear] h-3.5 w-3.5" />
					</Button>
				</div>
				<DialogDescription className="sr-only">{labels.sessionsDialogDescription}</DialogDescription>

				{/* body-top：计数 + 搜索（占满余宽）+ 新建；head 与 top 都固定，只滚列表。 */}
				<div className="flex shrink-0 items-center gap-2">
					<span className="shrink-0 text-xs text-muted-foreground">{labels.sessionCount(card.totalSessions)}</span>
					<div className="relative min-w-0 flex-1">
						<span
							aria-hidden
							className="icon-[solar--magnifer-linear] absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40"
						/>
						<Input
							id="allstar-sessions-dialog-search"
							type="text"
							className="pl-8 text-[13px]"
							placeholder={labels.sessionsDialogSearchPlaceholder}
							value={keyword}
							onChange={(event) => setKeyword(event.currentTarget.value)}
						/>
					</div>
					<Button
						variant="primary"
						size="xs"
						className="shrink-0"
						onClick={() => {
							// 先关弹窗再跳转：返回版块首页时弹窗不残留（关键字随卸载一并清空）。
							model.onCloseSessions();
							model.onStartNewSession(card.cwd);
						}}
					>
						<span aria-hidden className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
						{labels.cardNewSession}
					</Button>
				</div>

				{/* body-list：平铺行；min-h-0 + overflow-y-auto 让滚动收敛在列表区。 */}
				<ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
					{visibleSessions.length === 0 ? (
						<li className="px-2 py-6 text-center text-xs text-muted-foreground">
							{labels.sessionsDialogNoResults}
						</li>
					) : (
						visibleSessions.map((session) => (
							<li key={session.path}>
								{/*
								 * 与卡片行同构：div role=button（行尾 ··· 占位是并列子节点，
								 * button 嵌 button 非法），点击/Enter 复用 onOpenSession 分派。
								 */}
								<div
									role="button"
									tabIndex={0}
									title={session.kind === "team" ? labels.teamSession : undefined}
									onClick={() => model.onOpenSession(card.cwd, session)}
									onKeyDown={(event) => {
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										model.onOpenSession(card.cwd, session);
									}}
									className="group/row flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
								>
									{session.kind === "team" && (
										<span
											aria-hidden
											className="icon-[solar--users-group-rounded-linear] h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
									)}
									<span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{session.title}</span>
									{/* SessionContextMenu 预留位（第三批）：纯视觉占位，不可聚焦不可点。 */}
									<span
										aria-hidden
										className="icon-[solar--menu-dots-bold] h-4 w-4 shrink-0 text-muted-foreground opacity-30 transition-opacity group-hover/row:opacity-100"
									/>
								</div>
							</li>
						))
					)}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
