// Modified by The Open Forge contributors.
import { cn } from "@vetta-org/ui";
import { useRef, type JSX, type ReactNode } from "react";
import { ScrollFade } from "../shared/ScrollFade";
import { ResizeHandle } from "./ResizeHandle";

/**
 * 列表 / 详情分屏里单侧的状态占位：加载、空、错误、降级共用同一个
 * 居中占位结构，标题 + 可选说明 + 可选操作（按钮由消费方给）。
 */
export interface SplitPaneState {
	readonly kind: "loading" | "empty" | "error" | "degraded";
	readonly title?: ReactNode;
	readonly description?: ReactNode;
	readonly action?: ReactNode;
}

export interface SplitDetailLayoutProps {
	/**
	 * 左列（列表）内容，放进底部渐隐的滚动区。
	 * 窄屏下详情打开时此列隐藏，详情独占整页。
	 */
	readonly list: ReactNode;
	/** 列表列顶部不随滚动收起的部分（标题、筛选、搜索），渲染在滚动区之上。 */
	readonly listHeader?: ReactNode;
	/**
	 * 右列（详情）。`undefined` 表示未打开——列表吃满整行，把手与详情列不渲染。
	 * 打开时宽度受控，由 `detailWidth` 指定。详情侧自带 header/body/footer 结构，
	 * 滚动由详情内部管理，本组件不再套渐隐。
	 */
	readonly detail?: ReactNode;
	/** 详情列当前宽度（px）。仅在 `detail` 存在时有意义。 */
	readonly detailWidth: number;
	readonly minDetailWidth?: number;
	readonly maxDetailWidth?: number;
	/** 拖拽过程中回传的绝对宽度（px），已按 min/max 收敛；父级据此更新 `detailWidth`。 */
	readonly onDetailWidthChange?: (width: number) => void;
	readonly onDetailResizeStart?: () => void;
	readonly onDetailResizeEnd?: (width: number) => void;
	/** 列表列的状态占位；非空时替代 `list` 渲染。 */
	readonly listState?: SplitPaneState | null;
	/** 详情列的状态占位；非空时替代 `detail` 渲染。 */
	readonly detailState?: SplitPaneState | null;
	readonly className?: string;
	readonly listClassName?: string;
	readonly detailClassName?: string;
}

const DEFAULT_MIN_DETAIL_WIDTH = 320;
const DEFAULT_MAX_DETAIL_WIDTH = 640;
/** 窄屏断点：容器宽度低于此值时详情独占整页（与上游 `3e161ba8e` 一致）。 */
const NARROW_BREAKPOINT = "@[780px]";

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function PaneStateView({ state }: { readonly state: SplitPaneState }): JSX.Element {
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
			{state.title ? (
				<p className="text-[13px] font-medium text-muted-foreground">{state.title}</p>
			) : null}
			{state.description ? (
				<p className="max-w-[32ch] text-[12px] leading-relaxed text-muted-foreground/70">
					{state.description}
				</p>
			) : null}
			{state.action ? <div className="mt-1">{state.action}</div> : null}
		</div>
	);
}

/**
 * 「列表 + 详情」分屏布局：详情打开时左右分栏，容器宽于 780px 时可拖动左缘
 * 把手调宽详情；窄于 780px 时详情独占整页（列表隐藏），关闭详情即回到列表。
 *
 * 宽度受控：组件只持有把手并把拖拽折算成绝对宽度回传，实际 `detailWidth`
 * state 由消费方持有，三个面板各自持久化互不干扰。列表/详情均可独立给
 * `listState`/`detailState` 占位（加载/空/错误/降级）。
 */
export function SplitDetailLayout({
	list,
	listHeader,
	detail,
	detailWidth,
	minDetailWidth = DEFAULT_MIN_DETAIL_WIDTH,
	maxDetailWidth = DEFAULT_MAX_DETAIL_WIDTH,
	onDetailWidthChange,
	onDetailResizeStart,
	onDetailResizeEnd,
	listState,
	detailState,
	className,
	listClassName,
	detailClassName,
}: SplitDetailLayoutProps): JSX.Element {
	const paneOpen = detail != null;
	// ResizeHandle 每次回调给的是「自上次回调以来的增量」，组件内对受控宽度做增量收敛。
	const liveWidth = useRef(detailWidth);
	liveWidth.current = detailWidth;

	const handleResize = (delta: number) => {
		const next = clamp(liveWidth.current + delta, minDetailWidth, maxDetailWidth);
		liveWidth.current = next;
		onDetailWidthChange?.(next);
	};
	const handleResizeEnd = () => {
		onDetailResizeEnd?.(liveWidth.current);
	};

	return (
		<div className={cn("@container flex h-full w-full flex-1 overflow-hidden", className)}>
			{/* 列表列：详情打开时给详情让出固定宽；窄屏下隐藏让详情独占。 */}
			<section
				className={cn(
					"min-w-0 flex-col",
					paneOpen
						? `hidden min-w-0 flex-1 ${NARROW_BREAKPOINT}:flex`
						: "flex flex-1",
					listClassName,
				)}
			>
				{listHeader ? <div className="shrink-0">{listHeader}</div> : null}
				{listState ? (
					<PaneStateView state={listState} />
				) : (
					<ScrollFade className="min-h-0 flex-1">{list}</ScrollFade>
				)}
			</section>
			{paneOpen ? (
				<section
					className={cn(
						"relative flex min-w-0 flex-col",
						// 窄屏独占整页（flex-1），≥780px 时回到受控定宽（flex-none + width）。
						`flex-1 ${NARROW_BREAKPOINT}:flex-none ${NARROW_BREAKPOINT}:shrink-0`,
						detailClassName,
					)}
					style={{ width: detailWidth }}
				>
					{/* 把手只在 ≥780px 可拖；窄屏详情独占整页，拖拽无意义。 */}
					<span className={cn("hidden", `${NARROW_BREAKPOINT}:block`)}>
						<ResizeHandle
							side="left"
							onResizeStart={onDetailResizeStart}
							onResize={handleResize}
							onResizeEnd={handleResizeEnd}
						/>
					</span>
					<div className="drag-region h-6 shrink-0" />
					{detailState ? (
						<PaneStateView state={detailState} />
					) : (
						<div className="flex min-h-0 flex-1 flex-col">{detail}</div>
					)}
				</section>
			) : null}
		</div>
	);
}
