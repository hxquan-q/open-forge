// Modified by The Open Forge contributors.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@vetta-org/ui";
import type { MemoryListItem } from "@/shared/memory";
import { useMemoryListModel, type MemoryScopeTab } from "./useMemoryListModel";

/**
 * 记忆管理页面（TASK-0377）：壳先行（加载/空/失败态），模式选择、
 * 范围切换、搜索（降级标注）、详情（历史+来源）、纠正（冲突态）、
 * 忘记（确认+来源处理登记）。全部文案走 i18n；键盘可达（原生按钮）。
 */
export function MemoryPage() {
	const { t } = useTranslation("memory");
	const model = useMemoryListModel();
	const [correctTarget, setCorrectTarget] = useState<MemoryListItem | null>(null);
	const [correctContent, setCorrectContent] = useState("");
	const [correctSaving, setCorrectSaving] = useState(false);
	const [correctConflict, setCorrectConflict] = useState(false);
	const [forgetTarget, setForgetTarget] = useState<MemoryListItem | null>(null);
	const [forgetAlsoSources, setForgetAlsoSources] = useState(false);

	const scopeTabs: readonly { key: MemoryScopeTab; label: string }[] = [
		{ key: "all", label: t("scope.all") },
		{ key: "user", label: t("scope.user") },
		{ key: "project", label: t("scope.project") },
	];

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
			<header>
				<h1 className="text-xl font-semibold">{t("title")}</h1>
				<p className="text-sm text-muted-foreground">{t("subtitle")}</p>
			</header>

			<section aria-label={t("mode.label")} className="flex items-center gap-2">
				{(["off", "explicit", "automatic"] as const).map((mode) => (
					<Button
						key={mode}
						variant={model.policy?.mode === mode ? "default" : "outline"}
						size="sm"
						disabled={model.modeSaving || model.policy === null}
						onClick={() => void model.setMode({ mode })}
						aria-pressed={model.policy?.mode === mode}
					>
						{t(`mode.${mode}`)}
					</Button>
				))}
				{model.modeSaving ? <span className="text-xs text-muted-foreground">{t("mode.saving")}</span> : null}
				{model.policyError ? <span className="text-xs text-destructive">{t("policy.error")}</span> : null}
				{model.policy === null && !model.policyError ? (
					<span className="text-xs text-muted-foreground">{t("policy.loading")}</span>
				) : null}
			</section>

			<section className="flex items-center gap-2">
				{scopeTabs.map((tab) => (
					<Button
						key={tab.key}
						variant={model.scope === tab.key ? "secondary" : "ghost"}
						size="sm"
						onClick={() => model.setScope(tab.key)}
						aria-pressed={model.scope === tab.key}
					>
						{tab.label}
					</Button>
				))}
				<input
					className="ml-2 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm"
					placeholder={t("search.placeholder")}
					value={model.query}
					onChange={(event) => model.setQuery(event.target.value)}
					aria-label={t("search.placeholder")}
				/>
			</section>

			{model.degraded ? <p className="text-xs text-muted-foreground">{t("search.degraded")}</p> : null}

			<section aria-busy={model.loading} className="flex-1 space-y-2">
				{model.loading ? <p className="text-sm text-muted-foreground">{t("list.loading")}</p> : null}
				{!model.loading && model.error ? (
					<div className="flex items-center gap-2">
						<span className="text-sm text-destructive">{t("list.error")}</span>
						<Button size="sm" variant="outline" onClick={model.retry}>
							{t("list.retry")}
						</Button>
					</div>
				) : null}
				{!model.loading && !model.error && model.items.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{model.query.trim() === "" ? t("list.empty") : t("search.empty")}
					</p>
				) : null}
				{model.items.map((item) => (
					<article
						key={`${item.memoryId}-${item.revisionId}`}
						className="rounded-lg border p-3"
						data-testid="memory-item"
					>
						<div className="flex items-start justify-between gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-auto flex-1 justify-start whitespace-normal text-left"
								onClick={() => void model.openDetail(item.memoryId)}
							>
								{item.pinned ? <span className="mr-1 text-xs">{t("list.pinned")}</span> : null}
								{item.content}
								<span className="ml-2 text-xs text-muted-foreground">
									{t(`list.evidence.${item.evidence}` as "list.evidence.claimed") as string}
								</span>
							</Button>
							<div className="flex shrink-0 gap-1">
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setCorrectTarget(item);
										setCorrectContent(item.content);
										setCorrectConflict(false);
									}}
								>
									{t("correct.action")}
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setForgetTarget(item);
										setForgetAlsoSources(false);
									}}
								>
									{t("forget.action")}
								</Button>
							</div>
						</div>
					</article>
				))}
				{model.hasMore && !model.loading ? (
					<Button size="sm" variant="ghost" onClick={model.loadMore}>
						{t("list.loadMore")}
					</Button>
				) : null}
			</section>

			{model.detail ? (
				<section className="rounded-lg border p-4" aria-label={t("detail.title")} data-testid="memory-detail">
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-sm font-semibold">{t("detail.title")}</h2>
						<Button size="sm" variant="ghost" onClick={model.closeDetail}>
							✕
						</Button>
					</div>
					{model.detail.loading ? <p className="text-sm text-muted-foreground">{t("list.loading")}</p> : null}
					{model.detail.error ? <p className="text-sm text-destructive">{model.detail.error}</p> : null}
					{!model.detail.loading && !model.detail.error ? (
						<>
							<h3 className="text-xs font-semibold uppercase text-muted-foreground">{t("detail.revisions")}</h3>
							<ol className="mt-1 space-y-1">
								{model.detail.revisions.map((revision) => (
									<li key={revision.revisionNo} className="text-sm">
										#{revision.revisionNo} {revision.content}
										<span className="ml-1 text-xs text-muted-foreground">{revision.status}</span>
									</li>
								))}
							</ol>
							<h3 className="mt-3 text-xs font-semibold uppercase text-muted-foreground">{t("detail.sources")}</h3>
							{model.detail.sources.length === 0 ? (
								<p className="text-sm text-muted-foreground">{t("detail.noSources")}</p>
							) : (
								<ul className="mt-1 space-y-1">
									{model.detail.sources.map((source) => (
										<li key={source.sourceId} className="truncate text-xs text-muted-foreground">
											{source.sourceId}（{source.role}）
										</li>
									))}
								</ul>
							)}
						</>
					) : null}
				</section>
			) : null}

			{correctTarget ? (
				<section className="rounded-lg border p-4" aria-label={t("correct.title")} data-testid="memory-correct">
					<h2 className="text-sm font-semibold">{t("correct.title")}</h2>
					<label className="mt-2 block text-xs text-muted-foreground" htmlFor="memory-correct-content">
						{t("correct.contentLabel")}
					</label>
					<textarea
						id="memory-correct-content"
						className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm"
						rows={3}
						value={correctContent}
						onChange={(event) => setCorrectContent(event.target.value)}
					/>
					{correctConflict ? <p className="mt-1 text-sm text-destructive">{t("correct.conflict")}</p> : null}
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							disabled={correctSaving || correctContent.trim() === ""}
							onClick={async () => {
								if (!correctTarget) return;
								setCorrectSaving(true);
								setCorrectConflict(false);
								try {
									await model.correct({
										memoryId: correctTarget.memoryId,
										expectedRevision: model.detail?.revisions.length ?? 1,
										content: correctContent,
									});
									setCorrectTarget(null);
								} catch {
									setCorrectConflict(true);
								} finally {
									setCorrectSaving(false);
								}
							}}
						>
							{correctSaving ? t("correct.saving") : t("correct.submit")}
						</Button>
						<Button size="sm" variant="outline" onClick={() => setCorrectTarget(null)}>
							{t("correct.cancel")}
						</Button>
					</div>
				</section>
			) : null}

			{forgetTarget ? (
				<section className="rounded-lg border p-4" aria-label={t("forget.title")} data-testid="memory-forget">
					<h2 className="text-sm font-semibold">{t("forget.title")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("forget.description")}</p>
					<label className="mt-2 flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={forgetAlsoSources}
							onChange={(event) => setForgetAlsoSources(event.target.checked)}
						/>
						{t("forget.alsoProcessSources")}
					</label>
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							variant="destructive"
							onClick={async () => {
								if (!forgetTarget) return;
								await model.forget(forgetTarget.memoryId, forgetAlsoSources);
								setForgetTarget(null);
							}}
						>
							{t("forget.confirm")}
						</Button>
						<Button size="sm" variant="outline" onClick={() => setForgetTarget(null)}>
							{t("forget.cancel")}
						</Button>
					</div>
				</section>
			) : null}
		</div>
	);
}
