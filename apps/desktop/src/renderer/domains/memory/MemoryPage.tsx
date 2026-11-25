// Modified by The Open Forge contributors.
import { Button } from "@vetta-org/ui";
import { MemoryPageView } from "@vetta-org/theme-ui/scheduler";
import { useTranslation } from "react-i18next";
import type { MemoryListItem } from "@/shared/memory";
import { useMemoryPageModel } from "./useMemoryPageModel";
import type { MemoryScopeTab } from "./useMemoryListModel";

/**
 * 记忆管理页面（TASK-0377，TASK-0505 拆分）：壳先行（加载/空/失败态），
 * 模式与范围分段切换、搜索（降级标注）、右侧分屏详情（历史+来源）、
 * 纠正（冲突态）、忘记（确认+来源处理登记）。全部文案走 i18n。
 */
export function MemoryPage() {
	const { t } = useTranslation("memory");
	const model = useMemoryPageModel();
	const listModel = model.list;

	const scopeItems = (
		[
			{ key: "all", label: t("scope.all") },
			{ key: "user", label: t("scope.user") },
			{ key: "project", label: t("scope.project") },
		] as const
	).map((item) => ({ key: item.key, label: item.label }));

	const modeItems = (
		[
			{ key: "off", label: t("mode.off") },
			{ key: "explicit", label: t("mode.explicit") },
			{ key: "automatic", label: t("mode.automatic") },
		] as const
	).map((item) => ({ key: item.key, label: item.label }));

	const listState = listModel.loading
		? { kind: "loading" as const, title: t("list.loading") }
		: listModel.error
			? {
					kind: "error" as const,
					title: t("list.error"),
					action: (
						<Button size="sm" variant="outline" onClick={listModel.retry}>
							{t("list.retry")}
						</Button>
					),
				}
			: listModel.items.length === 0
				? {
						kind: "empty" as const,
						title: listModel.query.trim() === "" ? t("list.empty") : t("search.empty"),
					}
				: null;

	return (
		<MemoryPageView
			labels={{
				title: t("title"),
				subtitle: t("subtitle"),
				modeLabel: t("mode.label"),
				searchPlaceholder: t("search.placeholder"),
			}}
			modeItems={modeItems}
			activeMode={listModel.policy?.mode ?? null}
			onModeChange={model.setMode}
			modeBusy={listModel.modeSaving}
			scopeItems={scopeItems}
			activeScope={model.scope}
			onScopeChange={(scope: MemoryScopeTab) => model.setScope(scope)}
			searchValue={model.query}
			onSearchChange={model.setQuery}
			notices={
				<>
					{listModel.modeSaving ? (
						<p className="text-[12px] text-muted-foreground">{t("mode.saving")}</p>
					) : null}
					{listModel.policyError ? (
						<p className="text-[12px] text-destructive">{t("policy.error")}</p>
					) : null}
					{listModel.degraded ? (
						<p className="text-[12px] text-muted-foreground">{t("search.degraded")}</p>
					) : null}
				</>
			}
			list={
				<>
					{listModel.items.map((item) => (
						<MemoryRow
							key={`${item.memoryId}-${item.revisionId}`}
							item={item}
							pinnedLabel={t("list.pinned")}
							evidenceLabel={t(`list.evidence.${item.evidence}` as "list.evidence.claimed") as string}
							correctLabel={t("correct.action")}
							forgetLabel={t("forget.action")}
							isSelected={listModel.detail?.memoryId === item.memoryId}
							onOpen={() => void listModel.openDetail(item.memoryId)}
							onCorrect={() => model.openCorrect(item)}
							onForget={() => model.openForget(item)}
						/>
					))}
					{listModel.hasMore && !listModel.loading ? (
						<Button size="sm" variant="ghost" onClick={listModel.loadMore}>
							{t("list.loadMore")}
						</Button>
					) : null}
				</>
			}
			listState={listState}
			detail={
				listModel.detail ? (
					<MemoryDetail
						detail={listModel.detail}
						title={t("detail.title")}
						loadingLabel={t("list.loading")}
						revisionsLabel={t("detail.revisions")}
						sourcesLabel={t("detail.sources")}
						noSourcesLabel={t("detail.noSources")}
						onClose={listModel.closeDetail}
					/>
				) : undefined
			}
			detailWidth={model.detailWidth}
			onDetailWidthChange={model.setDetailWidth}
			overlay={
				model.overlay?.kind === "correct" ? (
					<section
						className="rounded-lg border p-4"
						aria-label={t("correct.title")}
						data-testid="memory-correct"
					>
						<h2 className="text-sm font-semibold">{t("correct.title")}</h2>
						<label className="mt-2 block text-xs text-muted-foreground" htmlFor="memory-correct-content">
							{t("correct.contentLabel")}
						</label>
						<textarea
							id="memory-correct-content"
							className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm"
							rows={3}
							value={model.correctContent}
							onChange={(event) => model.setCorrectContent(event.target.value)}
						/>
						{model.correctConflict ? (
							<p className="mt-1 text-sm text-destructive">{t("correct.conflict")}</p>
						) : null}
						<div className="mt-2 flex gap-2">
							<Button
								size="sm"
								disabled={model.correctSaving || model.correctContent.trim() === ""}
								onClick={() => void model.submitCorrect()}
							>
								{model.correctSaving ? t("correct.saving") : t("correct.submit")}
							</Button>
							<Button size="sm" variant="outline" onClick={model.closeOverlay}>
								{t("correct.cancel")}
							</Button>
						</div>
					</section>
				) : model.overlay?.kind === "forget" ? (
					<section
						className="rounded-lg border p-4"
						aria-label={t("forget.title")}
						data-testid="memory-forget"
					>
						<h2 className="text-sm font-semibold">{t("forget.title")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("forget.description")}</p>
						<label className="mt-2 flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={model.forgetAlsoSources}
								onChange={(event) => model.setForgetAlsoSources(event.target.checked)}
							/>
							{t("forget.alsoProcessSources")}
						</label>
						<div className="mt-2 flex gap-2">
							<Button
								size="sm"
								variant="destructive"
								disabled={model.forgetSaving}
								onClick={() => void model.submitForget()}
							>
								{t("forget.confirm")}
							</Button>
							<Button size="sm" variant="outline" onClick={model.closeOverlay}>
								{t("forget.cancel")}
							</Button>
						</div>
					</section>
				) : null
			}
		/>
	);
}

function MemoryRow({
	item,
	pinnedLabel,
	evidenceLabel,
	correctLabel,
	forgetLabel,
	isSelected,
	onOpen,
	onCorrect,
	onForget,
}: {
	readonly item: MemoryListItem;
	readonly pinnedLabel: string;
	readonly evidenceLabel: string;
	readonly correctLabel: string;
	readonly forgetLabel: string;
	readonly isSelected: boolean;
	readonly onOpen: () => void;
	readonly onCorrect: () => void;
	readonly onForget: () => void;
}): JSX.Element {
	return (
		<article className="rounded-lg border p-3" data-testid="memory-item" data-selected={isSelected || undefined}>
			<div className="flex items-start justify-between gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="h-auto flex-1 justify-start whitespace-normal text-left"
					onClick={onOpen}
				>
					{item.pinned ? <span className="mr-1 text-xs">{pinnedLabel}</span> : null}
					{item.content}
					<span className="ml-2 text-xs text-muted-foreground">{evidenceLabel}</span>
				</Button>
				<div className="flex shrink-0 gap-1">
					<Button size="sm" variant="outline" onClick={onCorrect}>
						{correctLabel}
					</Button>
					<Button size="sm" variant="outline" onClick={onForget}>
						{forgetLabel}
					</Button>
				</div>
			</div>
		</article>
	);
}

function MemoryDetail({
	detail,
	title,
	loadingLabel,
	revisionsLabel,
	sourcesLabel,
	noSourcesLabel,
	onClose,
}: {
	readonly detail: NonNullable<ReturnType<typeof useMemoryPageModel>["list"]["detail"]>;
	readonly title: string;
	readonly loadingLabel: string;
	readonly revisionsLabel: string;
	readonly sourcesLabel: string;
	readonly noSourcesLabel: string;
	readonly onClose: () => void;
}): JSX.Element {
	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="memory-detail">
			<header className="flex h-12 shrink-0 items-center gap-2 px-6">
				<span className="flex-1 truncate text-[13px] font-medium text-foreground">{title}</span>
				<Button size="sm" variant="ghost" onClick={onClose} aria-label={title}>
					✕
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">
				{detail.loading ? <p className="text-sm text-muted-foreground">{loadingLabel}</p> : null}
				{detail.error ? <p className="text-sm text-destructive">{detail.error}</p> : null}
				{!detail.loading && !detail.error ? (
					<>
						<h3 className="text-xs font-semibold uppercase text-muted-foreground">{revisionsLabel}</h3>
						<ol className="mt-1 space-y-1">
							{detail.revisions.map((revision) => (
								<li key={revision.revisionNo} className="text-sm">
									#{revision.revisionNo} {revision.content}
									<span className="ml-1 text-xs text-muted-foreground">{revision.status}</span>
								</li>
							))}
						</ol>
						<h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">{sourcesLabel}</h3>
						{detail.sources.length === 0 ? (
							<p className="text-sm text-muted-foreground">{noSourcesLabel}</p>
						) : (
							<ul className="mt-1 space-y-1">
								{detail.sources.map((source) => (
									<li key={source.sourceId} className="truncate text-xs text-muted-foreground">
										{source.sourceId}（{source.role}）
									</li>
								))}
							</ul>
						)}
					</>
				) : null}
			</div>
		</div>
	);
}
