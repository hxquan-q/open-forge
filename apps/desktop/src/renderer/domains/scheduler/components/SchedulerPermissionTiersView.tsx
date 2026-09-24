// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { Switch } from "@shared/components/ui/switch";
import type { SchedulerPermissionTiersModel } from "../hooks/useSchedulerPermissionTiersModel";

export function SchedulerPermissionTiersView({
	billingVeto,
	description,
	enableAllLabel,
	onEnableAll,
	onToggle,
	options,
	title,
}: SchedulerPermissionTiersModel): JSX.Element {
	return (
		<section className="space-y-3 rounded-lg border border-border/40 bg-background/30 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 space-y-1">
					<h3 className="text-[13px] font-medium text-foreground">{title}</h3>
					<p className="text-[12px] leading-relaxed text-muted-foreground">{description}</p>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onEnableAll}>
					{enableAllLabel}
				</Button>
			</div>
			<p className="rounded-md border border-border/50 bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
				{billingVeto}
			</p>
			<ul className="space-y-2">
				{options.map((option) => (
					<li
						key={option.key}
						className="flex items-start justify-between gap-3 rounded-md border border-border/30 bg-card/30 px-2.5 py-2"
					>
						<div className="min-w-0 space-y-0.5">
							<label htmlFor={`permission-tier-${option.key}`} className="text-[12px] font-medium text-foreground">
								{option.label}
							</label>
							<p className="text-[11px] leading-relaxed text-muted-foreground">{option.hint}</p>
						</div>
						<Switch
							id={`permission-tier-${option.key}`}
							checked={option.enabled}
							onCheckedChange={(checked) => onToggle(option.key, checked)}
							aria-label={option.label}
						/>
					</li>
				))}
			</ul>
		</section>
	);
}
