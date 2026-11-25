// Modified by The Open Forge contributors.
import { Button, cn } from "@vetta-org/ui";
import type { JSX, ReactNode } from "react";
import { SegmentedControl } from "../shared/SegmentedControl";
import { SplitDetailLayout } from "../layout/SplitDetailLayout";

export interface AutomationRecommendationItem {
	readonly id: string;
	readonly icon: string;
	readonly title: string;
	readonly description: string;
	readonly scheduleLabel: string;
}

export interface AutomationFilterTab<Key extends string = string> {
	readonly key: Key;
	readonly label: string;
}

export interface AutomationPageViewLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly create: string;
	readonly searchPlaceholder: string;
	/** Section heading above recommended templates when the user has no tasks. */
	readonly recommendTitle?: string;
	/** Optional CTA on each recommendation card. */
	readonly recommendUse?: string;
}

export interface AutomationPageViewProps<FilterKey extends string = string> {
	readonly labels: AutomationPageViewLabels;
	readonly filters: readonly AutomationFilterTab<FilterKey>[];
	readonly activeFilter: FilterKey;
	readonly onFilterChange: (key: FilterKey) => void;
	readonly searchValue: string;
	readonly onSearchChange: (value: string) => void;
	readonly onCreate: () => void;
	/** Optional trailing header actions (e.g. AI assist), rendered before the primary CTA. */
	readonly headerTrailing?: ReactNode;
	/** Task list (or its empty state). */
	readonly list: ReactNode;
	/** Recommended templates shown under the list when the user has no tasks. */
	readonly recommendations?: readonly AutomationRecommendationItem[];
	readonly onSelectRecommendation?: (id: string) => void;
	/** Right split pane (edit / create / history). The list narrows while it is open. */
	readonly detail?: ReactNode;
	readonly detailWidth: number;
	readonly minDetailWidth?: number;
	readonly maxDetailWidth?: number;
	readonly onDetailWidthChange?: (width: number) => void;
	readonly onDetailResizeStart?: () => void;
	readonly onDetailResizeEnd?: (width: number) => void;
}

/**
 * 自动化页：与能力页同样的大标题与说明；下方左列是可筛选、可搜索的任务列表，
 * 右侧是编辑与执行历史的分屏。刻意不用入场动画、毛玻璃与模糊，控制合成开销。
 */
export function AutomationPageView<FilterKey extends string>({
	labels,
	filters,
	activeFilter,
	onFilterChange,
	searchValue,
	onSearchChange,
	onCreate,
	headerTrailing,
	list,
	recommendations,
	onSelectRecommendation,
	detail,
	detailWidth,
	minDetailWidth,
	maxDetailWidth,
	onDetailWidthChange,
	onDetailResizeStart,
	onDetailResizeEnd,
}: AutomationPageViewProps<FilterKey>): JSX.Element {
	const paneOpen = detail != null;
	// 标题、切换、搜索与列表共用同一个容器：标题跟列表左边对齐，创建按钮跟列表右边对齐。
	const column = cn("w-full", paneOpen ? "px-5" : "mx-auto max-w-4xl px-8");
	return (
		<SplitDetailLayout
			className="flex-1"
			list={
				<>
					{list}
					{recommendations && recommendations.length > 0 ? (
						<AutomationRecommendations
							title={labels.recommendTitle}
							recommendUse={labels.recommendUse}
							recommendations={recommendations}
							onSelect={onSelectRecommendation}
						/>
					) : null}
				</>
			}
			listHeader={
				<>
					<div className="drag-region h-6 shrink-0" />
					<header className={cn(column, "flex shrink-0 items-end justify-between gap-4 pb-5")}>
						<div className="min-w-0">
							<h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
								{labels.title}
							</h1>
							<p className="mt-1 truncate text-[12px] text-muted-foreground/60">{labels.subtitle}</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{headerTrailing}
							<Button type="button" variant="primary" size="sm" onClick={onCreate}>
								<span className="icon-[mdi--plus] h-3.5 w-3.5" />
								{labels.create}
							</Button>
						</div>
					</header>
					<div className={cn(column, "flex shrink-0 flex-col gap-3")}>
						<SegmentedControl
							className="self-start"
							items={filters.map((filter) => ({ key: filter.key, label: filter.label }))}
							value={activeFilter}
							onChange={onFilterChange}
							suppressLayoutAnimation
						/>
						<label className="relative block">
							<span className="icon-[solar--magnifer-linear] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
							<input
								type="search"
								value={searchValue}
								onChange={(event) => onSearchChange(event.target.value)}
								placeholder={labels.searchPlaceholder}
								className="h-8 w-full rounded-lg bg-secondary pl-8 pr-3 text-[12px] text-foreground transition-colors placeholder:text-muted-foreground/40 hover:bg-accent focus:bg-accent focus:outline-none"
							/>
						</label>
					</div>
				</>
			}
			detail={detail}
			detailWidth={detailWidth}
			minDetailWidth={minDetailWidth}
			maxDetailWidth={maxDetailWidth}
			onDetailWidthChange={onDetailWidthChange}
			onDetailResizeStart={onDetailResizeStart}
			onDetailResizeEnd={onDetailResizeEnd}
		/>
	);
}

function AutomationRecommendations({
	title,
	recommendUse,
	recommendations,
	onSelect,
}: {
	readonly title?: string;
	readonly recommendUse?: string;
	readonly recommendations: readonly AutomationRecommendationItem[];
	readonly onSelect?: (id: string) => void;
}): JSX.Element {
	return (
		<div className="mt-6 flex flex-col gap-2">
			{title ? <p className="px-1 text-[12px] text-muted-foreground/70">{title}</p> : null}
			{recommendations.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => onSelect?.(item.id)}
					className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-card/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
				>
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15">
						<span className={`${item.icon} h-4 w-4 text-primary`} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[13px] font-semibold text-foreground">{item.title}</p>
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">{item.scheduleLabel}</p>
					</div>
					{recommendUse ? (
						<span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100">
							{recommendUse}
							<span className="icon-[mdi--arrow-right] h-3.5 w-3.5" />
						</span>
					) : null}
				</button>
			))}
		</div>
	);
}
