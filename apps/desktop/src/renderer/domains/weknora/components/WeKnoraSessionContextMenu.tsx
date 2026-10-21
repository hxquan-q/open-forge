// Copyright The Open Forge contributors.

import { useShortcutScope } from "@shared/shortcuts";
import { Button } from "@vetta-org/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 可扩展的菜单项描述（AC-6）：后续加项只往 `items` 数组追加描述，不动本组件的
 * 行为层（portal / 定位 / 关闭 / a11y 都与项内容无关）。
 */
export interface WeKnoraSessionMenuItem {
	readonly id: string;
	readonly label: string;
	/** iconify class（DESIGN.md：solar linear 优先，如 `icon-[solar--trash-bin-trash-linear]`）。 */
	readonly iconClassName?: string;
	/** 危险动作（如删除）：文字走 `destructive` token（DESIGN.md 语义色表）。 */
	readonly danger?: boolean;
	/** 禁用（如思考中的会话禁删，AC-10）：置灰不可点，原因写在 `label` 里（照归档先例）。 */
	readonly disabled?: boolean;
	readonly onSelect: () => void;
}

interface WeKnoraSessionContextMenuProps {
	/** 视口坐标（右键落点，`event.clientX/Y`）。 */
	readonly x: number;
	readonly y: number;
	readonly items: readonly WeKnoraSessionMenuItem[];
	readonly onClose: () => void;
}

/** 菜单与视口边缘的最小留白，避免贴边或出窗。 */
const VIEWPORT_MARGIN = 8;

/**
 * 历史会话右键菜单（AC-6）。
 *
 * 照 `project/components/SessionContextMenu` 的 portal + 坐标先例，但**不借** theme-ui 的
 * `SessionContextMenuView` —— 它为项目会话的打标签/多动作设计，借来即名义组合
 * （02-plan §3 / composable-ui-components §2.2）。本组件只承载这些真实行为：
 * `createPortal` 到 body、按落点坐标定位（贴边收敛）、点外部 / Escape 关闭、
 * 菜单语义（role=menu/menuitem）与首项聚焦。项内容全部经 `items` 注入。
 *
 * Escape 走统一快捷键作用域栈（AGENTS.md §8，禁 ad-hoc keydown）；点外部用延后一拍
 * 的 `mousedown` 监听（先例：useSkillPickerModel），避免右键那一拍把刚打开的菜单立刻关掉。
 */
export function WeKnoraSessionContextMenu({
	x,
	y,
	items,
	onClose,
}: WeKnoraSessionContextMenuProps): JSX.Element {
	const menuRef = useRef<HTMLDivElement>(null);
	// 先按落点渲染，量到实际尺寸后再把超出视口的分量拉回（jsdom 量到 0，等价于不收敛）。
	const [position, setPosition] = useState({ left: x, top: y });

	useLayoutEffect(() => {
		const element = menuRef.current;
		if (!element) return;
		const maxX = window.innerWidth - element.offsetWidth - VIEWPORT_MARGIN;
		const maxY = window.innerHeight - element.offsetHeight - VIEWPORT_MARGIN;
		setPosition({
			left: Math.max(VIEWPORT_MARGIN, Math.min(x, maxX)),
			top: Math.max(VIEWPORT_MARGIN, Math.min(y, maxY)),
		});
	}, [x, y]);

	useShortcutScope({
		id: "overlay:weknora-session-context-menu",
		kind: "overlay",
		bindings: [{ key: "escape", run: () => onClose() }],
	});

	useEffect(() => {
		const handleMouseDown = (event: MouseEvent): void => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
		};
		const timer = setTimeout(() => document.addEventListener("mousedown", handleMouseDown), 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [onClose]);

	// 打开即聚焦第一个可用项：键盘用户可直接 Enter 触发（菜单约定，user-language-ui §14）。
	useEffect(() => {
		menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
	}, []);

	return createPortal(
		// 视觉词汇沿用仓库 DropdownMenu 的 CONTENT/ITEM 类（DESIGN.md「Select / DropdownMenu」节）：
		// 浮层才有 shadow-md；项 13px、1px 边框、bg-popover。
		<div
			ref={menuRef}
			className="no-drag fixed z-50 min-w-[10rem] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
			role="menu"
			style={{ left: position.left, top: position.top }}
		>
			{items.map((item) => (
				<Button
					key={item.id}
					type="button"
					role="menuitem"
					variant="ghost"
					size="sm"
					disabled={item.disabled}
					className={`h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors focus:bg-accent/60 ${
						item.danger ? "text-destructive hover:text-destructive" : ""
					}`}
					onClick={() => {
						item.onSelect();
						// 选中即关菜单（后续流程——如确认弹窗——由调用方接管）。
						onClose();
					}}
				>
					{item.iconClassName ? (
						<span aria-hidden="true" className={`${item.iconClassName} h-3.5 w-3.5 shrink-0`} />
					) : null}
					<span className="flex-1 truncate">{item.label}</span>
				</Button>
			))}
		</div>,
		document.body,
	);
}
