import type { FormEvent, JSX, Ref } from "react";
import { BrowserLiveEditCard, type BrowserLiveEditCardProps } from "./BrowserLiveEditCard";

export interface BrowserPanelLabels {
	noSession: string;
	back: string;
	forward: string;
	stop: string;
	reload: string;
	addressPlaceholder: string;
	openExternal: string;
	empty: string;
	loading: string;
	failed: string;
	retry: string;
	picker: string;
	pickerActive: string;
	pickerHint: string;
}

export interface BrowserPanelViewProps {
	/** Null when the host has no bound workspace — show empty state. */
	workspaceId: string | null;
	labels: BrowserPanelLabels;
	address: string;
	canBack: boolean;
	canForward: boolean;
	loading: boolean;
	failed: boolean;
	hasPage: boolean;
	currentUrl: string;
	/** WebContentsView 占位矩形：宿主经它上报 bounds/可见性给主进程。 */
	hostRef: Ref<HTMLDivElement>;
	onAddressChange: (value: string) => void;
	onAddressSubmit: (event: FormEvent) => void;
	onBack: () => void;
	onForward: () => void;
	onStop: () => void;
	onReload: () => void;
	onOpenExternal: () => void;
	onRetry: () => void;
	pickerEnabled: boolean;
	pickerDisabled: boolean;
	onTogglePicker: () => void;
	/** 点选命中后的即时预览卡模型；undefined 时不渲染。 */
	liveEdit?: BrowserLiveEditCardProps;
}

function ToolbarButton({
	icon,
	title,
	disabled,
	pressed,
	onClick,
}: {
	icon: string;
	title: string;
	disabled?: boolean;
	pressed?: boolean;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			aria-pressed={pressed}
			disabled={disabled}
			onClick={onClick}
			className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted-foreground/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
				pressed ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
			}`}
		>
			<span className={`${icon} h-4 w-4`} />
		</button>
	);
}

/**
 * Session-scoped built-in browser shell. Host owns webview event wiring via ref.
 */
export function BrowserPanelView({
	workspaceId,
	labels,
	address,
	canBack,
	canForward,
	loading,
	failed,
	hasPage,
	currentUrl,
	hostRef,
	onAddressChange,
	onAddressSubmit,
	onBack,
	onForward,
	onStop,
	onReload,
	onOpenExternal,
	onRetry,
	pickerEnabled,
	pickerDisabled,
	onTogglePicker,
	liveEdit,
}: BrowserPanelViewProps): JSX.Element {
	if (!workspaceId) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[12px] text-muted-foreground/60">
				{labels.noSession}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-1.5 py-1.5">
				<ToolbarButton icon="icon-[mdi--arrow-left]" title={labels.back} disabled={!canBack} onClick={onBack} />
				<ToolbarButton
					icon="icon-[mdi--arrow-right]"
					title={labels.forward}
					disabled={!canForward}
					onClick={onForward}
				/>
				{loading ? (
					<ToolbarButton icon="icon-[mdi--close]" title={labels.stop} onClick={onStop} />
				) : (
					<ToolbarButton icon="icon-[mdi--refresh]" title={labels.reload} onClick={onReload} />
				)}
				<form onSubmit={onAddressSubmit} className="min-w-0 flex-1">
					<input
						type="text"
						value={address}
						spellCheck={false}
						placeholder={labels.addressPlaceholder}
						onChange={(e) => onAddressChange(e.target.value)}
						className="h-7 w-full rounded-md border border-transparent bg-transparent px-2.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background"
					/>
				</form>
				{/* 原生 view 盖在 DOM 之上，加载徽标只能待在工具栏区，不能再悬浮页面上。 */}
				{loading ? (
					<span className="flex shrink-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">
						<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						{labels.loading}
					</span>
				) : null}
				<ToolbarButton
					icon="icon-[mdi--cursor-default-click-outline]"
					title={pickerEnabled ? labels.pickerActive : labels.picker}
					disabled={pickerDisabled}
					pressed={pickerEnabled}
					onClick={onTogglePicker}
				/>
				<ToolbarButton
					icon="icon-[mdi--open-in-new]"
					title={labels.openExternal}
					disabled={!currentUrl}
					onClick={onOpenExternal}
				/>
			</div>
			{pickerEnabled ? (
				<div className="min-w-0 shrink-0 border-b border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
					{labels.pickerHint}
				</div>
			) : null}

			<div className="relative flex min-h-0 min-w-0 flex-1">
				{/* TASK-0072：guest 已迁为主进程 WebContentsView；此占位矩形只做
				    bounds/可见性上报，页面由主进程 view 覆盖绘制在本区域上。 */}
				<div ref={hostRef} data-browser-view-host="" className="h-full w-full" />
				{!hasPage && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-6 text-center">
						<span className="icon-[mdi--web] h-8 w-8 text-muted-foreground/30" />
						<span className="text-[12px] text-muted-foreground/60">{labels.empty}</span>
					</div>
				)}
				{failed && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
						<span className="icon-[mdi--alert-circle-outline] h-8 w-8 text-muted-foreground/40" />
						<span className="text-[12px] text-muted-foreground/70">{labels.failed}</span>
						<button
							type="button"
							onClick={onRetry}
							className="rounded-md border border-border bg-background px-3 py-1 text-[12px] text-foreground transition-colors hover:bg-muted-foreground/10"
						>
							{labels.retry}
						</button>
					</div>
				)}
			</div>
			{liveEdit ? (
				<div className="max-h-[min(42%,18rem)] min-w-0 shrink-0 overflow-y-auto border-t border-border/60 px-2.5 py-2">
					<BrowserLiveEditCard {...liveEdit} />
				</div>
			) : null}
		</div>
	);
}
