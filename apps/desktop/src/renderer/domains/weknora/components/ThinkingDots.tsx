// Copyright The Open Forge contributors.

import { useTranslation } from "react-i18next";

/**
 * 「思考中」三点指示（AC-7~9）。
 *
 * **出现条件由宿主判定**（见 `MessageBubble`）：助手消息正在流式、且尚未收到任何字符（等待首字）。
 * 首字到达后本组件卸载，由正文 / `ThinkingBlock` 接管；终态与无请求时不渲染（AC-8）。
 *
 * **动画走宿主统一挂载**：三个点各带一个登记在 `shared/lib/live-animations.ts` 的类名，由宿主用
 * Web Animations 挂 `steps()` 合成器动画（相位依次错开约 150ms），而不是在本组件里自写
 * `@keyframes … infinite`——这正是 DESIGN.md「进行中」指示的纪律（毛玻璃窗口逐帧整窗重合成的代价）。
 * `prefers-reduced-motion: reduce` 时登记表不挂动画，三点停在静止态，旁边的「思考中」文案信息不丢（AC-9）。
 *
 * 三点是纯装饰，对辅助技术 `aria-hidden`；语义由文案承担。
 */
export function ThinkingDots(): JSX.Element {
	const { t } = useTranslation("weknora");

	return (
		<div className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70">
			<span aria-hidden="true" className="flex items-center gap-1">
				<span className="weknora-thinking-dot-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
				<span className="weknora-thinking-dot-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
				<span className="weknora-thinking-dot-3 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
			</span>
			<span>{t("message.thinkingPending")}</span>
		</div>
	);
}
