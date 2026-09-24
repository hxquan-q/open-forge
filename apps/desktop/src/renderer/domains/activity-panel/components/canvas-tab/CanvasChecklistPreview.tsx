// Copyright The Open Forge contributors.
import type { JSX } from "react";
import type { CanvasChecklistSpec, CanvasChecklistStatus } from "../../services/canvas-checklist";

const STATUS_META: Record<CanvasChecklistStatus, { readonly icon: string; readonly tone: string }> = {
	done: { icon: "icon-[solar--check-circle-linear]", tone: "text-emerald-400" },
	active: { icon: "icon-[solar--hourglass-linear]", tone: "text-amber-400" },
	todo: { icon: "icon-[solar--minus-circle-linear]", tone: "text-muted-foreground/60" },
};

export interface CanvasChecklistLabels {
	readonly empty: string;
	readonly done: string;
	readonly active: string;
	readonly todo: string;
}

export function CanvasChecklistPreview({
	spec,
	labels,
}: {
	readonly spec: CanvasChecklistSpec;
	readonly labels: CanvasChecklistLabels;
}): JSX.Element {
	if (spec.items.length === 0) {
		return (
			<div
				className="flex flex-1 items-center justify-center px-6 py-8 text-[12px] text-muted-foreground"
				role="status"
			>
				{labels.empty}
			</div>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-auto px-4 py-3">
			{spec.title ? <h3 className="mb-2 text-[12px] font-medium text-foreground">{spec.title}</h3> : null}
			<ul className="space-y-1.5">
				{spec.items.map((item, index) => {
					const meta = STATUS_META[item.status];
					return (
						<li
							key={`${index}-${item.label}`}
							className="flex items-start gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2"
						>
							<span aria-hidden className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.icon} ${meta.tone}`} />
							<div className="min-w-0 flex-1">
								<p
									className={`text-[12px] ${
										item.status === "done" ? "text-muted-foreground line-through" : "text-foreground"
									}`}
								>
									{item.label}
								</p>
								{item.detail ? (
									<p className="mt-0.5 text-[11px] text-muted-foreground/70">{item.detail}</p>
								) : null}
							</div>
							<span className={`shrink-0 text-[11px] ${meta.tone}`}>{labels[item.status]}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
