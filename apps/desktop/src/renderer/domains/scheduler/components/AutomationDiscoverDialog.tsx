// Copyright The Open Forge contributors.
import type { DiscoveredAutomationPackage } from "@preload/api-types/scheduler";
import { Button } from "@vetta-org/ui";
import { showToast } from "@shared/store/toast-atoms";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface AutomationDiscoverDialogProps {
	readonly open: boolean;
	readonly defaultCwd: string;
	readonly onClose: () => void;
	readonly onImported: () => void | Promise<void>;
}

export function AutomationDiscoverDialog({
	open,
	defaultCwd,
	onClose,
	onImported,
}: AutomationDiscoverDialogProps): JSX.Element | null {
	const { t } = useTranslation("automation");
	const [items, setItems] = useState<DiscoveredAutomationPackage[]>([]);
	const [loading, setLoading] = useState(false);
	const [importingUrl, setImportingUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		void window.vetta.scheduler
			.discoverAutomationPackages()
			.then((discovered) => {
				if (!cancelled) setItems(discovered);
			})
			.catch(() => {
				if (!cancelled) {
					showToast({ variant: "error", message: t("package.discoverFailed") });
					setItems([]);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, t]);

	const handleImport = useCallback(
		async (item: DiscoveredAutomationPackage) => {
			if (!defaultCwd) {
				showToast({ variant: "warning", message: t("package.needWorkspace") });
				return;
			}
			setImportingUrl(item.sourceUrl);
			try {
				const result = await window.vetta.scheduler.importAutomationPackageFromUrl(
					item.sourceUrl,
					defaultCwd,
				);
				if (result.status === "imported") {
					showToast({
						variant: "success",
						message: t("package.importDisabled", { id: result.taskId }),
					});
					await onImported();
				} else if (result.status === "rejected") {
					showToast({
						variant: "error",
						message: t("package.importRejected", { reasons: result.reasons.join("; ") }),
					});
				}
			} catch {
				showToast({ variant: "error", message: t("package.importFailed") });
			} finally {
				setImportingUrl(null);
			}
		},
		[defaultCwd, onImported, t],
	);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			role="dialog"
			aria-modal="true"
			aria-label={t("package.discoverTitle")}
		>
			<div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-lg">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<div>
						<h2 className="text-sm font-semibold">{t("package.discoverTitle")}</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">{t("package.discoverHint")}</p>
					</div>
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						{t("package.close")}
					</Button>
				</div>
				<div className="flex-1 overflow-y-auto px-4 py-3">
					{loading ? (
						<p className="text-sm text-muted-foreground">{t("package.discoverLoading")}</p>
					) : items.length === 0 ? (
						<p className="text-sm text-muted-foreground">{t("package.discoverEmpty")}</p>
					) : (
						<ul className="flex flex-col gap-2">
							{items.map((item) => (
								<li
									key={item.contentSha256}
									className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{item.pkg.name}</p>
										<p className="truncate text-xs text-muted-foreground">
											{item.pkg.id} · v{item.pkg.version} · ★{item.stars}
										</p>
										{item.pkg.description ? (
											<p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
												{item.pkg.description}
											</p>
										) : null}
									</div>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										disabled={importingUrl !== null}
										onClick={() => void handleImport(item)}
									>
										{importingUrl === item.sourceUrl
											? t("package.importing")
											: t("package.import")}
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
