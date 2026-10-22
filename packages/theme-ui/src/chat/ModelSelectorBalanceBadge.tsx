import type { JSX } from "react";
import { cn } from "@vetta-org/ui";
import type { ModelSelectorBalanceLabels } from "./ModelSelectorView";

/**
 * 模型选择器分组标题行里的余额区：纯展示。
 *
 * 揭示状态由父视图持有，父视图跨面板开合常驻（内容区本身会卸载）；
 * 因此每次打开/切换 provider 时显式归零，徽标自己只负责按 `revealed` 画两态。
 */
export interface ModelSelectorBalanceBadgeProps {
	readonly revealed: boolean;
	/** 宿主已按语言格式化好的整段文本（含「余额」前缀）；视图不做 i18n/数字格式。 */
	readonly text: string;
	readonly labels: ModelSelectorBalanceLabels;
	readonly onToggle: () => void;
	readonly onRefresh: () => void;
	readonly className?: string;
}

const BADGE_BUTTON_CLASS =
	"inline-flex size-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground";

export function ModelSelectorBalanceBadge({
	revealed,
	text,
	labels,
	onToggle,
	onRefresh,
	className,
}: ModelSelectorBalanceBadgeProps): JSX.Element {
	return (
		<span className={cn("inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground", className)}>
			{revealed && (
				<>
					<span title={text} className="min-w-0 max-w-[7rem] truncate tabular-nums">{text}</span>
					<button
						type="button"
						onClick={onRefresh}
						aria-label={labels.refresh}
						title={labels.refresh}
						className={BADGE_BUTTON_CLASS}
					>
						<span aria-hidden="true" className="icon-[solar--refresh-linear] size-3" />
					</button>
				</>
			)}
			<button
				type="button"
				onClick={onToggle}
				aria-label={revealed ? labels.hide : labels.show}
				aria-pressed={revealed}
				title={revealed ? labels.hide : labels.show}
				className={BADGE_BUTTON_CLASS}
			>
				<span
					aria-hidden="true"
					className={cn("size-3", revealed ? "icon-[solar--eye-linear]" : "icon-[solar--eye-closed-linear]")}
				/>
			</button>
		</span>
	);
}
