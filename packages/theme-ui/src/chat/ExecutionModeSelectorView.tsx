import { AnimatePresence, motion } from "motion/react";
import type { JSX } from "react";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@vetta-org/ui";
import { ThemeSurface } from "../appearance/ThemeSurface";

export interface ExecutionModeOptionView {
	readonly mode: string;
	readonly icon: string;
	readonly label: string;
	readonly title: string;
	readonly disabled: boolean;
	readonly selected: boolean;
}

export interface ExecutionModeSandboxNotice {
	/** 已本地化的不可用原因（宿主按 capability.reason 映射，视图不猜）。 */
	readonly reason: string;
	/** 已本地化的「当前实际按哪种模式执行」。 */
	readonly mode: string;
	/** 主进程原始诊断文本：只作悬停提示，不进入可见文案（可能是未本地化的宿主原文）。 */
	readonly details?: string;
}

export interface ExecutionModeSelectorViewProps {
	readonly open: boolean;
	readonly disabled: boolean;
	readonly selectedOption: ExecutionModeOptionView;
	readonly options: readonly ExecutionModeOptionView[];
	/**
	 * 沙盒受限不可用的原因与当前生效模式，渲染在选项下方。宿主不下发就不渲染：
	 * 能力探测结果和「现在到底按哪种模式执行」都是宿主语义，视图不猜，也不承诺恢复方式。
	 */
	readonly sandboxNotice?: ExecutionModeSandboxNotice;
	readonly className?: string;
	readonly classNames?: {
		readonly root?: string;
		readonly trigger?: string;
		readonly content?: string;
		readonly contentInner?: string;
		readonly item?: string;
	};
	readonly onOpenChange: (open: boolean) => void;
	readonly onSelect: (mode: string) => void;
}

export function ExecutionModeSelectorView({
	open,
	disabled,
	selectedOption,
	options,
	sandboxNotice,
	className,
	classNames,
	onOpenChange,
	onSelect,
}: ExecutionModeSelectorViewProps): JSX.Element {
	return (
		<div className={cn("ml-1 min-w-0", className, classNames?.root)}>
			<Popover open={open} onOpenChange={disabled ? undefined : onOpenChange}>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						title={selectedOption.title}
						className={cn(
							// 窄容器只保留图标（title 仍可悬停查看模式名），宽了再显示文案
							"no-drag flex h-7 max-w-full min-w-0 items-center gap-1 rounded-lg px-1.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 @[22rem]:gap-1.5 @[22rem]:px-2",
							open
								? "bg-accent text-foreground"
								: "text-foreground hover:bg-accent/60",
							classNames?.trigger,
						)}
					>
						<span className={cn(selectedOption.icon, "h-3.5 w-3.5 shrink-0")} />
						<span className="hidden min-w-0 max-w-[5.5rem] truncate @[22rem]:inline">{selectedOption.label}</span>
					</button>
				</PopoverTrigger>
				<AnimatePresence>
					{open && (
						<PopoverContent
							forceMount
							asChild
							side="top"
							align="start"
							sideOffset={6}
							className={cn(
								// 有说明行时放宽，否则原因会被挤成逐字换行
								sandboxNotice ? "w-[248px]" : "w-[148px]",
								"gap-0 overflow-visible rounded-lg border border-border p-0",
								classNames?.content,
							)}
							style={{ animation: "none" }}
						>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.12, ease: "easeOut" }}
								className="relative overflow-visible rounded-[inherit]"
							>
								<ThemeSurface slot="chat.executionModeMenu" />
								<div
									className={cn(
										"relative z-10 overflow-hidden rounded-[inherit] p-1",
										classNames?.contentInner,
									)}
								>
									{options.map((option) => (
										<button
											key={option.mode}
											type="button"
											title={option.title}
											disabled={option.disabled}
											onClick={() => {
												onOpenChange(false);
												onSelect(option.mode);
											}}
											className={cn(
												"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
												option.selected
													? "bg-accent text-foreground"
													: "text-foreground hover:bg-accent",
												classNames?.item,
											)}
										>
											<span className={cn(option.icon, "h-3.5 w-3.5 shrink-0")} />
											<span className="truncate">{option.label}</span>
											{option.selected && (
												<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 text-primary" />
											)}
										</button>
									))}
									{sandboxNotice && (
										<div className="mt-0.5 border-t border-border/60 px-2 pt-1.5 pb-0.5 text-[10px] leading-snug text-muted-foreground">
											<p title={sandboxNotice.details}>{sandboxNotice.reason}</p>
											<p>{sandboxNotice.mode}</p>
										</div>
									)}
								</div>
							</motion.div>
						</PopoverContent>
					)}
				</AnimatePresence>
			</Popover>
		</div>
	);
}
