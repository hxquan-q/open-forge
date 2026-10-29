// Modified by The Open Forge contributors.
import { createConversationUserMessage, resolveConversationAgentText } from "@shared/conversation";
import { i18n } from "@shared/i18n";
import {
	activeSessionStreamingAtom,
	activeToolNamesAtom,
	activityPanelTabByProjectAtom,
	aiEditTargetAtom,
	aiEditTargetFromToolCall,
	aiTerminalCommandFromToolCall,
	aiTerminalOutputFromResult,
	type BackgroundTask,
	backgroundTasksBySessionAtom,
	type ChatTimelineItem,
	canvasArtifactRevisionAtom,
	canvasUnreadCountAtom,
	chatMessagesAtom,
	contextCompactionEligibilityAtom,
	contextUsageAtom,
	EMPTY_TASK_STATE,
	goalStateBySessionAtom,
	isCanvasTabVisible,
	isCompactingAtom,
	isReloadingMcpAtom,
	lastTurnUsageAtom,
	markAiTerminalEntryDone,
	mountedActivityWorkspacesAtom,
	pendingCanvasArtifactIdAtom,
	planModeStateBySessionAtom,
	projectsAtom,
	promptPredictingAtom,
	promptSuggestionsAtom,
	pushAiTerminalEntry,
	rememberSubagentsForSession,
	resolveActivityWorkspaceKey,
	retryProgressAtom,
	subagentsBySessionAtom,
	taskStateBySessionAtom,
	todoItemsBySessionAtom,
} from "@shared/store/atoms";
import {
	getQueuedDispatchSeq,
	getQueueForSession,
	messageQueueBySessionAtom,
	type QueuedMessage,
	setQueueForSessionAtom,
	setQueuePausedAtom,
} from "@shared/store/message-queue-atoms";
import { showToast } from "@shared/store/toast-atoms";
import { applyTaskFactEvent } from "@shared/task/task-projection.js";
import {
	isCodingAgentMcpReloadStarted,
	readCodingAgentBackgroundTasksObservation,
	readCodingAgentGoalObservation,
	readCodingAgentMcpReloadFinished,
	readCodingAgentPlanModeObservation,
	readCodingAgentSubagentsObservation,
	readCodingAgentTodoObservation,
} from "@vetta/coding-agent/session-extensions";
import type { SessionEvent } from "@vetta/runtime-core";
import { getDefaultStore, useSetAtom } from "jotai";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import {
	appendError,
	appendTextDelta,
	appendThinkingDelta,
	finishAssistantTurn,
	getActiveAssistantTurnStartedAt,
	getChatStreamOwner,
	handleToolEnd,
	handleToolPhase,
	handleToolStart,
	nextId,
	rememberTurnStats,
	startAssistantTurn,
	toChatErrorDetails,
} from "../services/chat-service";
import { clearCachedContextComposition, writeCachedContextComposition } from "../services/context-composition-cache";
import { ConversationProjection } from "../services/conversation-projection";
import { applyAgentEndHistoryRefresh } from "../services/live-history-patch";
import {
	reconcileOptimisticUserMessages,
	rememberOptimisticUserMessage,
} from "../services/optimistic-user-message-cache";
import { diffConsumedQueueEntries } from "../services/queue-mirror";
import {
	refreshTranscriptTail,
	registerActiveTranscriptBacklog,
	resetTranscriptWindowToTail,
} from "../services/transcript-window-controller";
import type { ActiveSessionHandle } from "./session-manager-types";

const DELTA_FLUSH_INTERVAL_MS = 100;
// Keep a 100ms ceiling rather than rAF: markdown re-parse of the live tail is the
// expensive work, and a 120Hz display would otherwise commit ~2× more parses.

export interface SessionEventController {
	bumpSuggestionToken: (runtimeId: string) => void;
	createSessionEventHandler: (runtimeId: string) => (event: SessionEvent) => void;
	resetEventBuffers: () => void;
	/** 历史回填折叠运行回合草稿时迁移流式目标（TASK-0152）。 */
	retargetProjectionMessage: (from: string, to: string) => void;
}

interface SessionEventControllerOptions {
	activeSessionRef: MutableRefObject<ActiveSessionHandle | null>;
}

function getProjects() {
	return getDefaultStore().get(projectsAtom);
}

export function useSessionEventController({ activeSessionRef }: SessionEventControllerOptions): SessionEventController {
	const setChatMessages = useSetAtom(chatMessagesAtom);
	const setActiveSessionStreaming = useSetAtom(activeSessionStreamingAtom);
	const setRetryProgress = useSetAtom(retryProgressAtom);
	const setLastTurnUsage = useSetAtom(lastTurnUsageAtom);
	const setContextUsage = useSetAtom(contextUsageAtom);
	const setCompactionEligibility = useSetAtom(contextCompactionEligibilityAtom);
	const setIsCompacting = useSetAtom(isCompactingAtom);
	const setIsReloadingMcp = useSetAtom(isReloadingMcpAtom);
	const setBackgroundTasks = useSetAtom(backgroundTasksBySessionAtom);
	const setSubagents = useSetAtom(subagentsBySessionAtom);
	const setActiveToolNames = useSetAtom(activeToolNamesAtom);
	const setTodoItems = useSetAtom(todoItemsBySessionAtom);
	const setTaskState = useSetAtom(taskStateBySessionAtom);
	const setPlanModeStates = useSetAtom(planModeStateBySessionAtom);
	const setGoalStates = useSetAtom(goalStateBySessionAtom);
	const setPromptSuggestions = useSetAtom(promptSuggestionsAtom);
	const setPromptPredicting = useSetAtom(promptPredictingAtom);
	const suggestionTokenRef = useRef<Map<string, number>>(new Map());
	const turnStartDispatchSeqRef = useRef<Map<string, number>>(new Map());
	const pendingTextDeltaRef = useRef("");
	const pendingThinkingDeltaRef = useRef("");
	const deltaTimerRef = useRef<number | null>(null);
	const pendingDeltaSessionRef = useRef<string | null>(null);
	const conversationProjectionRef = useRef(new ConversationProjection());

	const markPredicting = useCallback(
		(runtimeId: string, predicting: boolean) => {
			setPromptPredicting((previous) => {
				if (predicting) return { ...previous, [runtimeId]: true };
				if (!(runtimeId in previous)) return previous;
				const next = { ...previous };
				delete next[runtimeId];
				return next;
			});
		},
		[setPromptPredicting],
	);

	const bumpSuggestionToken = useCallback((runtimeId: string) => {
		const tokens = suggestionTokenRef.current;
		tokens.set(runtimeId, (tokens.get(runtimeId) ?? 0) + 1);
	}, []);

	const resetEventBuffers = useCallback(() => {
		if (deltaTimerRef.current !== null) {
			window.clearTimeout(deltaTimerRef.current);
			deltaTimerRef.current = null;
		}
		pendingTextDeltaRef.current = "";
		pendingThinkingDeltaRef.current = "";
		pendingDeltaSessionRef.current = null;
		conversationProjectionRef.current.reset();
	}, []);

	const flushDeltas = useCallback(() => {
		if (deltaTimerRef.current !== null) {
			window.clearTimeout(deltaTimerRef.current);
			deltaTimerRef.current = null;
		}
		const textDelta = pendingTextDeltaRef.current;
		const thinkingDelta = pendingThinkingDeltaRef.current;
		const owningSession = pendingDeltaSessionRef.current;
		const hasAssistantEvents = conversationProjectionRef.current.hasPendingEvents();
		pendingTextDeltaRef.current = "";
		pendingThinkingDeltaRef.current = "";
		pendingDeltaSessionRef.current = null;

		if (
			owningSession &&
			(getChatStreamOwner() !== owningSession || activeSessionRef.current?.runtimeId !== owningSession)
		)
			return;
		if (hasAssistantEvents || textDelta || thinkingDelta) {
			setChatMessages((previous) => {
				if (hasAssistantEvents) return conversationProjectionRef.current.flush(previous);
				let next = previous;
				if (thinkingDelta) next = appendThinkingDelta(next, thinkingDelta);
				if (textDelta) next = appendTextDelta(next, textDelta);
				return next;
			});
		}
	}, [activeSessionRef, setChatMessages]);

	const scheduleDeltaFlush = useCallback(() => {
		if (deltaTimerRef.current === null) {
			deltaTimerRef.current = window.setTimeout(flushDeltas, DELTA_FLUSH_INTERVAL_MS);
		}
	}, [flushDeltas]);

	useEffect(() => resetEventBuffers, [resetEventBuffers]);

	const createSessionEventHandler = useCallback(
		(sessionId: string) => (event: SessionEvent) => {
			// Defensive guard: if user has already switched away to another
			// session, drop this event so its delta/state can't bleed into
			// the new session's atom. activeSessionRef is updated synchronously
			// above and reflects the latest user-facing session.
			if (activeSessionRef.current?.runtimeId !== sessionId) return;
			// 归属闸门：activeSessionRef 是实例级的，只能证明「本实例最后打开的是它」。
			// 真正代表用户当前会话的是模块级 owner，它在 openSession 一进入就被置空——
			// 切走后旧会话的事件到此为止。
			if (getChatStreamOwner() !== sessionId) return;
			if (event.type === "session.context.state") {
				setContextUsage({
					percent: event.state.usage.percent,
					contextTokens: event.state.usage.tokens,
					contextWindow: event.state.usage.contextWindow,
					...(event.state.usage.composition ? { composition: event.state.usage.composition } : {}),
				});
				setIsCompacting(event.state.compaction.status === "running");
				setCompactionEligibility(event.state.compaction.eligibility);
				return;
			}
			// ── kernel 队列镜像（ADR-0060）──
			// 条目「消失且非本端主动移除」= 已被 turn 消费：此刻补用户气泡，
			// 时序与模型可见顺序严格一致；agent_end 重拉由乐观对账按文本吸收。
			if (event.type === "queue.changed") {
				const queueStore = getDefaultStore();
				const prevQueue = getQueueForSession(queueStore.get(messageQueueBySessionAtom), sessionId);
				const nextQueue: QueuedMessage[] = event.entries.map((entry) => ({
					id: entry.id,
					displayText: entry.displayText,
					behavior: entry.behavior,
					kind: entry.kind ?? "message",
				}));
				queueStore.set(setQueueForSessionAtom, { runtimeId: sessionId, items: nextQueue });
				queueStore.set(setQueuePausedAtom, { runtimeId: sessionId, paused: event.paused });
				const consumedEntries = diffConsumedQueueEntries(prevQueue, nextQueue);
				if (consumedEntries.length > 0) {
					// 同一 turn 内接力消费：把上一段流先落定、并切断 assistant 草稿——
					// 否则后续 delta 仍按 draftId 续写进用户气泡**之前**的旧回复气泡里，
					// 第二条回复会显示在它自己的用户消息上方（ADR-0060）。
					flushDeltas();
					conversationProjectionRef.current.reset();
				}
				for (const consumed of consumedEntries) {
					if (consumed.kind !== "message") continue;
					const consumedMsg = createConversationUserMessage({
						id: nextId("user"),
						deliveryPhase: "pending",
						text: consumed.displayText,
						timestamp: Date.now(),
					});
					// 镜像条目只有 displayText（无 attachments/promptRef 元数据），
					// 规范消息回流后按文本吸收即可，避免元数据不等造成气泡残留。
					rememberOptimisticUserMessage(sessionId, consumedMsg, queueStore.get(chatMessagesAtom), {
						matchTextOnly: true,
					});
					setChatMessages((prev) => [...prev, consumedMsg]);
				}
				return;
			}
			// ── Lifecycle ──
			if (event.type === "session.lifecycle") {
				if (event.phase === "agent_start") {
					// 新一轮开始：让上一轮的输入预测生成（若仍在飞）回填时作废。
					bumpSuggestionToken(sessionId);
					// 快照本轮起始时的队列派发序号，供本轮 agent_end 判定重拉是否已过期。
					turnStartDispatchSeqRef.current.set(sessionId, getQueuedDispatchSeq(sessionId));
					conversationProjectionRef.current.reset();
					// agent_start 就建立真实 assistant 草稿：慢模型首包到达前也有稳定消息身份与
					// 绝对 startedAt。无用户消息介入的唤醒仍复用末尾 assistant 气泡。
					setChatMessages((prev) => startAssistantTurn(prev, event.timestamp));
					setActiveSessionStreaming(true);
				}
				if (event.phase === "agent_end" || event.phase === "aborted") {
					// Flush any pending deltas before finalizing
					flushDeltas();
					// Always reset streaming state first to unblock the UI
					const endedAt = event.timestamp;
					const startedAt = getActiveAssistantTurnStartedAt(getDefaultStore().get(chatMessagesAtom));
					const elapsed = startedAt ? (endedAt - startedAt) / 1000 : 0;
					conversationProjectionRef.current.reset();
					setActiveSessionStreaming(false);
					// 重试期也会走到这里（agent_end 先于 retry.start），随后的
					// retry.start 会把进度重新点亮；真正结束时则不会，避免残留。
					setRetryProgress(null);
					// Write total duration onto the last assistant message
					setChatMessages((prev) => finishAssistantTurn(prev, endedAt));

					// Reload history identities so user bubbles get session entryId / branch siblings
					// (optimistic messages use synthetic ids and cannot be edited until this).
					// Matching timelines keep live assistant blocks; mismatched shapes still replace.
					void (async () => {
						// TASK-0050：窗口化会话只取最新 head 页推进窗口末端；跨轮对账/计时
						// 补丁经 shouldCommit/patchCanonical 注入同一提交闸。
						const windowedSessionPath = activeSessionRef.current?.sessionPath;
						if (
							windowedSessionPath &&
							(await refreshTranscriptTail({
								sessionPath: windowedSessionPath,
								shouldCommit: () =>
									activeSessionRef.current?.runtimeId === sessionId &&
									// 判活只认净增长：失败派发的 unbump 落在本轮快照之后时序号
									// 会回落，此时并未「跨到下一轮」，重拉必须照常落地——
									// 旧的「不等」判活会把最新轮误判过期（BUG-0073）。
									getQueuedDispatchSeq(sessionId) > (turnStartDispatchSeqRef.current.get(sessionId) ?? 0),
								patchCanonical: (items) => {
									if (elapsed <= 0) return items;
									const mapped = items.slice();
									for (let i = mapped.length - 1; i >= 0; i--) {
										const message = mapped[i];
										if (message?.kind === "agent") {
											mapped[i] = {
												...message,
												startedAt: message.startedAt ?? startedAt,
												endedAt: message.endedAt ?? endedAt,
												durationSeconds: message.durationSeconds ?? elapsed,
											};
											break;
										}
									}
									return mapped;
								},
							}))
						) {
							return;
						}
						await window.vetta.session.getFullHistory(sessionId).then((history) => {
							if (activeSessionRef.current?.runtimeId !== sessionId) return;
							// 判活：本轮结束时/后若发生过队列派发（立即发送 / 自然出队），这次历史
							// 回流已「跨到下一轮」——会冲掉下一轮的乐观用户气泡、令 draft 串台，或与
							// 已抢先落盘的 mapped 重复。跳过，交由下一轮自己的 agent_end 安全重拉。
							// 只认净增长（>）：失败派发的 unbump 使序号回落到快照值时并未跨轮，
							// 重拉照常落地——「不等」判活会把膨胀窗口内开启的最新轮误杀（BUG-0073）。
							if (getQueuedDispatchSeq(sessionId) > (turnStartDispatchSeqRef.current.get(sessionId) ?? 0)) {
								return;
							}
							const projected = conversationProjectionRef.current.projectHistoryWithSpans(history, sessionId);
							const activeSessionPath = activeSessionRef.current?.sessionPath;
							if (activeSessionPath) {
								// 全量回落登记的是完整 transcript——标 unbounded，否则下一轮
								// refreshTranscriptTail 会把它误当窗口化会话收窄成尾页。
								registerActiveTranscriptBacklog(activeSessionPath, {
									entries: history,
									spans: projected.spans,
									mediaSessionId: sessionId,
									unbounded: true,
								});
							}
							const mapped = reconcileOptimisticUserMessages(sessionId, projected.messages);
							if (elapsed > 0) {
								for (let i = mapped.length - 1; i >= 0; i--) {
									const message = mapped[i];
									if (message.kind === "agent") {
										mapped[i] = {
											...message,
											startedAt: message.startedAt ?? startedAt,
											endedAt: message.endedAt ?? endedAt,
											durationSeconds: message.durationSeconds ?? elapsed,
										};
										break;
									}
								}
							}
							setChatMessages((liveMessages) => applyAgentEndHistoryRefresh(liveMessages, mapped));
						});
					})().catch((err) => {
						console.warn("[useSessionManager] history refresh after agent_end failed", err);
					});

					if (event.phase === "agent_end") {
						const active = activeSessionRef.current;
						const cwd = active?.cwd;
						const rid = active?.runtimeId;
						const projectType = cwd ? getProjects().find((p) => p.cwd === cwd)?.type : undefined;

						// 输入预测：仅交互式会话（排除批量 / 流转），且开关开启时。每轮
						// 正常完成后基于最近几轮对话异步生成 0-3 条建议，回填时校验过期。
						if (rid && projectType !== "batch") {
							let predictSnapshot: ChatTimelineItem[] = [];
							setChatMessages((prev) => {
								predictSnapshot = prev;
								return prev;
							});
							const token = suggestionTokenRef.current.get(rid) ?? 0;
							void (async () => {
								try {
									const cfg = await window.vetta.config.get();
									if (cfg.experimental?.promptPrediction !== true) return;
									const conversation = buildRecentConversation(predictSnapshot);
									if (!conversation) return;
									// 进入「生成中」：末条 assistant 操作栏显示闪光提示。
									markPredicting(rid, true);
									const suggestions = await window.vetta.session.nextPromptSuggestions(rid, conversation);
									// 过期判定：该会话期间已开新轮 / 发新 prompt 则丢弃。
									if ((suggestionTokenRef.current.get(rid) ?? 0) !== token) return;
									setPromptSuggestions((prev) => {
										if (suggestions.length === 0) {
											if (!(rid in prev)) return prev;
											const next = { ...prev };
											delete next[rid];
											return next;
										}
										return { ...prev, [rid]: suggestions };
									});
								} catch (err) {
									console.warn("[useSessionManager] prompt prediction failed", err);
								} finally {
									// 退出「生成中」（成功 / 过期 / 失败均收尾）。
									markPredicting(rid, false);
								}
							})();
						}
					}
				}
				return;
			}

			// ── Raw assistant protocol stream ──
			// AssistantMessageEvent stays intact across Runtime/IPC. The projection
			// batches an ordered event array instead of merging by content type.
			if (event.channel === "assistant") {
				conversationProjectionRef.current.enqueue(event);
				pendingDeltaSessionRef.current = sessionId;
				if (event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta") {
					scheduleDeltaFlush();
				} else {
					flushDeltas();
				}
				return;
			}

			// ── Thinking delta (streaming thinking text) ──
			if (event.type === "thinking.delta") {
				if (conversationProjectionRef.current.hasRawAssistantStream()) return;
				pendingThinkingDeltaRef.current += event.delta;
				pendingDeltaSessionRef.current = sessionId;
				scheduleDeltaFlush();
				return;
			}

			// ── Text delta (streaming assistant text) ──
			if (event.type === "message.delta") {
				if (conversationProjectionRef.current.hasRawAssistantStream()) return;
				pendingTextDeltaRef.current += event.delta;
				pendingDeltaSessionRef.current = sessionId;
				scheduleDeltaFlush();
				return;
			}

			// ── Tool call generating (model started generating a tool call) ──
			if (event.type === "toolcall.start") {
				if (conversationProjectionRef.current.hasRawAssistantStream()) return;
				// Flush pending text/thinking deltas FIRST so the tool block lands
				// after any text that streamed before it (otherwise batched deltas
				// get appended on the wrong side of the tool block).
				flushDeltas();
				setChatMessages((prev) => handleToolStart(prev, event.toolCallId, event.toolName, {}));
				return;
			}

			// ── Tool start ──
			if (event.type === "tool.start") {
				flushDeltas();
				// 演示定稿：写类工具一发起就更新全局「AI 正在编辑的文件」，文件页签热跟随。
				const editTarget = aiEditTargetFromToolCall(
					event.toolName,
					event.args,
					activeSessionRef.current?.cwd ?? null,
					Date.now(),
				);
				if (editTarget) getDefaultStore().set(aiEditTargetAtom, editTarget);
				// 演示定稿：shell 命令投屏——start 入队 running 条目，终端页签只读回放。
				const terminalCommand = aiTerminalCommandFromToolCall(event.toolName, event.args);
				if (terminalCommand) {
					pushAiTerminalEntry(getDefaultStore(), {
						command: terminalCommand,
						key: event.toolCallId,
						running: true,
						at: Date.now(),
						cwd: activeSessionRef.current?.cwd ?? null,
					});
				}
				setChatMessages((prev) =>
					handleToolStart(
						prev,
						event.toolCallId,
						event.toolName,
						(event.args as Record<string, unknown>) ?? {},
						event.startedAt,
					),
				);
				return;
			}

			// ── Tool phase (live, never persisted into LLM context) ──
			if (event.type === "tool.phase") {
				setChatMessages((prev) => handleToolPhase(prev, event.toolCallId, event.label, event.atMs));
				return;
			}

			// ── Tool end ──
			if (event.type === "tool.end") {
				flushDeltas();
				// 演示定稿：shell 命令投屏——end 配对补输出；非 shell 工具的 key 不在 feed 里，no-op。
				markAiTerminalEntryDone(getDefaultStore(), event.toolCallId, aiTerminalOutputFromResult(event.result));
				setChatMessages((prev) =>
					handleToolEnd(
						prev,
						event.toolCallId,
						event.result,
						event.isError,
						{
							startedAt: event.startedAt,
							durationMs: event.durationMs,
							phases: event.phases,
						},
						event.sessionId,
					),
				);
				return;
			}

			// ── Auto-retry（退避等待中；错误本身要等重试彻底失败才会来）──
			if (event.type === "retry.start") {
				setRetryProgress({
					attempt: event.attempt,
					maxAttempts: event.maxAttempts,
					errorMessage: event.errorMessage,
					...(event.failure ? { details: toChatErrorDetails(event.failure) } : {}),
				});
				return;
			}
			if (event.type === "retry.end") {
				setRetryProgress(null);
				return;
			}

			// ── Error (provider / runtime error) ──
			if (event.type === "error") {
				flushDeltas();
				setRetryProgress(null);
				setChatMessages((prev) =>
					appendError(
						prev,
						event.error.message,
						event.retryAttempts,
						event.turnId,
						toChatErrorDetails(event.error),
					),
				);
				return;
			}

			// ── Usage update (emitted per assistant message) ──
			if (event.type === "usage.update") {
				const startedAt = getActiveAssistantTurnStartedAt(getDefaultStore().get(chatMessagesAtom));
				const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
				const outputSpeed = elapsed > 0 ? event.output / elapsed : 0;
				const turnStats = { outputSpeed, durationSeconds: elapsed };
				setLastTurnUsage(turnStats);
				// Cache turn stats for session restore
				const sp = activeSessionRef.current?.sessionPath;
				if (sp != null) rememberTurnStats(sp, turnStats);
				if (sp && event.contextComposition) {
					writeCachedContextComposition(sp, event.contextComposition);
				}
				setContextUsage({
					percent: event.contextPercent ?? null,
					contextTokens: event.contextTokens ?? null,
					contextWindow: event.contextWindow ?? 0,
					...(event.contextComposition ? { composition: event.contextComposition } : {}),
				});
				return;
			}

			// ── Compaction start ──
			if (event.type === "compaction.start") {
				setIsCompacting(true);
				return;
			}

			// ── Compaction end ──
			if (event.type === "compaction.end") {
				setIsCompacting(false);
				if (event.success) {
					const sessionPath = activeSessionRef.current?.sessionPath;
					if (sessionPath) clearCachedContextComposition(sessionPath);
					if (event.contextWindow !== undefined) {
						setContextUsage({
							percent: event.contextPercent ?? null,
							contextTokens: event.contextTokens ?? null,
							contextWindow: event.contextWindow,
						});
					}
					if (getQueueForSession(getDefaultStore().get(messageQueueBySessionAtom), sessionId).length === 0) {
						// TASK-0051：手动与自动压缩成功后都重建投影。压缩对 JSONL 是追加
						// （firstKeptEntryId，entry id 不变），优先 head 合并刷新——已加载旧页
						// 与阅读锚点原样保留，compaction 边界作为轻量条目落入尾部；合并签名
						// 不匹配时由 merge 自行降级为整窗替换（等价旧行为）。非窗口化会话
						// 维持全量回载。
						void (async () => {
							const windowedPath = activeSessionRef.current?.sessionPath;
							if (windowedPath && (await refreshTranscriptTail({ sessionPath: windowedPath }))) return;
							if (windowedPath && (await resetTranscriptWindowToTail(windowedPath))) return;
							await window.vetta.session.getFullHistory(sessionId).then((history) => {
								if (activeSessionRef.current?.runtimeId !== sessionId) return;
								const projected = conversationProjectionRef.current.projectHistoryWithSpans(history, sessionId);
								const activeSessionPath = activeSessionRef.current?.sessionPath;
								if (activeSessionPath) {
									registerActiveTranscriptBacklog(activeSessionPath, {
										entries: history,
										spans: projected.spans,
										mediaSessionId: sessionId,
										unbounded: true,
									});
								}
								setChatMessages(reconcileOptimisticUserMessages(sessionId, projected.messages));
							});
						})().catch((error) =>
							console.warn("[useSessionManager] history refresh after compaction failed", error),
						);
					}
				} else if (event.reason === "manual") {
					showToast({
						variant: "error",
						title: i18n.t("chat:slashPanel.compaction.errorTitle"),
						message: event.errorMessage ?? i18n.t("chat:slashPanel.compaction.errorMessage"),
					});
				}
				return;
			}

			// ── 激活工具集变化（插件在会话创建之后才注册工具）──
			// openSession 时拿到的 getState 快照可能早于插件 activate，不刷新的话
			// 输入栏 badge 的 requiresActiveTool 闸门会一直按旧集合隐藏。
			if (event.type === "active_tools_update") {
				if (event.sessionId === activeSessionRef.current?.runtimeId) {
					setActiveToolNames(new Set(event.activeToolNames));
				}
				return;
			}

			// ── Task/Artifact 事实投影（真相源在 Runtime 事件日志，这里只折叠） ──
			if (event.type === "task.lifecycle" || event.type === "artifact.descriptor") {
				const sid = activeSessionRef.current?.runtimeId;
				if (sid) {
					setTaskState((prev) => {
						const current = prev.get(sid) ?? EMPTY_TASK_STATE;
						const next = applyTaskFactEvent(current, event);
						return next === current ? prev : new Map(prev).set(sid, next);
					});
				}
				if (event.type === "artifact.descriptor") {
					const store = getDefaultStore();
					store.set(canvasArtifactRevisionAtom, (count) => count + 1);
					const artifactId = event.artifact?.artifactId;
					// 未读抑制与 pending 归属都以「当前挂载的活动工作空间」为键（TASK-0079）：
					// 面板页签挂在 workspace.id 上——普通对话是 cwd，Team 是 agent-team:<…>，
					// 按 cwd 直查在 Team 视图永远落空，页签开着也照样累加幻影未读。
					const mountedWorkspaces = store.get(mountedActivityWorkspacesAtom);
					const mountedKeys = mountedWorkspaces.flatMap((workspace) => [workspace.id, workspace.cwd]);
					const canvasVisible = isCanvasTabVisible(store.get(activityPanelTabByProjectAtom), mountedKeys);
					const cwd = activeSessionRef.current?.cwd;
					if (!canvasVisible) {
						if (typeof artifactId === "string" && artifactId && cwd) {
							// 画布不可见才排队（可见时用户可能正在阅读，交给 revision 刷新列表）；
							// workspaceId 用挂载表把 cwd 反查成真正的工作空间键，查不到时退回 cwd，
							// 保证只有归属面板会消费这条 pending。
							store.set(pendingCanvasArtifactIdAtom, {
								workspaceId: resolveActivityWorkspaceKey(mountedWorkspaces, cwd),
								artifactId,
							});
						}
						store.set(canvasUnreadCountAtom, (count) => count + 1);
					}
				}
				return;
			}

			// ── Coding Agent product extension updates ──
			if (event.type === "session.extension") {
				if (isCodingAgentMcpReloadStarted(event)) {
					setIsReloadingMcp(true);
					return;
				}
				if (readCodingAgentMcpReloadFinished(event)) {
					setIsReloadingMcp(false);
					return;
				}
				const backgroundTasks = readCodingAgentBackgroundTasksObservation(event);
				if (backgroundTasks) {
					const sid = activeSessionRef.current?.runtimeId;
					if (sid) {
						setBackgroundTasks((prev) => {
							const next = new Map(prev);
							if (backgroundTasks.length > 0) next.set(sid, [...backgroundTasks] as BackgroundTask[]);
							else next.delete(sid);
							return next;
						});
					}
					return;
				}
				const subagents = readCodingAgentSubagentsObservation(event);
				if (subagents) {
					const sid = activeSessionRef.current?.runtimeId;
					if (sid) {
						setSubagents((prev) => rememberSubagentsForSession(prev, sid, subagents));
					}
					return;
				}
				const planModeState = readCodingAgentPlanModeObservation(event);
				if (planModeState) {
					const sid = activeSessionRef.current?.runtimeId;
					if (sid) {
						setPlanModeStates((prev) => {
							// 真相源在会话 Runtime；这里只是投影，「没有记录即视为未开启」。
							// 回落到 default 且无已提交计划时删键，投影不随打开过的会话数累积。
							if (planModeState.permissionMode === "default" && planModeState.plan === undefined) {
								if (!(sid in prev)) return prev;
								const next = { ...prev };
								delete next[sid];
								return next;
							}
							return { ...prev, [sid]: planModeState };
						});
					}
					return;
				}
				const goalState = readCodingAgentGoalObservation(event);
				if (goalState !== undefined) {
					const sid = activeSessionRef.current?.runtimeId;
					if (sid) {
						setGoalStates((previous) => {
							const next = { ...previous };
							if (goalState) next[sid] = goalState;
							else delete next[sid];
							return next;
						});
					}
					return;
				}
				const items = readCodingAgentTodoObservation(event);
				if (!items) return;
				const sid = activeSessionRef.current?.runtimeId;
				if (sid) {
					setTodoItems((prev) => {
						const next = new Map(prev);
						if (items.length > 0) {
							next.set(sid, [...items]);
						} else {
							next.delete(sid);
						}
						return next;
					});
				}
				return;
			}
		},
		[
			activeSessionRef,
			bumpSuggestionToken,
			flushDeltas,
			markPredicting,
			scheduleDeltaFlush,
			setActiveSessionStreaming,
			setActiveToolNames,
			setBackgroundTasks,
			setChatMessages,
			setContextUsage,
			setIsCompacting,
			setIsReloadingMcp,
			setLastTurnUsage,
			setPlanModeStates,
			setGoalStates,
			setPromptSuggestions,
			setRetryProgress,
			setSubagents,
			setTaskState,
			setTodoItems,
			setCompactionEligibility,
		],
	);

	/**
	 * 历史回填把运行回合草稿折叠进 canonical entry 身份时同步迁移流式目标，
	 * 让后续增量继续落在同一条消息（TASK-0152）。
	 */
	const retargetProjectionMessage = useCallback((from: string, to: string) => {
		conversationProjectionRef.current.retargetMessageId(from, to);
	}, []);

	return { bumpSuggestionToken, createSessionEventHandler, resetEventBuffers, retargetProjectionMessage };
}

function buildRecentConversation(messages: ChatTimelineItem[]): string {
	const relevant = messages.filter((message) => message.kind !== "event");
	let startIndex = relevant.length;
	let userCount = 0;
	for (let index = relevant.length - 1; index >= 0; index--) {
		const item = relevant[index];
		if (item.kind === "user" || (item.kind === "placeholder" && item.role === "user")) {
			userCount++;
			startIndex = index;
			if (userCount >= 3) break;
		}
	}
	const lines: string[] = [];
	for (const message of relevant.slice(startIndex)) {
		const text = (
			message.kind === "placeholder"
				? message.summary
				: message.kind === "agent"
					? resolveConversationAgentText(message)
					: message.text
		).trim();
		if (!text) continue;
		const role = message.kind === "user" || (message.kind === "placeholder" && message.role === "user");
		lines.push(`${role ? "User" : "Assistant"}: ${text.slice(0, 600)}`);
	}
	return lines.join("\n\n").slice(0, 4000);
}
