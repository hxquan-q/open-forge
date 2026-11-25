// Modified by The Open Forge contributors.
import { cn } from "@vetta-org/ui";
import type { JSX, ReactNode } from "react";
import { SplitDetailLayout, type SplitPaneState } from "../layout/SplitDetailLayout";
import { SegmentedControl } from "../shared/SegmentedControl";

export interface MemorySegmentItem<T extends string> {
	readonly key: T;
	readonly label: string;
}

export interface MemoryPageViewLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly modeLabel: string;
	readonly searchPlaceholder: string;
}

export interface MemoryPageViewProps<Mode extends string, Scope extends string> {
	readonly labels: MemoryPageViewLabels;
	readonly modeItems: readonly MemorySegmentItem<Mode>[];
	readonly activeMode: Mode | null;
	readonly onModeChange: (mode: Mode) => void;
	readonly modeBusy?: boolean;
	readonly scopeItems: readonly MemorySegmentItem<Scope>[];
	readonly activeScope: Scope;
	readonly onScopeChange: (scope: Scope) => void;
	readonly searchValue: string;
	readonly onSearchChange: (value: string) => void;
	/** 记忆条目列表（行由消费方渲染）。 */
	readonly list: ReactNode;
	readonly listState?: SplitPaneState | null;
	/** 详情分屏内容；不传则不打开。 */
	readonly detail?: ReactNode;
	readonly detailState?: SplitPaneState | null;
	readonly detailWidth: number;
	readonly minDetailWidth?: number;
	readonly maxDetailWidth?: number;
	readonly onDetailWidthChange?: (width: number) => void;
	readonly onDetailResizeStart?: () => void;
	readonly onDetailResizeEnd?: (width: number) => void;
	/** 降级搜索/遗忘结果等提示条，渲染在列表滚动区上方。 */
	readonly notices?: ReactNode;
	/** 纠正/忘记面板，渲染在列表列底部（原位浮层）。 */
	readonly overlay?: ReactNode;
}

/** 记忆管理页：标题 + 模式/范围分段 + 搜索，左侧列表、右侧详情分屏。 */
export function MemoryPageView<Mode extends string, Scope extends string>({
	labels,
	modeItems,
	activeMode,
	onModeChange,
	modeBusy,
	scopeItems,
	activeScope,
	onScopeChange,
	searchValue,
	onSearchChange,
	list,
	listState,
	detail,
	detailState,
	detailWidth,
	minDetailWidth,
	maxDetailWidth,
	onDetailWidthChange,
	onDetailResizeStart,
	onDetailResizeEnd,
	notices,
	overlay,
}: MemoryPageViewProps<Mode, Scope>): JSX.Element {
	const paneOpen = detail !== undefined && detailState === undefined;
	const column = cn("w-full", paneOpen ? "px-5" : "mx-auto max-w-3xl px-8");

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex min-h-0 flex-1 flex-col pb-8">
				<SplitDetailLayout
					className="min-h-0 flex-1"
					listHeader={
						<div className={cn("flex flex-col gap-4 pb-4 pt-8", column)}>
							<header>
								<h1 className="text-[20px] font-semibold leading-7 text-foreground">{labels.title}</h1>
								<p className="mt-1 text-[13px] text-muted-foreground">{labels.subtitle}</p>
							</header>
							<section aria-label={labels.modeLabel} className="flex items-center gap-3">
								<span className="text-[12px] text-muted-foreground">{labels.modeLabel}</span>
								<SegmentedControl
									items={modeItems.map((item) => ({ key: item.key, label: item.label }))}
									value={activeMode ?? modeItems[0]?.key}
									onChange={onModeChange}
									suppressLayoutAnimation={modeBusy || activeMode === null}
								/>
							</section>
							<section className="flex items-center gap-3">
								<SegmentedControl
									items={scopeItems.map((item) => ({ key: item.key, label: item.label }))}
									value={activeScope}
									onChange={onScopeChange}
								/>
								<div className="relative flex-1">
									<span
										aria-hidden="true"
										className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
									/>
									<input
										value={searchValue}
										onChange={(event) => onSearchChange(event.target.value)}
										placeholder={labels.searchPlaceholder}
										aria-label={labels.searchPlaceholder}
										className="h-8 w-full rounded-lg bg-secondary pl-8 pr-3 text-[12px] text-foreground transition-colors placeholder:text-muted-foreground/40 hover:bg-accent focus:bg-accent focus:outline-none"
									/>
								</div>
							</section>
							{notices}
						</div>
					}
					list={<div className={cn("flex flex-col gap-2 pb-6", column)}>{list}</div>}
					listState={listState ?? undefined}
					detail={detail}
					detailState={detailState ?? undefined}
					detailWidth={detailWidth}
					minDetailWidth={minDetailWidth}
					maxDetailWidth={maxDetailWidth}
					onDetailWidthChange={onDetailWidthChange}
					onDetailResizeStart={onDetailResizeStart}
					onDetailResizeEnd={onDetailResizeEnd}
				/>
				{overlay ? <div className={cn("mt-2 shrink-0", column)}>{overlay}</div> : null}
			</div>
		</div>
	);
}
