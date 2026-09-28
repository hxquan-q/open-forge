import type { JSX, ReactNode, RefCallback } from "react";
import { useThemeSurface } from "@vetta-org/theme-sdk/appearance";
import { cn } from "@vetta-org/ui";
import { ThemeSurface } from "../appearance/ThemeSurface";
import { ResizeHandle } from "../layout/ResizeHandle";

export interface SidebarPanelProps {
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	/**
	 * 面板整棵子树的 landmark 名（宿主解析 i18n 后传入）。面板承载品牌、导航与项目区，
	 * 不给 complementary landmark 时读屏只能把整栏内容当「无主文本」念（axe `region`，BUG-0039）。
	 * 根节点仍保持 div：拖拽宽度时宿主按 panelRef 直接写 style.width，见 setPanelRef 注释。
	 */
	label?: string;
	onResize: (delta: number) => void;
	onResizeEnd: () => void;
	/**
	 * 面板根节点的 ref。
	 *
	 * 拖宽度时宿主直接往它写 `style.width`（不进 React，也不经过 `:root` 上的自定义属性），
	 * 见 theme-sdk 的 `SidebarModel.setPanelRef`。`width` 是 committed 值，松手时才由 React 写回。
	 */
	panelRef?: RefCallback<HTMLDivElement>;
	width: number;
}

export function SidebarPanel({
	children,
	className,
	contentClassName,
	label,
	onResize,
	onResizeEnd,
	panelRef,
	width,
}: SidebarPanelProps): JSX.Element {
	const surface = useThemeSurface("sidebar.panel");

	return (
		<div
			role="complementary"
			aria-label={label}
			className={cn(
				"group/sidebar sidebar-surface relative h-full shrink-0 rounded-[10px] border border-border bg-muted",
				surface?.rootClassName,
				className,
			)}
			data-theme-surface-root="sidebar.panel"
			ref={panelRef}
			style={{ width }}
		>
			<ThemeSurface slot="sidebar.panel" />
			<div
				className={cn(
					"relative z-10 flex h-full flex-col overflow-hidden rounded-[inherit]",
					contentClassName,
				)}
			>
				{children}
			</div>
			<ResizeHandle side="right" onResize={onResize} onResizeEnd={onResizeEnd} />
		</div>
	);
}
