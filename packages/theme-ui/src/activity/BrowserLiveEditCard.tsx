import { type FormEvent, type JSX, useRef } from "react";

/** 卡片内所有用户可见文案由宿主经 i18n 提供。 */
export interface BrowserLiveEditLabels {
	title: string;
	textPlaceholder: string;
	applyText: string;
	styleProperty: string;
	styleValuePlaceholder: string;
	applyStyle: string;
	edits: string;
	revertOne: string;
	revertAll: string;
	send: string;
	comment: string;
	commentPlaceholder: string;
	discard: string;
	stale: string;
	failed: string;
}

export interface BrowserLiveEditEntryView {
	readonly kind: "style" | "text";
	readonly property?: string;
	readonly before: string;
	readonly after: string;
	readonly target?: string;
}

/** 点选命中后的即时预览卡：改动只作用于 WebView DOM，确认后随胶囊发给 Agent（不写源码）。 */
export interface BrowserLiveEditCardProps {
	title: string;
	target: string;
	edits: readonly BrowserLiveEditEntryView[];
	busy: boolean;
	hasElement: boolean;
	error: "stale_reference" | "apply_failed" | "unavailable" | null;
	styleProperties: readonly string[];
	labels: BrowserLiveEditLabels;
	onApplyText: (value: string) => void;
	onApplyStyle: (property: string, value: string) => void;
	onRevertEdit: (index: number) => void;
	onRevertAll: () => void;
	onSend: (comment: string) => void;
	onDiscard: () => void;
}

const truncate = (value: string, max = 24): string => (value.length > max ? `${value.slice(0, max)}…` : value);

function EditRow({
	entry,
	index,
	revertLabel,
	disabled,
	onRevert,
}: {
	entry: BrowserLiveEditEntryView;
	index: number;
	revertLabel: string;
	disabled: boolean;
	onRevert: (index: number) => void;
}): JSX.Element {
	const summary =
		entry.kind === "style"
			? `${entry.property}: ${truncate(entry.before || "∅")} → ${truncate(entry.after || "∅")}`
			: `${truncate(entry.before || "∅")} → ${truncate(entry.after || "∅")}`;
	return (
		<li className="flex items-center gap-1.5 rounded-md bg-muted-foreground/5 px-2 py-1">
			<span
				className={`h-3.5 w-3.5 shrink-0 ${entry.kind === "style" ? "icon-[mdi--palette-outline]" : "icon-[mdi--text]"} text-muted-foreground`}
			/>
			<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80" title={summary}>
				{summary}
			</span>
			<button
				type="button"
				title={revertLabel}
				aria-label={revertLabel}
				disabled={disabled}
				onClick={() => onRevert(index)}
				className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground disabled:opacity-30"
			>
				<span className="icon-[mdi--undo] h-3 w-3" />
			</button>
		</li>
	);
}

export function BrowserLiveEditCard({
	title,
	target,
	edits,
	busy,
	hasElement,
	error,
	styleProperties,
	labels,
	onApplyText,
	onApplyStyle,
	onRevertEdit,
	onRevertAll,
	onSend,
	onDiscard,
}: BrowserLiveEditCardProps): JSX.Element {
	const commentRef = useRef<HTMLTextAreaElement>(null);
	const sendComment = (): void => {
		onSend(commentRef.current?.value ?? "");
	};
	// 输入框非受控：草稿值属于瞬时 UI 态，随表单提交读取，不进 view model。
	const submitText = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const value = String(new FormData(event.currentTarget).get("text") ?? "");
		if (value) onApplyText(value);
		event.currentTarget.reset();
	};
	const submitStyle = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const property = String(data.get("property") ?? "");
		if (property) onApplyStyle(property, String(data.get("value") ?? ""));
		event.currentTarget.reset();
	};

	const errorText = error === "stale_reference" || !hasElement ? labels.stale : error ? labels.failed : null;

	return (
		<div
			data-browser-selection-bar=""
			className="pointer-events-auto flex w-full min-w-0 max-w-full flex-col gap-2"
		>
			<div className="flex min-w-0 items-center gap-1.5">
				<span className="icon-[mdi--cursor-default-click-outline] h-4 w-4 shrink-0 text-primary" />
				<span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground" title={target}>
					{title}
				</span>
				<button
					type="button"
					title={labels.discard}
					aria-label={labels.discard}
					disabled={busy}
					onClick={onDiscard}
					className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground disabled:opacity-30"
				>
					<span className="icon-[mdi--close] h-3.5 w-3.5" />
				</button>
			</div>
			<div className="truncate font-mono text-[10px] text-muted-foreground/70" title={target}>
				{target}
			</div>

			<label className="flex flex-col gap-1">
				<span className="text-[11px] text-muted-foreground">{labels.comment}</span>
				<textarea
					ref={commentRef}
					name="agentComment"
					rows={2}
					placeholder={labels.commentPlaceholder}
					aria-label={labels.comment}
					disabled={busy || !hasElement}
					autoFocus
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						sendComment();
					}}
					className="min-h-14 w-full resize-none rounded-md border border-border/60 bg-transparent px-2 py-1 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 disabled:opacity-40"
				/>
			</label>

			<form onSubmit={submitText} className="flex min-w-0 flex-wrap items-center gap-1.5">
				<input
					type="text"
					name="text"
					placeholder={labels.textPlaceholder}
					disabled={busy || !hasElement}
					className="h-7 min-w-0 flex-1 basis-24 rounded-md border border-border/60 bg-transparent px-2 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 disabled:opacity-40"
				/>
				<button
					type="submit"
					disabled={busy || !hasElement}
					className="h-7 shrink-0 rounded-md border border-border/60 px-2 text-[11px] text-foreground transition-colors hover:bg-muted-foreground/10 disabled:opacity-40"
				>
					{labels.applyText}
				</button>
			</form>

			<form onSubmit={submitStyle} className="flex min-w-0 flex-wrap items-center gap-1.5">
				<select
					name="property"
					defaultValue={styleProperties[0] ?? ""}
					disabled={busy || !hasElement}
					className="h-7 min-w-0 max-w-full flex-1 basis-24 rounded-md border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-primary/40 disabled:opacity-40"
					aria-label={labels.styleProperty}
				>
					{styleProperties.map((property) => (
						<option key={property} value={property}>
							{property}
						</option>
					))}
				</select>
				<input
					type="text"
					name="value"
					placeholder={labels.styleValuePlaceholder}
					disabled={busy || !hasElement}
					className="h-7 min-w-0 flex-1 basis-24 rounded-md border border-border/60 bg-transparent px-2 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 disabled:opacity-40"
				/>
				<button
					type="submit"
					disabled={busy || !hasElement}
					className="h-7 shrink-0 rounded-md border border-border/60 px-2 text-[11px] text-foreground transition-colors hover:bg-muted-foreground/10 disabled:opacity-40"
				>
					{labels.applyStyle}
				</button>
			</form>

			{errorText ? <div className="text-[11px] text-destructive">{errorText}</div> : null}

			{edits.length > 0 ? (
				<div className="flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<span className="text-[11px] text-muted-foreground">
							{labels.edits} ({edits.length})
						</span>
						<button
							type="button"
							disabled={busy}
							onClick={onRevertAll}
							className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
						>
							{labels.revertAll}
						</button>
					</div>
					<ul className="flex max-h-28 flex-col gap-1 overflow-y-auto">
						{edits.map((entry, index) => (
							<EditRow
								key={`${index}:${entry.kind}:${entry.property ?? ""}:${entry.after}`}
								entry={entry}
								index={index}
								revertLabel={labels.revertOne}
								disabled={busy}
								onRevert={onRevertEdit}
							/>
						))}
					</ul>
				</div>
			) : null}

			<div className="flex items-center justify-end gap-1.5 border-t border-border/40 pt-2">
				<button
					type="button"
					disabled={busy}
					onClick={onDiscard}
					className="h-7 rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted-foreground/10 hover:text-foreground disabled:opacity-40"
				>
					{labels.discard}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={sendComment}
					className="h-7 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
				>
					{labels.send}
				</button>
			</div>
		</div>
	);
}
