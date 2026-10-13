// Modified by The Open Forge contributors.
import type { SshTransferItem } from "@preload/api-types/ssh-transfers";
import { useTranslation } from "react-i18next";

/** 面板只保留最近若干条，历史靠 remove 清；超出部分让位给活动条目。 */
const MAX_ROWS = 5;

function formatTransferBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = units[0] ?? "KB";
	for (let index = 1; index < units.length && value >= 1024; index += 1) {
		value /= 1024;
		unit = units[index] ?? unit;
	}
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

interface SshTransferProgressPanelProps {
	items: readonly SshTransferItem[];
	onCancel: (id: string) => void;
	onRemove: (id: string) => void;
}

/**
 * SSH 文件传输的进度浮层：活动条目 + 近期结束条目，fixed 悬于窗口右下。
 * 数据由 host 经 onTransferEvent 维护，这里只做展示与取消/移除。
 */
export function SshTransferProgressPanel({
	items,
	onCancel,
	onRemove,
}: SshTransferProgressPanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const active = items.filter((item) => item.status === "queued" || item.status === "transferring");
	const finished = items.filter((item) => item.status !== "queued" && item.status !== "transferring");
	const visible = [...active, ...finished].slice(0, MAX_ROWS);

	return (
		<div
			className="fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg"
			data-testid="ssh-transfer-panel"
		>
			<div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				{t("fileExplorer.sshTransfer.panelTitle")}
			</div>
			<div className="flex flex-col gap-2">
				{visible.map((item) => {
					const isActive = item.status === "queued" || item.status === "transferring";
					const percent =
						item.totalBytes > 0
							? Math.min(100, Math.round((item.transferredBytes / item.totalBytes) * 100))
							: item.status === "completed"
								? 100
								: 0;
					const statusLabel = t(`fileExplorer.sshTransfer.status.${item.status}`);
					const detail = item.error
						? item.error
						: isActive && item.speedBytesPerSec
							? `${formatTransferBytes(item.transferredBytes)} · ${formatTransferBytes(item.speedBytesPerSec)}/s`
							: formatTransferBytes(item.transferredBytes);
					return (
						<div key={item.id} className="rounded-md border border-border/60 px-2 py-1.5">
							<div className="flex items-center gap-1.5 text-[11px] text-foreground">
								<span
									className={
										item.direction === "upload"
											? "icon-[solar--export-linear] h-3.5 w-3.5 shrink-0 text-muted-foreground"
											: "icon-[solar--download-linear] h-3.5 w-3.5 shrink-0 text-muted-foreground"
									}
								/>
								<span className="min-w-0 truncate" title={item.remotePath}>
									{item.name}
								</span>
								<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{statusLabel}</span>
								{isActive ? (
									<button
										type="button"
										className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										title={t("fileExplorer.sshTransfer.cancel")}
										onClick={() => onCancel(item.id)}
									>
										<span className="icon-[solar--close-linear] h-3 w-3" />
									</button>
								) : (
									<button
										type="button"
										className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
										title={t("fileExplorer.sshTransfer.remove")}
										onClick={() => onRemove(item.id)}
									>
										<span className="icon-[solar--close-linear] h-3 w-3" />
									</button>
								)}
							</div>
							<div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
								<div
									className={
										item.status === "failed"
											? "h-full rounded-full bg-destructive transition-[width]"
											: "h-full rounded-full bg-primary transition-[width]"
									}
									style={{ width: `${percent}%` }}
								/>
							</div>
							<div
								className={
									item.error
										? "mt-1 truncate px-0.5 text-[10px] text-destructive"
										: "mt-1 truncate px-0.5 text-[10px] text-muted-foreground"
								}
							>
								{detail}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
