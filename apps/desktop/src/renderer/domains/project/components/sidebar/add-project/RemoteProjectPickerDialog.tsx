// Modified by The Open Forge contributors.
import { useSshHostFormLabels } from "@shared/hooks/useSshHostFormLabels";
import { SshHostFormFieldsView } from "@vetta-org/theme-ui/settings/ssh-host-form";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@vetta-org/ui";
import type { Ref } from "react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRemoteProjectPickerModel } from "./useRemoteProjectPickerModel";

/** Choose or create a host, then register one of its directories as a project. */
export function RemoteProjectPickerDialog({
	onConfirm,
	onCancel,
}: {
	onConfirm: (hostId: string, remotePath: string, name?: string) => void;
	onCancel: () => void;
}): JSX.Element {
	const { t } = useTranslation("project");
	const model = useRemoteProjectPickerModel();
	const fieldLabels = useSshHostFormLabels();
	const addButton = useRef<HTMLButtonElement>(null);
	const title = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (model.addingHost) return;
		if (model.selectedHostId !== null) title.current?.focus();
		else if (!model.hostsLoading) addButton.current?.focus();
	}, [model.addingHost, model.selectedHostId, model.hostsLoading]);

	return (
		<Dialog open onOpenChange={(open) => !open && !model.savingHost && onCancel()}>
			<DialogContent
				className="max-h-[calc(100dvh-2rem)] max-w-[min(520px,calc(100%-2rem))]"
				showCloseButton={false}
			>
				<Button
					variant="ghost"
					size="icon-sm"
					className="absolute top-2 right-2"
					aria-label={t("remotePicker.close")}
					disabled={model.savingHost}
					onClick={onCancel}
				>
					<span aria-hidden="true" className="icon-[solar--close-circle-linear] h-4 w-4" />
				</Button>
				<DialogHeader>
					<DialogTitle ref={title} tabIndex={-1} className="pr-6 text-[15px]">
						{model.addingHost ? t("remotePicker.addHost") : t("remotePicker.title")}
					</DialogTitle>
					<DialogDescription>
						{model.addingHost
							? t("remotePicker.addHostHint")
							: model.selectedHostId === null
								? t("remotePicker.pickHost")
								: !model.remotePath
									? t("remotePicker.connecting")
									: model.selectedHost
										? t("remotePicker.pathOnHost", {
												host: model.selectedHost.label,
												path: model.remotePath,
											})
										: model.remotePath}
					</DialogDescription>
				</DialogHeader>

				{model.addingHost ? (
					<form
						className="flex min-h-0 flex-col gap-4"
						aria-busy={model.savingHost}
						onSubmit={(event) => {
							event.preventDefault();
							void model.submitHost();
						}}
					>
						<div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto px-1">
							<SshHostFormFieldsView
								value={model.hostForm}
								labels={fieldLabels}
								onChange={model.setHostForm}
								disabled={model.savingHost}
							/>
							{model.hostFormError !== null && (
								<div role="alert" className="text-[12px] text-destructive">
									<p>{t("remotePicker.saveHostFailed")}</p>
									<p className="mt-1 break-words">{model.hostFormError}</p>
								</div>
							)}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" disabled={model.savingHost} onClick={model.cancelAddHost}>
								{t("remotePicker.backToHostList")}
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={model.savingHost || !model.hostForm.target.trim()}
							>
								{model.savingHost ? t("remotePicker.savingHost") : t("remotePicker.saveHostAndContinue")}
							</Button>
						</DialogFooter>
					</form>
				) : model.selectedHostId === null ? (
					<HostStep model={model} t={t} addButtonRef={addButton} />
				) : (
					<DirectoryStep model={model} t={t} />
				)}

				{!model.addingHost && (
					<DialogFooter>
						{model.selectedHostId !== null && (
							<Button variant="ghost" onClick={model.back}>
								{t("remotePicker.backToHosts")}
							</Button>
						)}
						<Button variant="outline" onClick={onCancel}>
							{t("remotePicker.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={!model.canSubmit}
							onClick={() => {
								if (model.canSubmit && model.selectedHostId !== null)
									onConfirm(
										model.selectedHostId,
										model.remotePath,
										model.projectName.trim() || model.defaultProjectName || undefined,
									);
							}}
						>
							{t("remotePicker.confirm")}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

type Model = ReturnType<typeof useRemoteProjectPickerModel>;
type Translate = ReturnType<typeof useTranslation<"project">>["t"];

function HostStep({
	model,
	t,
	addButtonRef,
}: {
	model: Model;
	t: Translate;
	addButtonRef: Ref<HTMLButtonElement>;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<Button
				ref={addButtonRef}
				variant={model.hosts.length === 0 ? "primary" : "outline"}
				size="sm"
				className="self-start"
				onClick={model.startAddHost}
				disabled={model.hostsLoading}
			>
				<span aria-hidden="true" className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
				{t("remotePicker.addHost")}
			</Button>
			<HostList model={model} t={t} />
		</div>
	);
}

function HostList({ model, t }: { model: Model; t: Translate }): JSX.Element {
	if (model.hostsLoading) {
		return <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">{t("remotePicker.loading")}</p>;
	}
	if (model.hostsError) {
		return (
			<div role="alert" className="flex flex-col items-start gap-2 px-1 py-4">
				<p className="text-[13px] text-destructive">{t("remotePicker.loadHostsFailed")}</p>
				<Button variant="outline" size="sm" onClick={() => void model.reloadHosts()}>
					{t("remotePicker.retry")}
				</Button>
			</div>
		);
	}
	if (model.hosts.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 px-1 py-6 text-center">
				<span className="icon-[solar--server-linear] h-8 w-8 text-muted-foreground" />
				<p className="text-[13px] text-foreground">{t("remotePicker.noHosts")}</p>
				<p className="max-w-[360px] text-[12px] text-muted-foreground">{t("remotePicker.noHostsHint")}</p>
			</div>
		);
	}
	return (
		<ul className="flex max-h-[320px] flex-col gap-1 overflow-auto">
			{model.hosts.map((host) => (
				<li key={host.id}>
					<button
						type="button"
						onClick={() => model.selectHost(host.id)}
						className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
					>
						<span className="icon-[solar--server-linear] h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13px] text-foreground">{host.label}</span>
							<span className="block truncate text-[12px] text-muted-foreground">{host.target}</span>
						</span>
					</button>
				</li>
			))}
		</ul>
	);
}

function DirectoryStep({ model, t }: { model: Model; t: Translate }): JSX.Element {
	const nameId = useId();
	return (
		<div className="flex flex-col gap-2">
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				onClick={model.goToParent}
				disabled={model.remotePath === "/" || model.browsing}
			>
				<span className="icon-[solar--alt-arrow-up-linear] h-3.5 w-3.5" />
				{t("remotePicker.parent")}
			</Button>

			{model.error !== null ? (
				<div role="alert" className="px-1 py-6 text-center">
					<p className="text-[13px] text-destructive">{t("remotePicker.browseFailed")}</p>
					<Button variant="outline" size="sm" className="mt-3" onClick={model.retryBrowse}>
						{t("remotePicker.retry")}
					</Button>
					{/* 原始 SSH 报错收进二级披露：它能定位问题，但不该当作首行文案。 */}
					<details className="mt-2 text-left">
						<summary className="cursor-pointer text-[11px] text-muted-foreground">
							{t("remotePicker.details")}
						</summary>
						<pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-muted px-2 py-1.5 text-[11px] whitespace-pre-wrap text-muted-foreground">
							{model.error}
						</pre>
					</details>
				</div>
			) : (
				<ul className="flex max-h-[280px] flex-col gap-1 overflow-auto">
					{model.browsing && (
						<li className="px-3 py-2.5 text-[13px] text-muted-foreground">{t("remotePicker.loading")}</li>
					)}
					{!model.browsing && model.entries.length === 0 && (
						<li className="px-3 py-2.5 text-[13px] text-muted-foreground">{t("remotePicker.emptyDir")}</li>
					)}
					{!model.browsing &&
						model.entries.map((entry) => (
							<li key={entry.name}>
								<button
									type="button"
									onClick={() => model.enterDirectory(entry.name)}
									className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
								>
									<span className="icon-[solar--folder-linear] h-4 w-4 shrink-0 text-muted-foreground" />
									<span className="truncate text-[13px] text-foreground">{entry.name}</span>
								</button>
							</li>
						))}
				</ul>
			)}
			<label htmlFor={nameId} className="flex flex-col gap-1.5 px-1 pt-1">
				<span className="text-[12px] font-medium text-foreground">{t("remotePicker.projectName")}</span>
				<Input
					id={nameId}
					value={model.projectName}
					onChange={(event) => model.setProjectName(event.target.value)}
					placeholder={model.defaultProjectName}
					aria-label={t("remotePicker.projectName")}
					aria-describedby={`${nameId}-hint`}
					className="h-8 bg-card text-[12px] font-medium md:text-[12px]"
				/>
				<span id={`${nameId}-hint`} className="text-[11px] text-muted-foreground">
					{t("remotePicker.projectNameHint")}
				</span>
			</label>
		</div>
	);
}
