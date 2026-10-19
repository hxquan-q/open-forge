// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraSession } from "@preload/api";
import { Input } from "@shared/components/ui/input";
import { Button } from "@vetta-org/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WeKnoraAgentsStatus, WeKnoraChatMessage, WeKnoraErrorCode, WeKnoraHistoryStatus } from "../atoms";
import { AgentSelector } from "./AgentSelector";
import { ConversationList } from "./ConversationList";
import { MessageList } from "./MessageList";
import { WeKnoraComposer } from "./WeKnoraComposer";

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
	/** 有活跃流（含后台思考）的会话 id 集合（AC-19 行级指示的状态源）。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	readonly saving: boolean;
	/** 最近一次保存配置失败的归一化错误码；`null` = 无错误（④）。 */
	readonly saveError: WeKnoraErrorCode | null;
	readonly onSelectAgent: (agentId: string) => void;
	readonly onSend: (text: string) => void;
	readonly onCancel: () => void;
	readonly onNewConversation: () => void;
	readonly onOpenSession: (sessionId: string) => void;
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
	saving,
	saveError,
	onSelectAgent,
	onSend,
	onCancel,
	onNewConversation,
	onOpenSession,
	onReloadSessions,
	onSaveSetup,
	onReloadAgents,
}: WeKnoraPageViewProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const agentsReady = agentsStatus === "ready" && agents.length > 0;

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

			<header className="shrink-0 px-8 pb-4">
				<div className="flex items-end justify-between gap-4">
					<div>
						<h1 className="text-[15px] font-semibold text-foreground">{t("page.title")}</h1>
						<p className="mt-1 text-[12px] text-muted-foreground/60">{t("page.subtitle")}</p>
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

			<div className="flex flex-1 gap-4 overflow-hidden px-8 pb-8">
				{configured ? (
					<ConversationList
						agents={agents}
						currentSessionId={currentSessionId}
						loadingSessionId={loadingSessionId}
						onNewConversation={onNewConversation}
						onOpenSession={onOpenSession}
						onReload={onReloadSessions}
						sessions={sessions}
						status={sessionsStatus}
						streamingSessionIds={streamingSessionIds}
					/>
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
