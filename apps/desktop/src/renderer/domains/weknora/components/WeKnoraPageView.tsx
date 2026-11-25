// Copyright The Open Forge contributors.

import { Input } from "@shared/components/ui/input";
import { Button } from "@vetta-org/ui";
import { ResizeHandle } from "@vetta-org/theme-ui/layout";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WeKnoraErrorCode } from "../atoms";
import type { WeKnoraPageActions, WeKnoraPageViewModel } from "../hooks/useWeKnoraViewModel";
import { AgentSelector } from "./AgentSelector";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { WeKnoraComposer } from "./WeKnoraComposer";

/**
 * 侧栏收起/展开过渡（TASK-0506 / PLAN-0032 P4d）。
 *
 * 重写掉原先自写的 motion 宽度动画：占位盒子宽度一步到位切到终值（不参与过渡，
 * 避免逐帧重排主内容区），面板脱离占位用 `transform` 滑进滑出、透明度同步——
 * 与 theme-ui `SidebarDock` 同一抽屉模式，纯 CSS 过渡，reduced-motion 经
 * `motion-reduce:transition-none` 瞬时切换。终态占位宽度为 0，不留空隙。
 */
const SIDEBAR_TRANSITION_MS = 240;

/** 窄屏断点：容器宽度低于此值时详情独占整页（与 SplitDetailLayout 一致）。 */
const NARROW_BREAKPOINT = "@[780px]";

export interface WeKnoraPageViewProps {
	readonly viewModel: WeKnoraPageViewModel;
	readonly actions: WeKnoraPageActions;
}

/**
 * 「智能客服」纯展示视图：平铺 props 收拢为 `viewModel` + `actions` 两个对象
 * （对照 memory 三层样板）。会话栏进列表列、可拖宽可折叠；会话主区进右侧详情列，
 * 窄屏（<780px 容器宽）下详情独占整页。
 */
export function WeKnoraPageView({ viewModel, actions }: WeKnoraPageViewProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const agentsReady = viewModel.agentsStatus === "ready" && viewModel.agents.length > 0;

	let statusNotice: JSX.Element | null = null;
	if (viewModel.configured && viewModel.agentsStatus === "loading") {
		statusNotice = <Notice message={t("page.loadingAgents")} />;
	} else if (viewModel.configured && viewModel.agentsStatus === "empty") {
		statusNotice = (
			<Notice message={t("page.agentsEmpty")} onRetry={actions.reloadAgents} retryLabel={t("page.retry")} />
		);
	} else if (viewModel.configured && viewModel.agentsStatus === "error") {
		statusNotice = (
			<Notice message={t("page.agentsError")} onRetry={actions.reloadAgents} retryLabel={t("page.retry")} />
		);
	}

	const sidebarVisible = viewModel.configured && !viewModel.sidebarCollapsed;

	return (
		<div className="@container relative flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* AC-2/AC-1b：内容行左右与页头对齐（px-3），下边距 32→12px（pb-8→pb-3），
			    使历史会话栏（含「新建对话」）整体上移贴近页头（DESIGN.md:283 登记特例保留）。
			    列表列与详情列同处一行：≥780px 并排分屏；窄屏下列表隐藏，详情独占整页。 */}
			<div className="flex flex-1 overflow-hidden px-3 pb-3">
				{viewModel.configured ? (
					// 侧栏占位盒子：宽度一步到位（收起终值 0），不参与过渡；把手贴在右缘。
					<div
						data-testid="weknora-sidebar-slot"
						className="relative z-10 shrink-0 overflow-visible"
						style={{ width: viewModel.sidebarCollapsed ? 0 : viewModel.sidebarWidth }}
						{...(viewModel.sidebarCollapsed ? { inert: true, "aria-hidden": true } : {})}
					>
						<div
							className={`absolute inset-y-0 left-0 h-full transition-[transform,opacity] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none ${
								sidebarVisible ? "opacity-100" : "pointer-events-none opacity-0"
							}`}
							style={{
								width: viewModel.sidebarWidth,
								transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)",
								transitionDuration: `${SIDEBAR_TRANSITION_MS}ms`,
							}}
						>
							<ConversationList
								agents={viewModel.agents}
								batchDeleting={viewModel.batchDeleting}
								currentSessionId={viewModel.currentSessionId}
								deleteError={viewModel.deleteError}
								deletingSessionId={viewModel.deletingSessionId}
								exporting={viewModel.exporting}
								loadingSessionId={viewModel.loadingSessionId}
								onDeleteSession={actions.deleteSession}
								onDeleteSessions={actions.deleteSessions}
								onExportSession={actions.exportSession}
								onExportSessions={actions.exportSessions}
								onNewConversation={actions.newConversation}
								onOpenSession={actions.openSession}
								onReload={actions.reloadSessions}
								sessions={viewModel.sessions}
								status={viewModel.sessionsStatus}
								streamingSessionIds={viewModel.streamingSessionIds}
							/>
						</div>
						{/* 拖宽把手（ResizeHandle，side="right"：向右拖变大）：只在 ≥780px 且展开时可拖；
						    窄屏详情独占整页、列表隐藏，拖拽无意义。 */}
						{sidebarVisible ? (
							<span className={`hidden ${NARROW_BREAKPOINT}:block`}>
								<ResizeHandle side="right" onResize={actions.resizeSidebar} />
							</span>
						) : null}
					</div>
				) : null}

				{/* 详情列（会话主区）：窄屏独占整页（容器断点隐藏列表后 flex-1 吃满）。 */}
				<div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden pl-4">
					{/* AC-1/AC-1c：页头贴边（下边距 8px）；窗口拖拽由外壳页头承担，本页不再自带拖拽带。 */}
					<header className="shrink-0 pb-2">
						<div className="flex items-end justify-between gap-4">
							<div className="flex items-center gap-2">
								{/* AC-1/AC-4：侧栏显隐开关只对已配置用户出现；状态由 aria-expanded 暴露，
								    图标指向收拢方向（展开时朝左收、收起后朝右放）。 */}
								{viewModel.configured ? (
									<Button
										aria-expanded={!viewModel.sidebarCollapsed}
										aria-label={viewModel.sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
										onClick={actions.toggleSidebar}
										size="icon-xs"
										title={viewModel.sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
										type="button"
										variant="ghost"
									>
										<span
											aria-hidden="true"
											className={`h-3.5 w-3.5 ${
												viewModel.sidebarCollapsed
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
								{viewModel.configured && agentsReady ? (
									<AgentSelector
										agents={viewModel.agents}
										selectedAgentId={viewModel.selectedAgentId}
										onSelect={actions.selectAgent}
									/>
								) : null}
								<Button onClick={actions.toggleSettings} size="sm" type="button" variant="outline">
									{viewModel.settingsOpen ? t("page.closeSettings") : t("page.openSettings")}
								</Button>
							</div>
						</div>
					</header>

					{viewModel.configured ? null : (
						<Notice detail={t("page.notConfiguredBody")} message={t("page.notConfiguredTitle")} />
					)}

					{viewModel.configured && !viewModel.settingsOpen ? null : (
						<SetupPanel
							baseUrl={viewModel.baseUrl}
							hasApiKey={viewModel.hasApiKey}
							saveError={viewModel.saveError}
							saving={viewModel.saving}
							onSave={actions.saveSetup}
						/>
					)}

					{viewModel.configured ? (
						<>
							{statusNotice}
							<MessageList messages={viewModel.messages} />
							<WeKnoraComposer
								disabled={!agentsReady}
								isStreaming={viewModel.isStreaming}
								onCancel={actions.cancel}
								onSend={actions.send}
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
