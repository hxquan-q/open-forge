// Copyright The Open Forge contributors.
import { Input } from "@vetta-org/ui";
import { useId } from "react";

export interface SshHostFormValues {
	label: string;
	target: string;
	port: string;
	identityFile: string;
}

export interface SshHostFormFieldsLabels {
	fieldTarget: string;
	fieldTargetHint: string;
	fieldLabel: string;
	fieldLabelHint: string;
	fieldPort: string;
	fieldIdentityFile: string;
	fieldIdentityFileHint: string;
	targetPlaceholder: string;
	identityFilePlaceholder: string;
}

/** Controlled fields shared by host settings and the remote-project picker. */
export function SshHostFormFieldsView({
	value,
	labels,
	disabled = false,
	onChange,
}: {
	value: SshHostFormValues;
	labels: SshHostFormFieldsLabels;
	disabled?: boolean;
	onChange: (patch: Partial<SshHostFormValues>) => void;
}): JSX.Element {
	const id = useId();
	const inputClass = "h-8 bg-card text-[12px] font-medium md:text-[12px]";
	return (
		<>
			<label htmlFor={`${id}-target`} className="flex flex-col gap-1.5">
				<span className="text-[12px] font-medium text-foreground">{labels.fieldTarget}</span>
				<Input
					id={`${id}-target`}
					value={value.target}
					onChange={(event) => onChange({ target: event.target.value })}
					placeholder={labels.targetPlaceholder}
					aria-label={labels.fieldTarget}
					aria-describedby={`${id}-target-hint`}
					disabled={disabled}
					required
					autoFocus
					className={inputClass}
				/>
				<span id={`${id}-target-hint`} className="text-[11px] text-muted-foreground">
					{labels.fieldTargetHint}
				</span>
			</label>
			<label htmlFor={`${id}-label`} className="flex flex-col gap-1.5">
				<span className="text-[12px] font-medium text-foreground">{labels.fieldLabel}</span>
				<Input
					id={`${id}-label`}
					value={value.label}
					onChange={(event) => onChange({ label: event.target.value })}
					placeholder={value.target}
					aria-label={labels.fieldLabel}
					aria-describedby={`${id}-label-hint`}
					disabled={disabled}
					className={inputClass}
				/>
				<span id={`${id}-label-hint`} className="text-[11px] text-muted-foreground">
					{labels.fieldLabelHint}
				</span>
			</label>
			<label htmlFor={`${id}-port`} className="flex flex-col gap-1.5">
				<span className="text-[12px] font-medium text-foreground">{labels.fieldPort}</span>
				<Input
					id={`${id}-port`}
					value={value.port}
					onChange={(event) => onChange({ port: event.target.value.replace(/\D/g, "") })}
					placeholder="22"
					inputMode="numeric"
					aria-label={labels.fieldPort}
					disabled={disabled}
					className={inputClass}
				/>
			</label>
			<label htmlFor={`${id}-identityFile`} className="flex flex-col gap-1.5">
				<span className="text-[12px] font-medium text-foreground">{labels.fieldIdentityFile}</span>
				<Input
					id={`${id}-identityFile`}
					value={value.identityFile}
					onChange={(event) => onChange({ identityFile: event.target.value })}
					placeholder={labels.identityFilePlaceholder}
					aria-label={labels.fieldIdentityFile}
					aria-describedby={`${id}-identity-hint`}
					disabled={disabled}
					className={inputClass}
				/>
				<span id={`${id}-identity-hint`} className="text-[11px] text-muted-foreground">
					{labels.fieldIdentityFileHint}
				</span>
			</label>
		</>
	);
}
