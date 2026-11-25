// Modified by The Open Forge contributors.
import { type JSX, type ReactNode, useRef, useState } from "react";
import {
	Dialog,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@vetta-org/ui";
import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { SessionTopMenuItems } from "@vetta-org/ui/session-top-item";
import type { HeaderActionBarItem } from "./HeaderActionBarView";
import { HeaderActionDialogContent } from "./HeaderActionDialogContent";
import { HEADER_ACTION_POPOVER_WIDTH, headerActionToneBadgeClass } from "./header-action-appearance";
import { narrowOverflowBadge } from "./header-action-narrow";

function MenuIcon({ children }: { readonly children: ReactNode }): JSX.Element {
	return (
		<span className="pointer-events-none flex size-4 shrink-0 items-center justify-center overflow-hidden text-[14px] [&>*]:max-h-4 [&>*]:max-w-4 [&>[data-vetta-plugin-root]>*]:max-h-4 [&>[data-vetta-plugin-root]>*]:max-w-4">
			{children}
		</span>
	);
}

function OverflowRowBody({ item }: { readonly item: HeaderActionBarItem }): JSX.Element {
	const count = typeof item.badge === "number" && item.badge > 0 ? item.badge : undefined;
	const tone = headerActionToneBadgeClass(item.tone) ?? "bg-destructive";
	return (
		<>
			<MenuIcon>{item.icon}</MenuIcon>
			<span className="min-w-0 flex-1 truncate">{item.title}</span>
			{item.badge === true ? <span className={`size-1.5 shrink-0 rounded-full ${tone}`} /> : null}
			{count !== undefined ? (
				<span
					className={`flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full px-1 text-[9px] leading-none font-semibold text-background tabular-nums ${tone}`}
				>
					{count > 99 ? "99+" : count}
				</span>
			) : null}
		</>
	);
}

function OverflowEntry({
	item,
	onClose,
	onDialog,
}: {
	readonly item: HeaderActionBarItem;
	readonly onClose: () => void;
	readonly onDialog: () => void;
}): JSX.Element {
	const { behavior } = item;
	const activeClass = item.active ? "bg-foreground/[0.06]" : undefined;
	if (behavior.type === "menu") {
		return (
			<DropdownMenuSub>
				<DropdownMenuSubTrigger
					title={item.disabled ? item.disabledReason : undefined}
					disabled={item.disabled}
					className={activeClass}
					data-header-action-overflow-item={item.key}
				>
					<OverflowRowBody item={item} />
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="min-w-40">
					<SessionTopMenuItems items={behavior.items} onClose={onClose} />
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		);
	}
	if (behavior.type === "popover" && behavior.host !== "dialog") {
		const width = HEADER_ACTION_POPOVER_WIDTH[behavior.size ?? "md"];
		return (
			<DropdownMenuSub>
				<DropdownMenuSubTrigger
					disabled={item.disabled}
					className={activeClass}
					data-header-action-overflow-item={item.key}
				>
					<OverflowRowBody item={item} />
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className={`max-h-[min(70vh,32rem)] overflow-auto p-2 ${width}`}>
					{behavior.render({ close: onClose })}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		);
	}
	return (
		<DropdownMenuItem
			disabled={item.disabled}
			className={activeClass}
			data-header-action-overflow-item={item.key}
			onSelect={behavior.type === "click" ? behavior.onClick : onDialog}
		>
			<OverflowRowBody item={item} />
		</DropdownMenuItem>
	);
}

/** 页头挤窄时替代整排按钮的那一个下拉：点开仍能用到原来的动作。 */
export function HeaderActionOverflowMenu({
	items,
	label,
	closeLabel,
}: {
	readonly items: readonly HeaderActionBarItem[];
	readonly label: string;
	readonly closeLabel: string;
}): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const [dialogKey, setDialogKey] = useState<string | null>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const activeDialog = items.find((item) => item.key === dialogKey);
	const dialogBehavior = activeDialog?.behavior;
	return (
		<>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<ButtonGroup blur={false}>
					<DropdownMenuTrigger asChild>
						<ButtonGroupItem
							ref={trigger}
							title={label}
							aria-label={label}
							data-header-action-overflow="true"
							badge={narrowOverflowBadge(items)}
							icon={<span className="icon-[solar--menu-dots-bold] pointer-events-none text-[14px]" />}
						/>
					</DropdownMenuTrigger>
				</ButtonGroup>
				<DropdownMenuContent
					align="end"
					sideOffset={6}
					className="min-w-44"
					onCloseAutoFocus={(event) => {
						if (activeDialog) event.preventDefault();
					}}
				>
					{items.map((item) => (
						<OverflowEntry
							key={item.key}
							item={item}
							onClose={() => setMenuOpen(false)}
							onDialog={() => setDialogKey(item.key)}
						/>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			{activeDialog && dialogBehavior?.type === "popover" && dialogBehavior.host === "dialog" && (
				<Dialog
					open
					onOpenChange={(open) => {
						if (!open) setDialogKey(null);
					}}
				>
					<HeaderActionDialogContent
						title={dialogBehavior.dialogTitle ?? activeDialog.title}
						behavior={dialogBehavior}
						closeLabel={closeLabel}
						onClose={() => setDialogKey(null)}
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							trigger.current?.focus();
						}}
					/>
				</Dialog>
			)}
		</>
	);
}
