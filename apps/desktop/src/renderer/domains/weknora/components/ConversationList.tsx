// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraSession } from "@preload/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Button } from "@vetta-org/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { agentNameOfSession, formatSessionTime, type WeKnoraErrorCode, type WeKnoraHistoryStatus } from "../atoms";
import { WeKnoraSessionContextMenu, type WeKnoraSessionMenuItem } from "./WeKnoraSessionContextMenu";

export interface ConversationListProps {
	readonly sessions: readonly WeKnoraSession[];
	/** 用于把会话的 `last_request_state.agent_id` 映射成 agent 名（AC-20）。 */
	readonly agents: readonly WeKnoraAgent[];
	readonly status: WeKnoraHistoryStatus;
	readonly currentSessionId: string | null;
	readonly loadingSessionId: string | null;
	/** 有活跃流（含后台思考）的会话 id 集合：行级「思考中」指示与禁删判定（AC-19 / AC-10）的状态源。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	/** 正在删除的会话 id（AC-12 防重复）；`null` = 无进行中的删除请求。 */
	readonly deletingSessionId: string | null;
	/** 删除失败的归一化错误码（AC-11）；非 `null` 时在列表顶部出内联错误块。 */
	readonly deleteError: WeKnoraErrorCode | null;
	readonly onNewConversation: () => void;
	readonly onOpenSession: (sessionId: string) => void;
	readonly onReload: () => void;
	/** 删除会话（AC-8）：真删 + 成功后重拉；返回是否成功（失败时确认弹窗不关）。 */
	readonly onDeleteSession: (sessionId: string) => Promise<boolean>;
}

/**
 * 历史会话侧栏（AC-13 / AC-20 / B 组删除）。
 *
 * - 「新建对话」清空当前对话（AC-12，由连接层落实，本组件只发信号）。
 * - 每行显示会话标题、绑定的 agent 名（映射不到显示「未知」，AC-20）与更新时间。
 * - **点行不直接切换**：先弹确认（用户 2026-10-16 裁定 1d）——因为打开会替换当前对话；
 *   取消则什么都不做（不切换、不载入），只有确认才回调 `onOpenSession`。
 * - **右键行弹上下文菜单**（AC-6，仅「删除会话」）→ 确认弹窗（AC-7，注明不可恢复）→
 *   真删（AC-8）。失败出内联错误块可重试（AC-11），会话行**原样保留**（不假装删掉）；
 *   请求进行中确认按钮防重复（AC-12）。
 */
export function ConversationList({
	sessions,
	agents,
	status,
	currentSessionId,
	loadingSessionId,
	streamingSessionIds,
	deletingSessionId,
	deleteError,
	onNewConversation,
	onOpenSession,
	onReload,
	onDeleteSession,
}: ConversationListProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [pending, setPending] = useState<WeKnoraSession | null>(null);
	/** 右键落点 + 目标会话；非空即渲染菜单（portal 到 body）。 */
	const [menu, setMenu] = useState<{ x: number; y: number; session: WeKnoraSession } | null>(null);
	/** 待确认删除的会话（确认弹窗的目标）。 */
	const [pendingDelete, setPendingDelete] = useState<WeKnoraSession | null>(null);
	/** 最近一次删除失败的目标：内联错误块的重试对象（块本身由 `deleteError` 驱动显隐）。 */
	const [failedDeleteId, setFailedDeleteId] = useState<string | null>(null);

	const confirmOpen = (): void => {
		if (pending === null) return;
		const targetId = pending.id;
		setPending(null);
		onOpenSession(targetId);
	};

	// 菜单项按目标会话现算（可扩展结构，AC-6）：AC-10 禁删 = 目标在 T01 的活跃流集合里
	// （含后台思考）；禁用时原因写进菜单文案（照「运行中禁归档」先例，不弹 toast）。
	const menuItems = (): readonly WeKnoraSessionMenuItem[] => {
		if (menu === null) return [];
		const deleteDisabled = streamingSessionIds.has(menu.session.id);
		return [
			{
				id: "delete",
				label: deleteDisabled ? t("delete.disabledStreaming") : t("menu.delete"),
				iconClassName: "icon-[solar--trash-bin-trash-linear]",
				danger: true,
				disabled: deleteDisabled,
				onSelect: () => setPendingDelete(menu.session),
			},
		];
	};

	// AC-12：请求进行中由 view model 的 deletingSessionId 禁住确认按钮，这里只挡空目标。
	const confirmDelete = async (): Promise<void> => {
		if (pendingDelete === null) return;
		const target = pendingDelete;
		const deleted = await onDeleteSession(target.id);
		if (deleted) {
			setPendingDelete(null);
			setFailedDeleteId(null);
		} else {
			// 失败：弹窗不关（确认按钮已恢复可用），同时记下目标供内联错误块重试（AC-11）。
			setFailedDeleteId(target.id);
		}
	};

	const retryDelete = async (): Promise<void> => {
		if (failedDeleteId === null) return;
		const deleted = await onDeleteSession(failedDeleteId);
		if (deleted) setFailedDeleteId(null);
	};

	return (
		<nav
			aria-label={t("conversation.historyTitle")}
			className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden border-border/40 border-r pr-4"
		>
			<Button className="justify-start" onClick={onNewConversation} size="sm" type="button" variant="outline">
				<span aria-hidden="true" className="icon-[solar--add-circle-linear]" />
				{t("conversation.new")}
			</Button>

			<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
				{status === "loading" ? (
					<p className="px-1 text-[12px] text-muted-foreground/60">{t("conversation.loading")}</p>
				) : null}

				{status === "error" ? (
					<div className="rounded-lg border border-border/50 bg-card/40 p-3">
						<p className="text-[12px] text-foreground">{t("conversation.error")}</p>
						<Button className="mt-2" onClick={onReload} size="sm" type="button" variant="outline">
							{t("conversation.retry")}
						</Button>
					</div>
				) : null}

				{/* AC-11：删除失败的内联错误块（复用列表既有错误块形态）。会话行不动——列表绝不假装删掉。 */}
				{deleteError !== null && failedDeleteId !== null ? (
					<div className="rounded-lg border border-border/50 bg-card/40 p-3">
						<p className="text-[12px] text-foreground">{t("delete.error")}</p>
						<Button
							className="mt-2"
							disabled={deletingSessionId !== null}
							onClick={() => void retryDelete()}
							size="sm"
							type="button"
							variant="outline"
						>
							{t("delete.retry")}
						</Button>
					</div>
				) : null}

				{status === "ready" && sessions.length === 0 ? (
					<div className="flex flex-col items-start gap-2 px-1">
						<p className="text-[12px] text-muted-foreground/60">{t("conversation.empty")}</p>
						{/* 缺陷 3（实机反馈）：空状态也提供刷新入口 —— 否则只能刷新整页，而刷新页面会丢掉当前对话。 */}
						<Button onClick={onReload} size="sm" type="button" variant="outline">
							{t("conversation.refresh")}
						</Button>
					</div>
				) : null}

				<ul className="flex flex-col gap-1">
					{sessions.map((session) => {
						const agentName = agentNameOfSession(agents, session);
						const time = formatSessionTime(session.updated_at ?? session.created_at);
						const isCurrent = session.id === currentSessionId;
						// AC-19：行级「思考中」指示。状态源是流缓冲派生集合 —— 缓冲种下即亮、
						// 终态/取消释放即灭，与实际流状态一致（无假活/假死）；文案不只靠颜色传达。
						const isThinking = streamingSessionIds.has(session.id);
						return (
							<li key={session.id}>
								<button
									type="button"
									aria-current={isCurrent ? "true" : undefined}
									className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
										isCurrent ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/30"
									}`}
									disabled={session.id === loadingSessionId}
									onClick={() => setPending(session)}
									onContextMenu={(event) => {
										// AC-6：右键弹菜单（坐标 = 指针落点，与 project 侧右键菜单同一模式）。
										event.preventDefault();
										setMenu({ x: event.clientX, y: event.clientY, session });
									}}
								>
									<span className="truncate text-[13px] text-foreground">
										{session.title?.trim() || t("conversation.untitled")}
									</span>
									<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
										<span className="truncate">{agentName ?? t("conversation.unknownAgent")}</span>
										{isThinking ? (
											<span className="flex shrink-0 items-center gap-1 text-emerald-400">
												{/* 呼吸点走宿主统一挂载的登记类名（DESIGN.md「进行中」指示规范），不自写关键帧。 */}
												<span aria-hidden="true" className="vetta-live-dot h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
												{t("conversation.thinking")}
											</span>
										) : null}
										{time ? <span className="ml-auto shrink-0">{time}</span> : null}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>

			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("conversation.confirmTitle")}</DialogTitle>
						<DialogDescription>{t("conversation.confirmBody")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setPending(null)} type="button" variant="outline">
							{t("conversation.confirmCancel")}
						</Button>
						<Button onClick={confirmOpen} type="button" variant="primary">
							{t("conversation.confirmOk")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* AC-7：删除确认弹窗（与「打开历史会话」确认同款交互）。请求进行中不提前关、
			    确认按钮防重复（AC-12）；失败保持打开、按钮恢复可用。 */}
			<Dialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("delete.confirmTitle")}</DialogTitle>
						<DialogDescription>{t("delete.confirmBody")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setPendingDelete(null)} type="button" variant="outline">
							{t("delete.cancel")}
						</Button>
						<Button
							disabled={deletingSessionId !== null}
							onClick={() => void confirmDelete()}
							type="button"
							variant="primary"
						>
							{deletingSessionId !== null ? t("delete.deleting") : t("delete.confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{menu === null ? null : (
				<WeKnoraSessionContextMenu items={menuItems()} onClose={() => setMenu(null)} x={menu.x} y={menu.y} />
			)}
		</nav>
	);
}
