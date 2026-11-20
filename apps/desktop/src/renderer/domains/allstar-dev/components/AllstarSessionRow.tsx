// Modified by The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { Input } from "@shared/components/ui/input";
import { useRef, useState } from "react";
import type { AllstarDevCardSession, AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";

/**
 * 版块里的一行开发会话（卡片与「全部 N 个」弹窗共用同一份实现）。
 *
 * 结构：整行是普通容器，标题自身是打开会话的按钮，行尾 `···` 是独立的菜单按钮。
 * 早期版本把整行做成 `role="button"` 再挂一个装饰性 `···` 占位，结果是点 `···`
 * 冒泡进整行、直接把会话打开——一个看起来能点的东西做出了相反的行为（BUG-0194）。
 * 兄弟节点布局同时满足「按钮不嵌套按钮」。
 *
 * 三项动作只覆盖对代码会话真正生效的能力：置顶与归档在侧栏没有承载面（代码会话
 * 不进普通侧栏列表），放进来只会是点了没反应的假动作。
 */
export function AllstarSessionRow({
	cwd,
	session,
	labels,
	onOpen,
	onRename,
	onDelete,
	onReveal,
}: {
	cwd: string;
	session: AllstarDevCardSession;
	labels: AllstarDevHomePageModel["labels"];
	onOpen: () => void;
	onRename: (cwd: string, session: AllstarDevCardSession, name: string) => void;
	onDelete: (cwd: string, session: AllstarDevCardSession) => void;
	onReveal: (session: AllstarDevCardSession) => void;
}): JSX.Element {
	const [draft, setDraft] = useState<string | null>(null);
	// Enter 提交后输入框失焦还会再触发一次 onBlur，用 ref 保证只提交一次。
	const committedRef = useRef(false);
	// BUG-0195：协调会话数据文件缺失的团队会话置灰、不可打开，菜单只保留「删除」
	// （打开与改名对该条目必失败，删除是唯一出口——删除链路已有 BUG-0087 降级）。
	const dataFileMissing = session.dataFileMissing === true;
	// 团队会话可能尚未生成标题（自动标题未落或登记为空）：与侧栏同口径的兜底名。
	const displayTitle = session.title || labels.untitledTeamSession;

	const startRename = (): void => {
		committedRef.current = false;
		setDraft(displayTitle);
	};
	const cancelRename = (): void => {
		committedRef.current = true;
		setDraft(null);
	};
	const commitRename = (): void => {
		if (committedRef.current) return;
		committedRef.current = true;
		if (draft !== null) onRename(cwd, session, draft);
		setDraft(null);
	};

	return (
		<div className="group/row flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/50">
			{draft === null ? (
				<Button
					variant="ghost"
					onClick={dataFileMissing ? undefined : onOpen}
					disabled={dataFileMissing}
					title={displayTitle}
					className="h-auto min-w-0 flex-1 justify-start border-0 bg-transparent px-0 py-0 text-left text-[13px] font-normal text-foreground hover:bg-transparent focus-visible:border-0 aria-disabled:opacity-60"
				>
					<span className="min-w-0 truncate">{displayTitle}</span>
				</Button>
			) : (
				<Input
					// biome-ignore lint/a11y/noAutofocus: 重命名入口的即时编辑框，焦点必须落到输入框。
					autoFocus
					value={draft}
					aria-label={labels.renameSession}
					className="h-6 flex-1 text-[13px]"
					onChange={(event) => setDraft(event.currentTarget.value)}
					onBlur={commitRename}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commitRename();
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							cancelRename();
						}
					}}
				/>
			)}
			{draft === null && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={labels.sessionActions}
							className="opacity-30 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
						>
							<span aria-hidden className="icon-[solar--menu-dots-bold] h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{dataFileMissing ? null : (
							<>
								<DropdownMenuItem onSelect={startRename}>
									<span aria-hidden className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
									{labels.renameSession}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => onReveal(session)}>
									<span aria-hidden className="icon-[solar--folder-open-linear] h-3.5 w-3.5" />
									{labels.revealSessionInFolder}
								</DropdownMenuItem>
								{/* 删除与整理类动作之间留一道分隔，误点的代价不对等。 */}
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuItem onSelect={() => onDelete(cwd, session)}>
							<span aria-hidden className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
							{labels.deleteSession}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
