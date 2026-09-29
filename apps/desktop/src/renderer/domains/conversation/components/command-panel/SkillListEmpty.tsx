import { Button } from "@shared/components/ui/button";
import { motion } from "motion/react";
import type { SkillListEmptyAction, SkillListLabels } from "./types";

const CARD_IN = { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const };

interface SkillListEmptyProps {
	/** true = 有过滤词但没命中；false = 本来就没有可用的 skill / 场景。 */
	filtering: boolean;
	labels: SkillListLabels;
	/** filter 时给「清除筛选」，无可用项时给「去能力市场安装」。必填——空态的恢复动作不能是摆设。 */
	action: SkillListEmptyAction;
}

/**
 * skill 列表的空态卡片：占满命令区宽度的一张虚线卡片，左图标右文案（标题 + 提示 + 主 CTA）。
 * 不再只是「提示一行字」：可操作的恢复动作（清除筛选 / 去能力市场）必须直接出现在卡片里。
 */
export function SkillListEmpty({ filtering, labels, action }: SkillListEmptyProps): JSX.Element {
	const title = filtering ? labels.emptyNoMatch : labels.emptyNoSkills;
	const hint = filtering ? labels.emptyNoMatchHint : labels.emptyNoSkillsHint;
	return (
		<div className="px-3 py-2">
			<motion.div
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={CARD_IN}
				className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-foreground/5 px-3 py-2.5"
			>
				<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground/70">
					<span
						className={[
							"h-3.5 w-3.5",
							filtering ? "icon-[solar--minimalistic-magnifer-linear]" : "icon-[solar--widget-5-linear]",
						].join(" ")}
					/>
				</span>
				<span className="flex min-w-0 flex-1 flex-col text-left">
					<span className="truncate text-[13px] font-medium text-foreground/80">{title}</span>
					<span className="truncate text-[12px] text-muted-foreground/60">{hint}</span>
				</span>
				<Button variant="ghost" size="sm" onClick={action.onAction} className="shrink-0">
					{action.label}
				</Button>
			</motion.div>
		</div>
	);
}
