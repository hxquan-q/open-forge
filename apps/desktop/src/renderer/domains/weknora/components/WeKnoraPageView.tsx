// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraSession } from "@preload/api";
import { Input } from "@shared/components/ui/input";
import { Button } from "@vetta-org/ui";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WeKnoraAgentsStatus, WeKnoraChatMessage, WeKnoraErrorCode, WeKnoraHistoryStatus } from "../atoms";
import {
	persistWeKnoraSidebarCollapsed,
	readPersistedWeKnoraSidebarCollapsed,
} from "../weknora-sidebar-state";
import { AgentSelector } from "./AgentSelector";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { WeKnoraComposer } from "./WeKnoraComposer";

/**
 * 侧栏收起/展开动画（D 组 AC-10~12）。
 *
 * - 展开宽度 = `ConversationList` 的 `nav` 宽度（`w-64` = 16rem）+ 原内容行 `flex gap-4` 的间隙（1rem）。
 *   间隙并入动画宽度一起归零：若把它留在内容行的 `gap-4` 上，收起终态会残留 16px 空隙
 *   （票面「flex 间隙」提醒的正是这个坑）。
 * - 时长约 200ms；缓动与 abilities 域入场先例一致。
 * - **终态必须卸载**（AC-11）：动画只是过渡，不得留下不可见占位节点，故用 `sidebarPresent` 控制挂载。
 */
const SIDEBAR_SLOT_WIDTH = "17rem";
const SIDEBAR_ANIMATION_MS = 200;
const SIDEBAR_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * 渲染期读取系统「减少动态效果」偏好（AC-12）：为真时收起/展开瞬时切换。
 *
 * 直接读 `matchMedia`，不用 motion 的 `useReducedMotion`——后者在进程内首次调用时一次性
 * 缓存结果，既不随偏好变化更新，也无法在单个测试文件内分别验证两种分支
 * （仓库 live-animations / theme/apply 同样是直接读法）。
 */
function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;
}

export interface WeKnoraPageViewProps {
	readonly configured: boolean;
	readonly baseUrl: string;
	readonly hasApiKey: boolean;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	readonly messages: readonly WeKnoraChatMessage[];
	readonly isStreaming: boolean;
	readonly currentSessionId: string | null;
	readonly sessions: readonly WeKnoraSession[];
	readonly sessionsStatus: WeKnoraHistoryStatus;
	readonly loadingSessionId: string | null;
	/** 有活跃流（含后台思考）的会话 id 集合（AC-19 行级指示 / AC-10 禁删判定的状态源）。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	/** 正在删除的会话 id（AC-12 防重复标记）；`null` = 无进行中的删除请求。 */
	readonly deletingSessionId: string | null;
	/** 删除失败的归一化错误码（AC-11）；非 `null` 时侧栏出内联错误块。 */
	readonly deleteError: WeKnoraErrorCode | null;
	readonly saving: boolean;
	/** 最近一次保存配置失败的归一化错误码；`null` = 无错误（④）。 */
	readonly saveError: WeKnoraErrorCode | null;
	readonly onSelectAgent: (agentId: string) => void;
	readonly onSend: (text: string) => void;
	readonly onCancel: () => void;
	readonly onNewConversation: () => void;
	readonly onOpenSession: (sessionId: string) => void;
	/** 删除历史会话（AC-8）；返回是否成功（失败时确认弹窗不关）。 */
	readonly onDeleteSession: (sessionId: string) => Promise<boolean>;
	readonly onReloadSessions: () => void;
	readonly onSaveSetup: (input: { baseUrl: string; apiKey?: string }) => void;
	readonly onReloadAgents: () => void;
}

/** 「智能客服」纯展示视图：所有业务状态与动作都由连接层经 props 注入。 */
export function WeKnoraPageView({
	configured,
	baseUrl,
	hasApiKey,
	agents,
	agentsStatus,
	selectedAgentId,
	messages,
	isStreaming,
	currentSessionId,
	sessions,
	sessionsStatus,
	loadingSessionId,
	streamingSessionIds,
	deletingSessionId,
	deleteError,
	saving,
	saveError,
	onSelectAgent,
	onSend,
	onCancel,
	onNewConversation,
	onOpenSession,
	onDeleteSession,
	onReloadSessions,
	onSaveSetup,
	onReloadAgents,
}: WeKnoraPageViewProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const reduceMotion = prefersReducedMotion();
	const [settingsOpen, setSettingsOpen] = useState(false);
	// 侧栏收起是单页面 UI 铬件状态（02-plan §2.5）：本地 state 而非 atom，
	// 惰性初始化只读一次落盘（AC-3 重启保持），切换时写回。
	const [sidebarCollapsed, setSidebarCollapsed] = useState(readPersistedWeKnoraSidebarCollapsed);
	// 侧栏是否留在 DOM（AC-11）：展开时恒为 true；收起时先播退出动画、动画结束再卸载。
	const [sidebarPresent, setSidebarPresent] = useState(!sidebarCollapsed);
	// 仅首次挂载不播入场动画（`initial={false}`），之后每次展开都从 0 宽度滑入。
	const sidebarMountedOnce = useRef(false);
	const agentsReady = agentsStatus === "ready" && agents.length > 0;

	useEffect(() => {
		sidebarMountedOnce.current = true;
	}, []);

	// 收起：reduced-motion 立即卸载；否则等动画播完再卸载（AC-11 终态不渲染、不占宽）。
	useEffect(() => {
		if (!sidebarCollapsed) {
			setSidebarPresent(true);
			return;
		}
		if (reduceMotion) {
			setSidebarPresent(false);
			return;
		}
		const timer = window.setTimeout(() => setSidebarPresent(false), SIDEBAR_ANIMATION_MS);
		return () => window.clearTimeout(timer);
	}, [sidebarCollapsed, reduceMotion]);

	const toggleSidebar = (): void => {
		const next = !sidebarCollapsed;
		setSidebarCollapsed(next);
		persistWeKnoraSidebarCollapsed(next);
	};

	let statusNotice: JSX.Element | null = null;
	if (configured && agentsStatus === "loading") {
		statusNotice = <Notice message={t("page.loadingAgents")} />;
	} else if (configured && agentsStatus === "empty") {
		statusNotice = <Notice message={t("page.agentsEmpty")} onRetry={onReloadAgents} retryLabel={t("page.retry")} />;
	} else if (configured && agentsStatus === "error") {
		statusNotice = <Notice message={t("page.agentsError")} onRetry={onReloadAgents} retryLabel={t("page.retry")} />;
	}

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />

			{/* AC-1/AC-1c：左右内边距 32→12px（px-8→px-3）、页头下边距 16→8px（pb-4→pb-2），
			    收掉顶部那一大块留白；上方 drag-region h-12（48px）是窗口拖拽硬约束，高度不动。 */}
			<header className="shrink-0 px-3 pb-2">
				<div className="flex items-end justify-between gap-4">
					<div className="flex items-center gap-2">
						{/* AC-1/AC-4：侧栏显隐开关只对已配置用户出现；状态由 aria-expanded 暴露，
						    图标指向收拢方向（展开时朝左收、收起后朝右放）。 */}
						{configured ? (
							<Button
								aria-expanded={!sidebarCollapsed}
								aria-label={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
								onClick={toggleSidebar}
								size="icon-xs"
								title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
								type="button"
								variant="ghost"
							>
								<span
									aria-hidden="true"
									className={`h-3.5 w-3.5 ${
										sidebarCollapsed
											? "icon-[solar--alt-arrow-right-linear]"
											: "icon-[solar--alt-arrow-left-linear]"
									}`}
								/>
							</Button>
						) : null}
						<div>
							<h1 className="text-[15px] font-semibold text-foreground">{t("page.title")}</h1>
							<p className="mt-1 text-[12px] text-muted-foreground/60">{t("page.subtitle")}</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{configured && agentsReady ? (
							<AgentSelector
								agents={agents}
								selectedAgentId={selectedAgentId}
								onSelect={onSelectAgent}
							/>
						) : null}
						<Button onClick={() => setSettingsOpen((open) => !open)} size="sm" type="button" variant="outline">
							{settingsOpen ? t("page.closeSettings") : t("page.openSettings")}
						</Button>
					</div>
				</div>
			</header>

			{/* AC-2/AC-1b：内容行左右与页头对齐（px-3），下边距 32→12px（pb-8→pb-3），
			    使历史会话栏（含「新建对话」）整体上移贴近页头。
			    注意：这里刻意不再用 `gap-4`——间隙并入侧栏动画宽度（见 SIDEBAR_SLOT_WIDTH），
			    否则收起终态会残留 16px 空隙。 */}
			<div className="flex flex-1 overflow-hidden px-3 pb-3">
				{/* AC-10/AC-11：收起/展开为宽度滑动 + 内容淡出/淡入（约 200ms）；动画结束后整栏卸载，
				    不占宽（终态与 AC-2 一致）。动画期间 `aria-hidden` 让辅助技术按「已收起」看待它。 */}
				{configured && sidebarPresent ? (
					<motion.div
						animate={{ opacity: sidebarCollapsed ? 0 : 1, width: sidebarCollapsed ? "0rem" : SIDEBAR_SLOT_WIDTH }}
						aria-hidden={sidebarCollapsed || undefined}
						className="shrink-0 overflow-hidden"
						initial={sidebarMountedOnce.current ? { opacity: 0, width: "0rem" } : false}
						transition={reduceMotion ? { duration: 0 } : { duration: SIDEBAR_ANIMATION_MS / 1000, ease: SIDEBAR_EASE }}
					>
						<ConversationList
							agents={agents}
							currentSessionId={currentSessionId}
							deleteError={deleteError}
							deletingSessionId={deletingSessionId}
							loadingSessionId={loadingSessionId}
							onDeleteSession={onDeleteSession}
							onNewConversation={onNewConversation}
							onOpenSession={onOpenSession}
							onReload={onReloadSessions}
							sessions={sessions}
							status={sessionsStatus}
							streamingSessionIds={streamingSessionIds}
						/>
					</motion.div>
				) : null}

				<div className="flex flex-1 flex-col gap-4 overflow-hidden">
					{configured ? null : (
						<Notice detail={t("page.notConfiguredBody")} message={t("page.notConfiguredTitle")} />
					)}

					{configured && !settingsOpen ? null : (
						<SetupPanel
							baseUrl={baseUrl}
							hasApiKey={hasApiKey}
							saveError={saveError}
							saving={saving}
							onSave={onSaveSetup}
						/>
					)}

					{configured ? (
						<>
							{statusNotice}
							<MessageList messages={messages} />
							<WeKnoraComposer
								disabled={!agentsReady}
								isStreaming={isStreaming}
								onCancel={onCancel}
								onSend={onSend}
							/>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}

interface NoticeProps {
	readonly message: string;
	readonly detail?: string;
	readonly onRetry?: () => void;
	readonly retryLabel?: string;
}

function Notice({ message, detail, onRetry, retryLabel }: NoticeProps): JSX.Element {
	return (
		<div className="rounded-xl border border-border/50 bg-card/40 p-4">
			<p className="text-sm text-foreground">{message}</p>
			{detail === undefined ? null : <p className="mt-1 text-[12px] text-muted-foreground/70">{detail}</p>}
			{onRetry && retryLabel ? (
				<Button className="mt-3" onClick={onRetry} size="sm" type="button" variant="outline">
					{retryLabel}
				</Button>
			) : null}
		</div>
	);
}

interface SetupPanelProps {
	readonly baseUrl: string;
	readonly hasApiKey: boolean;
	readonly saving: boolean;
	/** 最近一次保存失败的错误码；非 `null` 时展示失败反馈（④）。 */
	readonly saveError: WeKnoraErrorCode | null;
	readonly onSave: (input: { baseUrl: string; apiKey?: string }) => void;
}

/** 配置面板：`baseUrl` + API Key。Key 只写不读（红线 C2），UI 只显示「已配置 / 未配置」。 */
function SetupPanel({ baseUrl, hasApiKey, saving, saveError, onSave }: SetupPanelProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [url, setUrl] = useState(baseUrl);
	const [apiKey, setApiKey] = useState("");

	useEffect(() => {
		setUrl(baseUrl);
	}, [baseUrl]);

	return (
		<form
			className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSave({ baseUrl: url, ...(apiKey.trim() ? { apiKey } : {}) });
				setApiKey("");
			}}
		>
			<label className="flex flex-col gap-1 text-[12px] text-muted-foreground/70">
				{t("setup.baseUrl")}
				<Input
					onChange={(event) => setUrl(event.target.value)}
					placeholder={t("setup.baseUrlPlaceholder")}
					value={url}
				/>
			</label>
			<label className="flex flex-col gap-1 text-[12px] text-muted-foreground/70">
				<span className="flex items-center gap-2">
					{t("setup.apiKey")}
					<span className="text-[11px] text-muted-foreground/50">
						{hasApiKey ? t("setup.apiKeyConfigured") : t("setup.apiKeyMissing")}
					</span>
				</span>
				<Input
					onChange={(event) => setApiKey(event.target.value)}
					placeholder={t("setup.apiKeyPlaceholder")}
					type="password"
					value={apiKey}
				/>
			</label>
			{saveError === null ? null : (
				<p className="text-[12px] text-destructive" role="alert">
					{t("setup.saveFailed")}
				</p>
			)}
			<div className="flex justify-end">
				<Button disabled={saving} type="submit" variant="primary">
					{saving ? t("setup.saving") : t("setup.save")}
				</Button>
			</div>
		</form>
	);
}
