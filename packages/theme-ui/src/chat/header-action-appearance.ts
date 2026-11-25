// Copyright The Open Forge contributors.
/** 顶栏与菜单的语义色，与主题的颜色 token 对应。 */
export type HeaderActionTone = "neutral" | "info" | "success" | "warning" | "danger";

/** 真实画面上的颜色；`neutral` 用组件默认色，不输出额外 class。 */
const TONE_SURFACE: Record<Exclude<HeaderActionTone, "neutral">, { badge: string; icon: string }> = {
	info: { badge: "bg-primary", icon: "text-primary" },
	success: { badge: "bg-chart-2", icon: "text-chart-2" },
	warning: { badge: "bg-chart-4", icon: "text-chart-4" },
	danger: { badge: "bg-destructive", icon: "text-destructive" },
};

export function headerActionToneIconClass(tone: HeaderActionTone | undefined): string | undefined {
	return tone && tone !== "neutral" ? TONE_SURFACE[tone].icon : undefined;
}

/** 角标底色的 class；`neutral` / 未设时交给宿主默认色（红）。 */
export function headerActionToneBadgeClass(tone: HeaderActionTone | undefined): string | undefined {
	return tone && tone !== "neutral" ? TONE_SURFACE[tone].badge : undefined;
}

export const HEADER_ACTION_POPOVER_WIDTH = {
	sm: "w-max max-w-[min(92vw,16rem)]",
	md: "w-max max-w-[min(92vw,24rem)]",
	lg: "w-max max-w-[min(92vw,32rem)]",
} as const;
