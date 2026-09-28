// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { type JSX, useState } from "react";
import { EditDiffView } from "../../../conversation/components/blocks/tool-views/EditDiffView";
import type { CanvasDiffFile } from "../../services/canvas-diff";

export interface CanvasStructuredDiffLabels {
	readonly empty: string;
	readonly expand: (path: string) => string;
	readonly collapse: (path: string) => string;
}

/**
 * 多文件 Unified Diff：按文件分组、逐个折叠，展开后直接复用 `EditDiffView`
 * （即 `parse-diff.ts` + `DiffPreviewView`），Canvas 与聊天里的同一份 diff 渲染一致。
 */
export function CanvasStructuredDiffPreview({
	files,
	labels,
}: {
	readonly files: readonly CanvasDiffFile[];
	readonly labels: CanvasStructuredDiffLabels;
}): JSX.Element {
	const [collapsed, setCollapsed] = useState<readonly string[]>([]);

	if (files.length === 0) {
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
		<div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-3">
			{files.map((file) => {
				const expanded = !collapsed.includes(file.path);
				return (
					<section key={file.path} className="rounded-xl border border-border/50 bg-card/40">
						<div className="flex items-center gap-2 px-3 py-2">
							<Button
								size="sm"
								variant="ghost"
								aria-expanded={expanded}
								aria-label={expanded ? labels.collapse(file.path) : labels.expand(file.path)}
								onClick={() =>
									setCollapsed((current) =>
										current.includes(file.path)
											? current.filter((path) => path !== file.path)
											: [...current, file.path],
									)
								}
							>
								<span
									aria-hidden
									className={`h-3.5 w-3.5 ${
										expanded ? "icon-[solar--alt-arrow-down-linear]" : "icon-[solar--alt-arrow-right-linear]"
									}`}
								/>
								<span className="max-w-72 truncate text-[12px] text-foreground">{file.path}</span>
							</Button>
							<span className="ml-auto shrink-0 text-[11px] tabular-nums">
								<span className="text-emerald-400">{`+${file.added}`}</span>
								<span className="text-muted-foreground/40"> / </span>
								<span className="text-destructive">{`-${file.removed}`}</span>
							</span>
						</div>
						{expanded ? (
							<div className="border-t border-border/50 px-3 py-2">
								<EditDiffView block={{ args: {}, uiDetails: { diff: file.diff } }} />
							</div>
						) : null}
					</section>
				);
			})}
		</div>
	);
}
