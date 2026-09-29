import { SegmentedControl } from "@vetta-org/theme-ui/shared";
import { Button } from "@vetta-org/ui";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CapabilitiesTour } from "@shared/tour";
import { SettingsAiAssist } from "../../settings/ai-assist";
import { useAbilityText } from "../hooks/useAbilityText";
import { resolveCategoryLabel } from "../lib/ability-presentation";
import {
	ABILITY_CATEGORY_CONNECTORS,
	ABILITY_CATEGORY_UNCATEGORIZED,
	ABILITY_CATEGORY_VETTA_BUILTIN,
	ENABLE_ABILITY_CATEGORIES,
	type AbilitiesModel,
	type AbilityScope,
} from "../types";
import { AbilityCard } from "./AbilityCard";
import { AbilityIcon } from "./AbilityIcon";
import { AbilityMcpDialogs } from "./AbilityMcpDialogs";
import { AddAbilityMenu } from "./AddAbilityMenu";
import { MarketplaceSourcesDialog } from "./MarketplaceSourcesDialog";

const easeOut = [0.22, 1, 0.36, 1] as const;

export interface AbilitiesPageViewProps {
	model: AbilitiesModel;
	onOpenAbilityDetail: (detailId: string) => void;
	/** 是否按分类展示；缺省由代码级常量 ENABLE_ABILITY_CATEGORIES 控制。 */
	categorized?: boolean;
}

export function AbilitiesPageView({
	model,
	onOpenAbilityDetail,
	categorized = ENABLE_ABILITY_CATEGORIES,
}: AbilitiesPageViewProps): JSX.Element {
	const { t, i18n } = useTranslation("abilities");
	const skillFileInputRef = useRef<HTMLInputElement>(null);
	const pluginFileInputRef = useRef<HTMLInputElement>(null);
	const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);
	const reduceMotion = useReducedMotion();
	const resolveAbilityText = useAbilityText();
	const installedCount = model.allItems.filter((item) => item.installed).length;
	const attentionItems = model.allItems.filter(
		(item) => item.installed && (item.needsUpdate || item.setupRequired) && !item.busy,
	);
	const visibleAttentionItems = attentionItems.slice(0, 3);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<input
				ref={skillFileInputRef}
				type="file"
				accept=".zip,.tar.gz,.tgz,application/zip,application/gzip,application/x-gzip"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) model.importSkillArchive(file);
				}}
			/>
			<input
				ref={pluginFileInputRef}
				type="file"
				accept=".vettapkg,application/vnd.vetta.plugin+zip,.zip,application/zip"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) model.importPluginArchive(file);
				}}
			/>

			<div className="relative shrink-0 px-8 pt-1 pb-3 max-sm:px-4" data-tour="capabilities-banner">
				<motion.div
					className="mx-auto flex w-full max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between"
					initial={reduceMotion ? false : { opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: easeOut }}
				>
					<div className="min-w-0">
						<div className="mb-1.5 flex items-center gap-2">
							<span className="h-px w-5 bg-primary/70" aria-hidden="true" />
							<span className="text-[10px] font-semibold tracking-[0.16em] text-primary/80">
								{t("page.kicker")}
							</span>
						</div>
						<h1 className="text-[28px] font-bold leading-none tracking-[-0.045em] text-foreground sm:text-[32px]">
							{t("page.title")}
						</h1>
						<p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
							{t("page.subtitle")}
						</p>
					</div>
					<div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
						<div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
							<span className="inline-flex items-center gap-1.5">
								<span className="icon-[solar--widget-2-linear] size-3.5" aria-hidden="true" />
								{t("page.stampInstalled", { count: installedCount })}
							</span>
							<span className="h-3 w-px bg-border" aria-hidden="true" />
							<span className="font-mono tabular-nums text-foreground/80">
								{t("page.stampTotal", { count: model.allItems.length })}
							</span>
						</div>
						<SettingsAiAssist tabId="mcp" />
					</div>
				</motion.div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pt-4 pb-8 [scrollbar-gutter:stable] max-sm:px-4">
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
					{attentionItems.length > 0 && (
						<section
							aria-labelledby="abilities-attention-title"
							className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/40"
						>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
								<div className="flex shrink-0 items-center gap-2">
									<span className="icon-[solar--bell-bing-linear] size-4 text-amber-400" aria-hidden="true" />
									<h2 id="abilities-attention-title" className="text-[12px] font-semibold text-foreground">
										{t("attention.title")}
									</h2>
									<span className="font-mono text-[11px] tabular-nums text-amber-400">
										{attentionItems.length}
									</span>
								</div>
								<div className="flex min-w-0 flex-1 flex-wrap gap-2">
									{visibleAttentionItems.map((item) => {
										const text = resolveAbilityText(item);
										return (
											<button
												key={item.id}
												type="button"
												onClick={() => onOpenAbilityDetail(item.id)}
												className="group inline-flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-background/60 py-1.5 pr-2.5 pl-1.5 text-left transition-colors hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
												aria-label={t("attention.open", {
													name: text.title,
													status: t(
														item.needsUpdate && item.setupRequired
															? "attention.updateAndSetup"
															: item.needsUpdate
																? "status.updateAvailable"
																: "status.setupRequired",
													),
												})}
												title={text.title}
											>
												<AbilityIcon
													icon={item.icon}
													type={item.type}
													className="size-7 rounded-md border-0 bg-amber-500/15 text-amber-400"
													iconClassName="size-4"
												/>
												<span className="flex min-w-0 flex-col">
													<span className="max-w-36 truncate text-[11px] font-medium text-foreground">{text.title}</span>
													<span className="text-[10px] text-amber-400">
														{t(item.needsUpdate && item.setupRequired ? "attention.updateAndSetup" : item.needsUpdate ? "status.updateAvailable" : "status.setupRequired")}
													</span>
												</span>
											</button>
										);
									})}
									{attentionItems.length > visibleAttentionItems.length && (
										<span className="self-center text-[11px] text-muted-foreground">
											{t("attention.overflow", { count: attentionItems.length - visibleAttentionItems.length })}
										</span>
									)}
								</div>
							</div>
						</section>
					)}

					<div className="flex flex-wrap items-center justify-between gap-3">
						<div data-tour="capabilities-search-add" className="flex min-w-0 flex-wrap items-center gap-2">
							<div className="relative w-56 shrink-0 max-sm:w-full">
								<span className="icon-[solar--magnifer-linear] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
								<input
									type="text"
									placeholder={t("search.placeholder")}
									value={model.searchQuery}
									onChange={(event) => model.setSearchQuery(event.target.value)}
									className="h-8 w-full rounded-lg bg-secondary pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 transition-colors hover:bg-accent focus:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
								/>
							</div>
							<AddAbilityMenu
								importing={model.importing}
								onImportSkill={() => {
									model.setScope("mine");
									skillFileInputRef.current?.click();
								}}
								onImportPlugin={() => {
									model.setScope("mine");
									pluginFileInputRef.current?.click();
								}}
								onAddMcp={() => {
									model.setScope("mine");
									model.startAddManualMcp();
								}}
							/>
						</div>
						<div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between">
							<div className="flex items-center gap-1">
								<Button variant="ghost" size="sm" onClick={() => setSourcesDialogOpen(true)}>
									<span className="icon-[mdi--github] h-3.5 w-3.5" aria-hidden="true" />
									{t("sources.trigger")}
								</Button>
								<Button variant="ghost" size="sm" disabled={model.refreshing} onClick={model.refresh}>
									<span
										className={`icon-[solar--refresh-linear] h-3.5 w-3.5 ${model.refreshing ? "animate-spin" : ""}`}
										aria-hidden="true"
									/>
									{t("actions.refresh")}
								</Button>
							</div>
							<div data-tour="capabilities-scope">
								<SegmentedControl
									items={[
										{ key: "discover" as AbilityScope, label: t("scope.discover") },
										{ key: "mine" as AbilityScope, label: t("scope.mine") },
									]}
									value={model.scope}
									onChange={model.setScope}
								/>
							</div>
						</div>
					</div>

					{model.errors.length > 0 && (
						<div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground/70">
							<span className="icon-[solar--info-circle-linear] mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span>{t("error.partial", { error: model.errors.join(" / ") })}</span>
						</div>
					)}
					<div data-tour="capabilities-list">
						{model.loading ? (
							<div className="flex min-h-52 flex-col items-center justify-center gap-2 text-muted-foreground/60">
								<span className="icon-[solar--refresh-linear] h-8 w-8 animate-spin" aria-hidden="true" />
								<span className="text-[12px]">{t("loading")}</span>
							</div>
						) : model.items.length === 0 ? (
							<div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card/30 text-center">
								<span className="icon-[solar--magic-stick-3-linear] h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
								<div>
									<p className="text-[13px] font-semibold text-foreground">
										{model.searchQuery
										? t("empty.noMatch")
										: model.scope === "discover" || (model.scope as string) === "public"
											? t("empty.discover")
											: t("empty.mine")}
									</p>
									<p className="mt-1 text-[11px] text-muted-foreground/60">
										{model.searchQuery ? t("empty.noMatchHint") : t("empty.hint")}
									</p>
								</div>
							</div>
						) : (
							<div className="flex flex-col gap-6">
								{categorized ? (
									model.groups.map((group) => (
										<section key={group.category} className="flex flex-col gap-2">
											<div className="flex items-baseline gap-2">
												<h2 className="text-[13px] font-semibold text-foreground/90">
													{group.category === ABILITY_CATEGORY_UNCATEGORIZED
														? t("group.uncategorized")
														: group.category === ABILITY_CATEGORY_CONNECTORS
															? t("group.connectors")
															: group.category === ABILITY_CATEGORY_VETTA_BUILTIN
																? t("group.vettaBuiltin")
																: resolveCategoryLabel(group.category, group.categoryI18n, i18n.language)}
												</h2>
												<span className="text-[11px] tabular-nums text-muted-foreground/50">
													{group.items.length}
												</span>
											</div>
											<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
												{group.items.map((item) => (
													<AbilityCard key={item.id} item={item} model={model} />
												))}
											</div>
										</section>
									))
								) : (
									<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
										{model.items.map((item) => (
											<AbilityCard key={item.id} item={item} model={model} />
										))}
									</div>
								)}
								{model.hasMore && (
									<div className="flex justify-center pt-2">
										<Button variant="secondary" size="sm" onClick={model.loadMore}>
											{t("actions.loadMore", { remaining: model.totalItems - model.items.length })}
										</Button>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			<AbilityMcpDialogs mcp={model.mcp} />
			{sourcesDialogOpen && (
				<MarketplaceSourcesDialog
					sources={model.marketplaceSources}
					catalog={model.marketplaceCatalog}
					refreshing={model.refreshing}
					onRefresh={model.refreshMarketplaceSource}
					onAdd={async (input) => {
						await model.addMarketplaceSource(input);
						model.setScope("discover");
					}}
					onUpdate={model.updateMarketplaceSource}
					onRemove={model.removeMarketplaceSource}
					onClearCredential={model.clearMarketplaceSourceCredential}
					onClose={() => setSourcesDialogOpen(false)}
				/>
			)}
			<CapabilitiesTour />
		</div>
	);
}
