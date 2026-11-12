// Copyright The Open Forge contributors.
import { useId } from "react";
import { Button, Switch } from "@vetta-org/ui";

export interface ComputerUseViewLabels {
	title: string;
	description: string;
	enable: string;
	unsupported: string;
	loading: string;
	session: string;
	noSession: string;
	grant: string;
	chat: string;
	pause: string;
	resume: string;
	stop: string;
	owner: string;
	noOwner: string;
	hiddenWindows: string;
	restore: string;
	restoreAll: string;
	noHidden: string;
	display: string;
	hideVetta: string;
	showVetta: string;
	topmost: string;
	shortcutHelp: string;
	shortcutsUnavailable: string;
	retry: string;
}
export interface ComputerUseViewModel {
	labels: ComputerUseViewLabels;
	supported: boolean;
	loading: boolean;
	pending: boolean;
	enabled: boolean;
	phase: string;
	error?: string;
	sessionLabel: string;
	ownerLabel: string;
	ownershipNotice?: string;
	canGrant: boolean;
	hasGrant: boolean;
	canResume: boolean;
	hiddenWindows: readonly { id: string; label: string }[];
	vettaHidden: boolean;
	topmost: boolean;
	shortcutsAvailable: boolean;
}
export interface ComputerUseViewActions {
	enable(enabled: boolean): void;
	grant(): void;
	chat(): void;
	pause(): void;
	resume(): void;
	stop(): void;
	restore(id: string): void;
	restoreAll(): void;
	display(value: { hidden?: boolean; topmost?: boolean }): void;
	retry(): void;
}

export function ComputerUseView({ model: m, actions: a }: { model: ComputerUseViewModel; actions: ComputerUseViewActions }) {
	const enableId = useId();
	const topmostId = useId();
	const l = m.labels;
	return <main className="h-full overflow-auto px-8 pb-8 pt-4">
		<div className="mx-auto flex max-w-3xl flex-col gap-5">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-2"><h1 className="text-[15px] font-medium">{l.title}</h1><p className="text-[13px] text-muted-foreground">{l.description}</p></div>
				<div className="flex shrink-0 items-center gap-3"><label htmlFor={enableId} className="text-xs">{l.enable}</label><Switch id={enableId} checked={m.enabled} onCheckedChange={a.enable} disabled={!m.supported || m.pending || m.loading} /></div>
			</header>
			{!m.supported && <p role="status" className="text-sm text-muted-foreground">{l.unsupported}</p>}
			<p role="status" aria-live="polite" className="text-sm">{m.loading ? l.loading : m.phase}</p>
			{m.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm"><span>{m.error}</span><Button variant="outline" size="sm" disabled={m.pending} onClick={a.retry}>{l.retry}</Button></div>}
			<section className="space-y-3" aria-label={l.session}>
				<h2 className="text-sm font-medium">{l.session}</h2>
				<p className="text-xs text-muted-foreground">{m.sessionLabel || l.noSession}</p>
				{m.ownershipNotice && <p role="note" className="text-sm">{m.ownershipNotice}</p>}
				<div className="flex flex-wrap gap-3"><Button variant="primary" disabled={!m.canGrant || m.pending} onClick={a.grant}>{l.grant}</Button><Button variant="outline" onClick={a.chat}>{l.chat}</Button></div>
			</section>
			<section className="space-y-3 border-t border-border/50 pt-5" aria-label={l.owner}>
				<h2 className="text-sm font-medium">{l.owner}</h2>
				<p className="text-[13px] text-muted-foreground">{m.ownerLabel || l.noOwner}</p>
				<div className="flex flex-wrap gap-3"><Button variant="outline" size="sm" disabled={!m.hasGrant || m.pending} onClick={a.pause}>{l.pause}</Button><Button variant="outline" size="sm" disabled={!m.canResume || m.pending} onClick={a.resume}>{l.resume}</Button><Button variant="outline" size="sm" disabled={!m.hasGrant && m.hiddenWindows.length === 0} onClick={a.stop}>{l.stop}</Button></div>
			</section>
			{m.hiddenWindows.length > 0 && <section className="space-y-3 border-t border-border/50 pt-5" aria-label={l.hiddenWindows}>
				<div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium">{l.hiddenWindows}</h2><Button size="sm" variant="outline" onClick={a.restoreAll} disabled={m.pending}>{l.restoreAll}</Button></div>
				<ul className="space-y-2">{m.hiddenWindows.map((window) => <li key={window.id} className="flex items-center justify-between gap-3"><span className="truncate text-[13px]" title={window.label}>{window.label}</span><Button variant="outline" size="sm" disabled={m.pending} onClick={() => a.restore(window.id)} aria-label={`${l.restore}: ${window.label}`}>{l.restore}</Button></li>)}</ul>
			</section>}
			<section className="space-y-3 border-t border-border/50 pt-5" aria-label={l.display}>
				<h2 className="text-sm font-medium">{l.display}</h2><div className="flex flex-wrap items-center gap-4"><Button variant="outline" size="sm" onClick={() => a.display({ hidden: !m.vettaHidden })}>{m.vettaHidden ? l.showVetta : l.hideVetta}</Button><label htmlFor={topmostId} className="text-xs">{l.topmost}</label><Switch id={topmostId} checked={m.topmost} onCheckedChange={(topmost) => a.display({ topmost })} /></div>
				<p className="text-xs text-muted-foreground">{l.shortcutHelp}</p>{!m.shortcutsAvailable && <p className="text-xs text-muted-foreground">{l.shortcutsUnavailable}</p>}
			</section>
		</div>
	</main>;
}
