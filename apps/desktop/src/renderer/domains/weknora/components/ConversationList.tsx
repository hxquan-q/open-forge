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
import { useShortcutScope } from "@shared/shortcuts";
import { Button } from "@vetta-org/ui";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { agentNameOfSession, formatSessionTime, type WeKnoraErrorCode, type WeKnoraHistoryStatus } from "../atoms";
import type { WeKnoraBatchDeleteResult, WeKnoraBatchExportResult } from "../hooks/useWeKnoraBatchActions";
import { useWeKnoraSelection } from "../hooks/useWeKnoraSelection";
import { WEKNORA_ERROR_KEYS } from "../services/weknoraErrorKeys";
import type { WeKnoraExportFormat } from "../services/weknoraExport";
import { buildSessionMenuItems } from "./weknoraSessionMenu";
import { WeKnoraExportFormatDialog } from "./WeKnoraExportFormatDialog";
import { WeKnoraSessionContextMenu, type WeKnoraSessionMenuItem } from "./WeKnoraSessionContextMenu";

export interface ConversationListProps {
	readonly sessions: readonly WeKnoraSession[];
	/** 用于把会话的 `last_request_state.agent_id` 映射成 agent 名（AC-20）。 */
	readonly agents: readonly WeKnoraAgent[];
	readonly status: WeKnoraHistoryStatus;
	readonly currentSessionId: string | null;
	readonly loadingSessionId: string | null;
	/** 有活跃流（含后台思考）的会话 id 集合：行级「思考中」指示、禁删判定与多选禁选（AC-19 / AC-10）的状态源。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	/** 正在删除的会话 id（AC-12 防重复）；`null` = 无进行中的删除请求。 */
	readonly deletingSessionId: string | null;
	/** 批量删除进行中（T04：批量确认按钮防重复）。 */
	readonly batchDeleting: boolean;
	/** 导出进行中（T05：单会话或批量任一在跑；入口按钮 / 菜单项防重复的驱动源）。 */
	readonly exporting: boolean;
	/** 删除失败的归一化错误码（AC-11）；非 `null` 时在列表顶部出内联错误块。 */
	readonly deleteError: WeKnoraErrorCode | null;
	readonly onNewConversation: () => void;
	readonly onOpenSession: (sessionId: string) => void;
	readonly onReload: () => void;
	/** 删除会话（AC-8）：真删 + 成功后重拉；返回是否成功（失败时确认弹窗不关）。 */
	readonly onDeleteSession: (sessionId: string) => Promise<boolean>;
	/** 批量删除（AC-10）：真删 + 聚合结果；失败项不静默（结果弹窗展示明细）。 */
	readonly onDeleteSessions: (sessionIds: readonly string[]) => Promise<WeKnoraBatchDeleteResult>;
	/** 单会话导出（AC-3）：拉全量 → 序列化 → 保存对话框；成功 / 失败反馈由连接层落实。 */
	readonly onExportSession: (sessionId: string, format: WeKnoraExportFormat) => Promise<void>;
	/** 批量导出（AC-9）：选目录 → 逐会话一文件；取消目录选择返回 `null`（零写入）。 */
	readonly onExportSessions: (
		sessionIds: readonly string[],
		format: WeKnoraExportFormat,
	) => Promise<WeKnoraBatchExportResult | null>;
}

/**
 * 历史会话侧栏（AC-13 / AC-20 / B 组删除 / T04 多选批量删除）。
 *
 * - 「新建对话」清空当前对话（AC-12，由连接层落实，本组件只发信号）。
 * - 每行显示会话标题、绑定的 agent 名（映射不到显示「未知」，AC-20）与更新时间。
 * - **点行直接切换**：点击历史会话行立即回调 `onOpenSession`（用户 2026-10-20 裁定去掉「替换确认」）；
 *   loading 期间该行禁用（`loadingSessionId`），其余行为与去确认前一致。
 * - **右键行弹上下文菜单**（AC-6）：「多选」进入多选模式（AC-8）或「删除会话」→ 确认弹窗（AC-7）→ 真删（AC-8）。
 *   失败出内联错误块可重试（AC-11），会话行**原样保留**（不假装删掉）；请求进行中确认按钮防重复（AC-12）。
 * - **多选模式**（AC-8/AC-10）：行可勾选（streaming 中禁选）、顶部操作条显示已选数 + 全选 / 批量导出 / 批量删除 / 取消；
 *   Esc 或「取消」退出。批量删除走确认弹窗（数量 + 不可恢复），完成后聚合「成功 N / 失败 M」。
 * - **导出**（AC-3/AC-9）：右键「导出会话」→ 格式（txt/md/docx）→ 单会话落盘；多选操作条「批量导出」→ 格式 →
 *   目录选择 → 逐会话一文件 → 结果「成功 N / 失败 M（明细）」。导出编排在 hook 层，本组件只做入口与弹窗。
 *
 * 单文件说明（C7）：本文件只对「历史会话侧栏」**一个 actor** 负责——行渲染、右键菜单接线、
 * 单删 / 批量删除 / 导出的确认与结果弹窗都是同一份侧栏状态的直接产物，拆开只会制造跨文件的 prop 搬运。
 * 已外提的独立职责：选择状态机（`useWeKnoraSelection`）、批量动作编排（`useWeKnoraBatchActions`）、
 * 单会话导出（`useWeKnoraExport`）、菜单项生成（`weknoraSessionMenu`）、格式弹窗
 * （`WeKnoraExportFormatDialog`）、错误文案表（`weknoraErrorKeys`）。
 */
export function ConversationList({
	sessions,
	agents,
	status,
	currentSessionId,
	loadingSessionId,
	streamingSessionIds,
	deletingSessionId,
	batchDeleting,
	exporting,
	deleteError,
	onNewConversation,
	onOpenSession,
	onReload,
	onDeleteSession,
	onDeleteSessions,
	onExportSession,
	onExportSessions,
}: ConversationListProps): JSX.Element {
	const { t } = useTranslation("weknora");
	/** 右键落点 + 目标会话；非空即渲染菜单（portal 到 body）。 */
	const [menu, setMenu] = useState<{ x: number; y: number; session: WeKnoraSession } | null>(null);
	/** 待确认删除的会话（单删确认弹窗的目标）。 */
	const [pendingDelete, setPendingDelete] = useState<WeKnoraSession | null>(null);
	/** 最近一次删除失败的目标：内联错误块的重试对象（块本身由 `deleteError` 驱动显隐）。 */
	const [failedDeleteId, setFailedDeleteId] = useState<string | null>(null);
	/** 批量删除确认弹窗是否打开。 */
	const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
	/** 批量删除的聚合结果；非空即弹结果弹窗（成功 N / 失败 M 明细）。 */
	const [batchResult, setBatchResult] = useState<WeKnoraBatchDeleteResult | null>(null);
	/** 待选格式的导出请求（T05 / AC-3）；非空即弹格式选择弹窗（单会话 / 批量共用）。 */
	const [exportRequest, setExportRequest] = useState<
		{ readonly kind: "single"; readonly session: WeKnoraSession } | { readonly kind: "batch" } | null
	>(null);
	/** 批量导出的聚合结果（T05 / AC-9）；非空即弹结果弹窗（成功 N / 失败 M 明细）。 */
	const [batchExportResult, setBatchExportResult] = useState<WeKnoraBatchExportResult | null>(null);
	const selection = useWeKnoraSelection();

	// 可选集合 = 在列表中且无活跃流（streaming 中禁选，AC-10）。删除 / 开始流式后选择自动收敛。
	const selectableIds = useMemo(
		() => sessions.filter((session) => !streamingSessionIds.has(session.id)).map((session) => session.id),
		[sessions, streamingSessionIds],
	);
	const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);

	// 列表变化后剔除已消失 / 已转流式的勾选项（计数不虚高，批量删除不会误伤运行中的会话）。
	useEffect(() => {
		if (selection.active) selection.prune(selectableIdSet);
	}, [selection.active, selection.prune, selectableIdSet]);

	// Esc 退出多选模式（走统一快捷键作用域栈，AGENTS.md §8）。弹窗 / 菜单打开时不接管
	// （菜单的 overlay scope 优先级更高；弹窗由 radix 自行处理 Esc）。
	useShortcutScope({
		id: "surface:weknora-multi-select",
		kind: "surface",
		active:
			selection.active &&
			!batchConfirmOpen &&
			batchResult === null &&
			pendingDelete === null &&
			exportRequest === null &&
			batchExportResult === null,
		bindings: [{ key: "escape", run: () => selection.exit() }],
	});

	// 菜单项按目标会话现算（可扩展结构，AC-6）：AC-10 禁删 = 目标在活跃流集合里（含后台思考）；
	// 禁用时原因写进菜单文案（照「运行中禁归档」先例，不弹 toast）。项生成见 buildSessionMenuItems。
	const menuItems = (): readonly WeKnoraSessionMenuItem[] => {
		if (menu === null) return [];
		const deleteDisabled = streamingSessionIds.has(menu.session.id);
		return buildSessionMenuItems({
			labels: {
				delete: deleteDisabled ? t("delete.disabledStreaming") : t("menu.delete"),
				multiSelect: t("menu.multiSelect"),
				export: t("menu.export"),
			},
			deleteDisabled,
			exportDisabled: exporting,
			multiSelectActive: selection.active,
			onDelete: () => setPendingDelete(menu.session),
			onEnterMultiSelect: () => selection.enter(),
			onExport: () => setExportRequest({ kind: "single", session: menu.session }),
		});
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

	// 批量删除：捕获当前勾选（弹窗期间可能因列表刷新收敛），走聚合编排，完成后弹结果 + 退出多选。
	const confirmBatchDelete = async (): Promise<void> => {
		const targets = [...selection.selectedIds];
		if (targets.length === 0) return;
		const result = await onDeleteSessions(targets);
		setBatchConfirmOpen(false);
		setBatchResult(result);
		selection.exit();
	};

	// 导出（T05）：格式选定后分派到单会话 / 批量。先关格式弹窗（导出中的禁用态由 `exporting` 承担）。
	// 批量取消目录选择时返回 `null` —— 零写入、不出结果弹窗。
	const confirmExport = async (format: WeKnoraExportFormat): Promise<void> => {
		const request = exportRequest;
		if (request === null) return;
		setExportRequest(null);
		if (request.kind === "single") {
			await onExportSession(request.session.id, format);
			return;
		}
		const result = await onExportSessions([...selection.selectedIds], format);
		if (result !== null) setBatchExportResult(result);
	};

	const titleOf = (sessionId: string): string =>
		sessions.find((session) => session.id === sessionId)?.title?.trim() || t("conversation.untitled");

	return (
		<nav
			aria-label={t("conversation.historyTitle")}
			className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden border-border/40 border-r pr-4"
		>
			{/* AC-8：多选模式操作条（进入后取代「新建对话」，聚焦批量动作）。 */}
			{selection.active ? (
				<div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 px-2.5 py-2">
					<div className="flex items-center justify-between gap-2">
						<span aria-live="polite" className="text-[12px] text-foreground">
							{t("selection.selected", { count: selection.count })}
						</span>
						<Button onClick={selection.exit} size="sm" type="button" variant="ghost">
							{t("selection.exit")}
						</Button>
					</div>
					<div className="flex items-center gap-1.5">
						<Button
							disabled={selectableIds.length === 0}
							onClick={() => selection.selectAll(selectableIds)}
							size="sm"
							type="button"
							variant="outline"
						>
							{t("selection.selectAll")}
						</Button>
						<Button
							disabled={selection.count === 0 || exporting}
							onClick={() => setExportRequest({ kind: "batch" })}
							size="sm"
							type="button"
							variant="outline"
						>
							{exporting ? t("batchExport.exporting") : t("selection.export")}
						</Button>
						<Button
							disabled={selection.count === 0}
							onClick={() => setBatchConfirmOpen(true)}
							size="sm"
							type="button"
							variant="destructive"
						>
							{t("selection.delete")}
						</Button>
					</div>
				</div>
			) : (
				<Button className="justify-start" onClick={onNewConversation} size="sm" type="button" variant="outline">
					<span aria-hidden="true" className="icon-[solar--add-circle-linear]" />
					{t("conversation.new")}
				</Button>
			)}

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
						// AC-10：streaming 中禁选（与禁删同源）。
						const selectable = !isThinking;
						const selected = selection.active && selection.isSelected(session.id);
						// 多选模式下选中态用与「当前会话」同族的强调底色 + 勾选框；单模式保持原视觉。
						const highlighted = selection.active ? selected : isCurrent;
						const rowClassName = `flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
							highlighted ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/30"
						} ${selection.active && !selectable ? "opacity-60" : ""}`;
						return (
							<li key={session.id}>
								<button
									type="button"
									aria-current={!selection.active && isCurrent ? "true" : undefined}
									aria-pressed={selection.active ? selected : undefined}
									className={rowClassName}
									disabled={selection.active ? !selectable : session.id === loadingSessionId}
									onClick={() => {
										if (selection.active) {
											if (selectable) selection.toggle(session.id);
											return;
										}
										onOpenSession(session.id);
									}}
									onContextMenu={(event) => {
										// AC-6：右键弹菜单（坐标 = 指针落点，与 project 侧右键菜单同一模式）。
										event.preventDefault();
										setMenu({ x: event.clientX, y: event.clientY, session });
									}}
								>
									{selection.active ? (
										// 勾选框视觉（仅装饰；状态由按钮的 aria-pressed 暴露给辅助技术）。
										<span
											aria-hidden="true"
											className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
												selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
											}`}
										>
											{selected ? <span className="icon-[solar--check-read-linear] h-3 w-3" /> : null}
										</span>
									) : null}
									<span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>

			{/* AC-7：单删确认弹窗。请求进行中不提前关、确认按钮防重复（AC-12）；失败保持打开、按钮恢复可用。 */}
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

			{/* AC-10：批量删除确认弹窗（数量 + 不可恢复）；进行中防重复。 */}
			<Dialog
				open={batchConfirmOpen}
				onOpenChange={(open) => {
					if (!open) setBatchConfirmOpen(false);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("batchDelete.confirmTitle")}</DialogTitle>
						<DialogDescription>{t("batchDelete.confirmBody", { count: selection.count })}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setBatchConfirmOpen(false)} type="button" variant="outline">
							{t("batchDelete.cancel")}
						</Button>
						<Button
							disabled={batchDeleting}
							onClick={() => void confirmBatchDelete()}
							type="button"
							variant="primary"
						>
							{batchDeleting ? t("batchDelete.deleting") : t("batchDelete.confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* AC-10 / D5：批量删除结果（成功 N / 失败 M 明细，失败绝不静默）。 */}
			<Dialog
				open={batchResult !== null}
				onOpenChange={(open) => {
					if (!open) setBatchResult(null);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("batchDelete.resultTitle")}</DialogTitle>
						<DialogDescription>
							{t("batchDelete.resultSucceeded", { count: batchResult?.succeeded.length ?? 0 })}
						</DialogDescription>
					</DialogHeader>
					{batchResult && batchResult.failed.length > 0 ? (
						<div className="flex flex-col gap-1">
							<p className="text-[12px] text-foreground">
								{t("batchDelete.resultFailed", { count: batchResult.failed.length })}
							</p>
							<ul className="flex flex-col gap-1">
								{batchResult.failed.map((failure) => (
									<li key={failure.sessionId} className="text-[12px] text-destructive">
										{t("batchDelete.resultFailedItem", {
											name: titleOf(failure.sessionId),
											reason: t(WEKNORA_ERROR_KEYS[failure.errorCode]),
										})}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<DialogFooter>
						<Button onClick={() => setBatchResult(null)} type="button" variant="outline">
							{t("batchDelete.close")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* AC-3：导出格式选择弹窗（单会话 / 批量共用）；关闭即中止、零写入。 */}
			<WeKnoraExportFormatDialog
				onCancel={() => setExportRequest(null)}
				onSelect={(format) => void confirmExport(format)}
				open={exportRequest !== null}
				title={exportRequest?.kind === "single" ? t("export.formatTitleSingle") : t("export.formatTitleBatch")}
			/>

			{/* AC-9 / D5：批量导出结果（成功 N / 失败 M 明细，失败绝不静默）。 */}
			<Dialog
				open={batchExportResult !== null}
				onOpenChange={(open) => {
					if (!open) setBatchExportResult(null);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("batchExport.resultTitle")}</DialogTitle>
						<DialogDescription>
							{t("batchExport.resultSucceeded", { count: batchExportResult?.succeeded.length ?? 0 })}
						</DialogDescription>
					</DialogHeader>
					{batchExportResult && batchExportResult.failed.length > 0 ? (
						<div className="flex flex-col gap-1">
							<p className="text-[12px] text-foreground">
								{t("batchExport.resultFailed", { count: batchExportResult.failed.length })}
							</p>
							<ul className="flex flex-col gap-1">
								{batchExportResult.failed.map((failure) => (
									<li key={failure.sessionId} className="text-[12px] text-destructive">
										{t("batchExport.resultFailedItem", {
											name: titleOf(failure.sessionId),
											reason:
												failure.kind === "write"
													? t("batchExport.writeFailed")
													: t(WEKNORA_ERROR_KEYS[failure.errorCode ?? "unknown"]),
										})}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<DialogFooter>
						<Button onClick={() => setBatchExportResult(null)} type="button" variant="outline">
							{t("batchExport.close")}
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
