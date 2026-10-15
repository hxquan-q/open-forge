// Modified by The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { SshHostFormFieldsView } from "@vetta-org/theme-ui/settings";
import type { SshHostsSettingsModel } from "./useSshHostsSettingsModel";

/** Settings keep the editor inline so existing hosts remain visible. */
export function SshHostForm({ model, heading }: { model: SshHostsSettingsModel; heading: string }): JSX.Element {
	const { labels, form, actions } = model;
	const canSubmit = form.target.trim().length > 0 && !model.saving;
	return (
		<form
			className="flex flex-col gap-3 border-b border-border px-5 py-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (canSubmit) void actions.submit();
			}}
		>
			<p className="text-[13px] font-medium text-foreground">{heading}</p>
			<SshHostFormFieldsView value={form} labels={labels} onChange={actions.setForm} disabled={model.saving} />
			{model.formError !== null && (
				<p role="alert" className="text-[12px] text-destructive">
					{model.formError}
				</p>
			)}
			<div className="flex items-center gap-2">
				<Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
					{labels.save}
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={actions.cancelEdit} disabled={model.saving}>
					{labels.cancel}
				</Button>
			</div>
		</form>
	);
}
