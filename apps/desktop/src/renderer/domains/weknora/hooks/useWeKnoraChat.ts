// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraPublicConfig } from "@preload/api";
import { useAtom, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	weKnoraActiveRequestIdAtom,
	weKnoraMessagesAtom,
	weKnoraSessionBuffersAtom,
	weKnoraSessionIdAtom,
	weKnoraStreamingAtom,
	weKnoraStreamRoutesAtom,
	weKnoraViewSeqAtom,
} from "../atoms";
import {
	dispatchWeKnoraAsk,
	ensureWeKnoraStreamEngine,
	failWeKnoraAsk,
	replayWeKnoraPendingEvents,
	settleWeKnoraAskRoute,
} from "../weKnoraStreamEngine";
import {
	draftBufferKey,
	findRequestIdForSession,
	omitRoute,
	releaseBuffer,
	sessionIdsWithLiveStream,
} from "../weKnoraStreamStore";
import { errorCodeOf, isConfigured } from "./weKnoraModelSupport";

export interface WeKnoraChatDeps {
	readonly config: WeKnoraPublicConfig | null;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	/** 新建会话成功后刷新历史列表（缺陷 2：仅新建时刷新，追问复用会话不重复拉）。 */
	readonly loadSessions: () => Promise<void>;
	/** 载入历史会话的消息（AC-14）。 */
	readonly fetchMessages: (sessionId: string) => Promise<WeKnoraChatMessage[] | null>;
}

export interface WeKnoraChatState {
	readonly messages: readonly WeKnoraChatMessage[];
	/** 当前对话绑定的 WeKnora 会话 id；`null` = 「新对话，尚未建会话」（AC-11/12）。 */
	readonly sessionId: string | null;
	/** **当前会话**是否在流式中（per-session 语义，AC-18）：后台其他会话不影响本值。 */
	readonly isStreaming: boolean;
	/** 有活跃流（含后台）的会话 id 集合：AC-19 行级指示、AC-10 禁删的判定源。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	/** 允许提问：已配置 + 有可用智能体 + **当前会话**无进行中的回答（AC-7 / AC-19 / AC-18）。 */
	readonly canAsk: boolean;
	readonly send: (text: string) => void;
	readonly cancel: () => void;
	/** 新建对话：清空当前会话与消息，**不立即建会话**（AC-12），也**不终止任何流**（AC-16）。 */
	readonly newConversation: () => void;
	/** 载入历史会话并恢复为当前对话，之后追问接上（AC-14 / AC-17）。 */
	readonly openSession: (sessionId: string) => Promise<void>;
	/**
	 * 读**最新**的当前会话 id（调用时直读 atom，不信渲染快照）。
	 *
	 * ER-B F5：异步编排（删除）在途时用户可能已切到别的会话，闭包快照会陈旧 —— 需要判定
	 * 「删的是不是**此刻**打开的会话」时用它，避免把新打开的会话误清成空态。
	 */
	readonly readCurrentSessionId: () => string | null;
}

/**
 * 对话 actor（后台思考，02-plan §2.6）：把「单当前会话」模型重构为「按会话路由」。
 *
 * 三件套（全部模块级 atom，跨挂载 / 跨会话切换存活）：
 * - **归属表** `weKnoraStreamRoutesAtom`：requestId → 会话 id，事件按它路由（AC-15/18 防串台）；
 * - **每会话缓冲** `weKnoraSessionBuffersAtom`：条目存在 = 该会话有活跃流（AC-19 指示源），
 *   终态释放（R6）；草稿期以 `draft:<视图代次>` 为临时键，ask 落库后迁移（假设 7）；
 * - **投影** `weKnoraMessagesAtom`：收编为「当前会话缓冲的投影」，视图只读它 ——
 *   切走（AC-16）只是不再投影，缓冲照常累积；回切（AC-17）直接以缓冲为视图，不重拉。
 *
 * 「订阅 → 路由 → 落 atom → 终态副作用（后台去抖重拉）」在**模块级常驻引擎**
 * `weKnoraStreamEngine`：订阅幂等单例、**不随组件卸载退订**（离开 /weknora 路由期间
 * 流照常路由，CP3 修复）；本 hook 只留**状态投影与用户动作**
 * （send / cancel / newConversation / openSession）。
 *
 * ## 防御语义的保持（引擎迁移后逐条对照；原注释是行为规格）
 *
 * 1. **requestId 过滤**：未知 requestId 的事件一律丢弃（原「事件按 requestId 过滤防串台」，
 *    现由归属表承担；重复终态 / 取消后迟到的 turn.cancelled 因此天然幂等）。
 * 2. **ask 未决窗口**：requestId 要等 ask 返回才知道，此间到达的本请求首片先进引擎的
 *    暂存队列，返回后回放，不丢首个分片；其他已注册路由的事件不受未决窗口影响，
 *    照常路由（并发提问的必要条件，AC-18）。
 * 3. **重挂恢复**：流身份（requestId）只存 `weKnoraActiveRequestIdAtom`——模块级、跨挂载
 *    存活，引擎在终态时清它——流式中切走路由再切回，仍能取消 / 继续接收该流
 *    （① / AC-8 / AC-22）。
 * 4. **挂载残留收敛**：`isStreaming` 为真但当前会话连活跃缓冲都没有（例如 ask 尚未返回
 *    就切走后残留），取消无从下手，收敛成确定终态，绝不让「转圈」挂在界面上（① / AC-22）。
 * 5. **草稿迁移**：草稿期以视图代次为临时键缓冲，ask 落库后由引擎迁到真实 sessionId，
 *    会话随列表重拉出现，回切走列表（假设 7）。
 */
export function useWeKnoraChat(deps: WeKnoraChatDeps): WeKnoraChatState {
	const { config, agents, agentsStatus, selectedAgentId, loadSessions, fetchMessages } = deps;
	const [messages, setMessages] = useAtom(weKnoraMessagesAtom);
	const [sessionId, setSessionId] = useAtom(weKnoraSessionIdAtom);
	const [isStreaming, setIsStreaming] = useAtom(weKnoraStreamingAtom);
	const [, setActiveRequestId] = useAtom(weKnoraActiveRequestIdAtom);
	const [, setRoutes] = useAtom(weKnoraStreamRoutesAtom);
	const [buffers, setBuffers] = useAtom(weKnoraSessionBuffersAtom);
	const [, setViewSeq] = useAtom(weKnoraViewSeqAtom);
	/**
	 * 异步回调（ask 返回 / 事件到达）里不能信 useAtom 的渲染快照——未决窗口跨多次渲染，
	 * 闭包里的值会陈旧。`useStore()` 拿到 Provider 作用域的 store 引用（跨挂载稳定），
	 * `store.get(...)` 随时读到实时值；模块级流引擎也以它为键接线（同一 store 一条订阅）。
	 */
	const store = useStore();

	const messageCounterRef = useRef(0);

	/** 当前对话的缓冲键：已落库会话用 sessionId；草稿用当前视图代次的 draft 键。 */
	const currentBufferKey = useCallback((): string => {
		const currentSession = store.get(weKnoraSessionIdAtom);
		return currentSession === null ? draftBufferKey(store.get(weKnoraViewSeqAtom)) : currentSession;
	}, [store]);

	/**
	 * 接线模块级流引擎（幂等）：本 store 首个挂载建立常驻订阅，重挂 / 并存挂载只刷新
	 * `loadSessions` 引用。**刻意不返回清理函数**——订阅生命周期 = 模块生命周期，
	 * 页面卸载绝不退订：否则离开 /weknora 路由期间流事件无人接收（本次修复的缺陷，
	 * 详见引擎头注释）。
	 */
	useEffect(() => {
		ensureWeKnoraStreamEngine(store, loadSessions);
	}, [store, loadSessions]);

	/**
	 * 挂载时做两件事（① / AC-17 / AC-22）：
	 *
	 * 1. **回切同步**：当前会话有活跃缓冲 → 投影直接取缓冲内容。卸载（离开路由）窗口内
	 *    到达的分片已由常驻引擎路由进该缓冲（订阅不随卸载退订），这里把它们整体呈给
	 *    视图 —— 回切立即可见已累积的部分，后续分片继续实时追加。
	 * 2. **残留收敛**：`isStreaming` 为真但当前会话连活跃缓冲都没有（比旧模型「连 requestId
	 *    都没有」更宽的等价判定：send 起步就会种缓冲，缓冲缺失说明这条流已无从接管），
	 *    直接收敛成确定终态。
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时对状态做一次对账，之后由 send / cancel / 终态事件驱动
	useEffect(() => {
		const key = currentBufferKey();
		const live = store.get(weKnoraSessionBuffersAtom)[key];
		if (live !== undefined) {
			setMessages(live);
			return;
		}
		if (store.get(weKnoraStreamingAtom)) {
			setIsStreaming(false);
			setMessages((prev) =>
				prev.map((message) => (message.status === "streaming" ? { ...message, status: "interrupted" } : message)),
			);
		}
	}, []);

	const send = useCallback(
		async (text: string) => {
			const query = text.trim();
			const allowed = isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming;
			if (!query || !allowed) return;
			messageCounterRef.current += 1;
			const userMessage: WeKnoraChatMessage = {
				id: `u${messageCounterRef.current}`,
				role: "user",
				text: query,
				thinking: "",
				status: "complete",
			};
			messageCounterRef.current += 1;
			const assistantId = `a${messageCounterRef.current}`;
			const assistantMessage: WeKnoraChatMessage = {
				id: assistantId,
				role: "assistant",
				text: "",
				thinking: "",
				status: "streaming",
			};
			/**
			 * 目标对话的缓冲键（发起时刻快照）：已落库会话用 sessionId；草稿用当前视图代次的
			 * draft 键 —— requestId 要等 ask 返回才知道，草稿期只能以视图代次为临时身份，
			 * 落库后迁移（假设 7）。
			 */
			const originSessionId = store.get(weKnoraSessionIdAtom);
			const originSeq = store.get(weKnoraViewSeqAtom);
			const targetKey = originSessionId ?? draftBufferKey(originSeq);
			// 种子缓冲 = 当前对话完整投影 + 本轮问答占位。缓冲从第一片起就是全量会话，
			// 回切时直接当视图用（AC-17），不需要 fetch-合并去重（02-plan §2.6 的简化落地）。
			const base = store.get(weKnoraMessagesAtom);
			const seededMessages = [...base, userMessage, assistantMessage];
			setMessages(seededMessages);
			setBuffers((prev) => ({ ...prev, [targetKey]: seededMessages }));
			setIsStreaming(true);
			// 开一个未决窗口（防御语义 2）：ask 返回前到达的本请求首片由引擎暂存待回放。
			dispatchWeKnoraAsk(store);
			// 本次是否新建 WeKnora 会话（缺陷 2：新建成功后才刷新历史，追问复用会话不重复拉）。
			const isNewSession = originSessionId === null;
			try {
				const result = await window.vetta.weknora.ask({
					...(originSessionId === null ? {} : { sessionId: originSessionId }),
					// AC-18 v5：把当前选中的智能体显式传下去，不再让主进程隐式读全局配置。
					...(selectedAgentId === null ? {} : { agentId: selectedAgentId }),
					query,
				});
				// 注册归属 + 草稿迁移（假设 7，防御语义 5）：draft:<代次> → 真实 sessionId，
				// 并收敛未决窗口计数（引擎内完成，幂等）。
				settleWeKnoraAskRoute(store, result.requestId, result.sessionId, targetKey);
				// 缺陷 2（实机反馈）：新会话刚落库，左栏应立刻出现，无需手动刷新页面。
				if (isNewSession) void loadSessions();
				/**
				 * 视图还停在发起对话上才挂为「当前活跃流」；已切走则纯后台（AC-16）。
				 * 会话对话以 sessionId 判同（重开同一会话仍算同对话）；草稿没有 id，
				 * 只能以视图代次判同 —— 新建对话会换代次，旧草稿的 ask 不会劫持新草稿。
				 */
				const stillViewing =
					store.get(weKnoraSessionIdAtom) === originSessionId &&
					(originSessionId !== null || store.get(weKnoraViewSeqAtom) === originSeq);
				if (stillViewing) {
					setActiveRequestId(result.requestId);
					if (originSessionId === null) setSessionId(result.sessionId);
				}
				// 回放未决窗口暂存的事件（防御语义 2，引擎内完成）：只放行本请求的。
				// 刻意放在视图身份挂接之后：草稿此时才第一次拿到真实 sessionId，
				// 回放的首片才能按「当前会话缓冲」投影。
				replayWeKnoraPendingEvents(store, result.requestId);
			} catch (error) {
				failWeKnoraAsk(store);
				const code = errorCodeOf(error);
				// 占位消息标失败：仍在查看该对话 → 投影同步；缓冲释放（没有流会再推进它）。
				const markFailed = (list: readonly WeKnoraChatMessage[]): WeKnoraChatMessage[] =>
					list.map((message) =>
						message.id === assistantId ? { ...message, status: "failed", errorCode: code } : message,
					);
				if (
					store.get(weKnoraSessionIdAtom) === originSessionId &&
					(originSessionId !== null || store.get(weKnoraViewSeqAtom) === originSeq)
				) {
					setIsStreaming(false);
					setActiveRequestId(null);
					setMessages((prev) => markFailed(prev));
				}
				setBuffers((prev) => releaseBuffer(prev, targetKey));
			}
		},
		[
			agents.length,
			agentsStatus,
			config,
			isStreaming,
			loadSessions,
			selectedAgentId,
			setActiveRequestId,
			setBuffers,
			setIsStreaming,
			setMessages,
			setSessionId,
			store,
		],
	);

	/**
	 * 取消**当前会话**的流（AC-21）：后台流不提供取消入口（跑到自然终态）。
	 * 保留已收到的部分文本，仅把状态标为「已取消」（AC-8）；主进程随后补发的
	 * turn.cancelled 因归属已注销而被幂等丢弃。
	 */
	const cancel = useCallback(() => {
		// 流身份直读 atom（模块级、引擎终态时会清）：重挂后依然有效（防御语义 3）。
		const requestId = store.get(weKnoraActiveRequestIdAtom);
		if (requestId === null) return;
		const key = currentBufferKey();
		setActiveRequestId(null);
		setIsStreaming(false);
		setMessages((prev) =>
			prev.map((message) => (message.status === "streaming" ? { ...message, status: "cancelled" } : message)),
		);
		setRoutes((prev) => omitRoute(prev, requestId));
		setBuffers((prev) => releaseBuffer(prev, key));
		void window.vetta.weknora.cancel(requestId);
	}, [currentBufferKey, setActiveRequestId, setBuffers, setIsStreaming, setMessages, setRoutes, store]);

	/**
	 * 新建对话（AC-12 / AC-16）：只切换视图（代次 +1、指针清空、投影清空），
	 * **不终止任何流** —— 原对话若在流式中转为后台继续跑，历史列表行仍有「思考中」指示。
	 */
	const newConversation = useCallback(() => {
		setViewSeq((seq) => seq + 1);
		setSessionId(null);
		setMessages([]);
		setIsStreaming(false);
		setActiveRequestId(null);
	}, [setActiveRequestId, setIsStreaming, setMessages, setSessionId, setViewSeq]);

	const openSession = useCallback(
		async (targetSessionId: string) => {
			// 目标会话有活跃缓冲（含 ask 未决期）→ 以缓冲为准，**不重拉**（AC-17：已累积部分
			// 立即可见、后续分片继续实时追加、不重新发起请求、不从头重播）。
			const live = store.get(weKnoraSessionBuffersAtom)[targetSessionId];
			if (live !== undefined) {
				setViewSeq((seq) => seq + 1);
				setSessionId(targetSessionId);
				setMessages(live);
				setIsStreaming(true);
				setActiveRequestId(findRequestIdForSession(store.get(weKnoraStreamRoutesAtom), targetSessionId));
				return;
			}
			const loaded = await fetchMessages(targetSessionId);
			// 失败：不切换、不崩溃（失败收口是 T06 范围）。成功：整体替换为服务端事实（AC-14）。
			if (loaded === null) return;
			setViewSeq((seq) => seq + 1);
			setSessionId(targetSessionId);
			setMessages(loaded);
			setIsStreaming(false);
			setActiveRequestId(null);
		},
		[fetchMessages, setActiveRequestId, setIsStreaming, setMessages, setSessionId, setViewSeq, store],
	);

	/** AC-19 指示源：缓冲键里非草稿的部分 = 有活跃流（含后台、含未决 ask）的会话集合。 */
	const streamingSessionIds = useMemo(() => new Set(sessionIdsWithLiveStream(buffers)), [buffers]);

	/** ER-B F5：调用时直读 atom 的「最新当前会话 id」读取口（不信闭包快照）。 */
	const readCurrentSessionId = useCallback((): string | null => store.get(weKnoraSessionIdAtom), [store]);

	return {
		messages,
		sessionId,
		isStreaming,
		streamingSessionIds,
		canAsk: isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming,
		send,
		cancel,
		newConversation,
		openSession,
		readCurrentSessionId,
	};
}
