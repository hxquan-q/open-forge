// Copyright The Open Forge contributors.
import type { ComponentProps, JSX } from "react";
import { Button, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@vetta-org/ui";
import type { HeaderActionBehavior } from "./HeaderActionBarView";
import { HEADER_ACTION_POPOVER_WIDTH } from "./header-action-appearance";

export function HeaderActionDialogContent({
	title,
	behavior,
	closeLabel,
	onClose,
	onCloseAutoFocus,
}: {
	readonly title: string;
	readonly behavior: Extract<HeaderActionBehavior, { type: "popover" }>;
	readonly closeLabel: string;
	readonly onClose: () => void;
	readonly onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}): JSX.Element {
	const width = HEADER_ACTION_POPOVER_WIDTH[behavior.size ?? "md"];
	return (
		<DialogContent
			aria-describedby={undefined}
			className={`max-h-[min(80vh,40rem)] overflow-auto ${width}`}
			showCloseButton={false}
			onOpenAutoFocus={undefined}
			onCloseAutoFocus={onCloseAutoFocus}
		>
			<DialogHeader className="pr-8">
				<DialogTitle className="text-[15px]">{title}</DialogTitle>
			</DialogHeader>
			<DialogClose asChild>
				<Button variant="ghost" size="icon-sm" aria-label={closeLabel} className="absolute top-2 right-2">
					<span aria-hidden="true" className="icon-[solar--close-circle-linear] size-4" />
				</Button>
			</DialogClose>
			{behavior.render({ close: onClose })}
		</DialogContent>
	);
}
