import type { JSX } from "react";
import { lazy, Suspense } from "react";
import type { AchievementPromotionBadge3DProps } from "./AchievementPromotionBadge3D";

const Impl = lazy(async () => {
	const mod = await import("./AchievementPromotionBadge3D");
	return { default: mod.AchievementPromotionBadge3D };
});

/**
 * three.js (~1.6 MB) 只在成就升级弹窗真正渲染时按需加载；
 * 静态图里只保留这个轻量壳，fallback 与 impl 的 opacity-0 淡入对齐，不阻塞弹窗布局。
 */
export function AchievementPromotionBadge3D(props: AchievementPromotionBadge3DProps): JSX.Element {
	return (
		<Suspense fallback={null}>
			<Impl {...props} />
		</Suspense>
	);
}
