// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Textarea } from "@shared/components/ui/textarea";
import type { AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";

export function AllstarProjectConfigDialog({
	configuration,
	labels,
}: {
	configuration: AllstarDevHomePageModel["projectConfig"];
	labels: AllstarDevHomePageModel["labels"];
}): JSX.Element {
	const busy = configuration.status === "loading" || configuration.status === "saving";
	const blocked = busy || configuration.status === "load-error";
	return (
		<Dialog open={configuration.open} onOpenChange={(open) => !open && configuration.close()}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[min(720px,calc(100%-2rem))] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{labels.projectConfigTitle}</DialogTitle>
					<DialogDescription>
						{configuration.projectName} · {labels.projectConfigDescription}
					</DialogDescription>
				</DialogHeader>
				<p className="text-xs text-muted-foreground">{labels.projectConfigPrivacyWarning}</p>
				{configuration.status === "loading" && (
					<p role="status" className="text-[13px] text-muted-foreground">
						{labels.projectConfigLoading}
					</p>
				)}
				{configuration.status === "load-error" && (
					<p role="alert" className="text-[13px] text-destructive">
						{labels.projectConfigLoadFailed}
					</p>
				)}
				<label htmlFor="allstar-project-config-content" className="text-[13px] font-medium text-foreground">
					{labels.projectConfigFieldLabel}
				</label>
				<Textarea
					id="allstar-project-config-content"
					className="min-h-72 font-mono"
					value={configuration.content}
					placeholder={labels.projectConfigTemplate}
					disabled={blocked}
					onChange={(event) => configuration.changeContent(event.currentTarget.value)}
				/>
				{configuration.status === "saved" && (
					<p role="status" className="text-[13px] text-muted-foreground">
						{labels.projectConfigSaved}
					</p>
				)}
				{configuration.status === "save-error" && (
					<p role="alert" className="text-[13px] text-destructive">
						{labels.projectConfigSaveFailed}
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" disabled={busy} onClick={configuration.close}>
						{labels.projectConfigCancel}
					</Button>
					<Button
						variant="primary"
						disabled={blocked || !configuration.dirty}
						onClick={() => void configuration.save()}
					>
						{configuration.status === "saving" ? labels.projectConfigSaving : labels.projectConfigSave}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
