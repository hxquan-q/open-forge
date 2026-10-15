// Copyright The Open Forge contributors.
import type {
	CodingAgentToolApprovalDecision,
	CodingAgentToolApprovalFunctionRequest,
} from "@vetta/coding-agent/function-extensions";
import { evaluateUnattendedToolAutoApprove } from "@vetta/coding-agent/runtime";
import type { ApprovalDecisionRecordedEvent, ApprovalRequestedRecordedEvent } from "@vetta/runtime-core/kernel";
import { NodeProjectTrustStore } from "@vetta/runtime-node/host";
import type { ActionApprovalBroker } from "../app-actions/approval-broker.js";
import { readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { mainT } from "../i18n/index.js";
import { getAppLogger } from "../logger.js";
import { getSharedRuntime } from "../runtime.js";
import { getUnattendedPermissionTiersForSession } from "../scheduler/unattended-permission-session-registry.js";

const log = getAppLogger("tool-approval");

export type ToolApprovalHandler = (
	request: CodingAgentToolApprovalFunctionRequest,
	signal?: AbortSignal,
) => Promise<CodingAgentToolApprovalDecision>;

const TOOL_APPROVAL_PRESENTATION = "agent.tool-approval";
/** 决策后事实落盘的退避重试：Turn 收尾期间会话短暂非 idle。 */
const FLUSH_RETRY_INTERVAL_MS = 2_000;
const FLUSH_MAX_ATTEMPTS = 15;

/**
 * 高风险工具审批的 Desktop 侧实现（TASK-0016 / TASK-0116）：
 *
 * - 自动化会话若绑定无人值守分档，已授权档可对非 L4 静默放行（ADR-0132）；
 * - 计费/配额语境与 L4 永远弹窗；
 * - L3 命中 Project Trust（`.vetta-local/trust.json`）时静默放行；
 * - 弹窗复用 ActionApprovalBroker（超时、崩溃清理、窗口唤起语义一致）；
 * - 请求与决策作为会话事实排队，Turn 收尾后落盘（重启后由投影恢复审计轨迹）。
 */
export class DesktopToolApprovalBroker {
	private actionApprovals: ActionApprovalBroker | undefined;
	private readonly queuedFacts = new Map<string, ApprovalRequestedRecordedEvent[]>();
	private readonly queuedDecisions = new Map<string, ApprovalDecisionRecordedEvent[]>();
	private readonly subscriptions = new Map<string, () => void>();
	private readonly trustCache = new Map<string, NodeProjectTrustStore>();

	bindActionApprovalBroker(broker: ActionApprovalBroker): void {
		this.actionApprovals = broker;
	}

	readonly handle: ToolApprovalHandler = async (request, signal) => {
		if (signal?.aborted) return { decision: "deny" };
		try {
			return await this.evaluate(request, signal);
		} catch (error) {
			log.warn(
				`tool approval failed for ${request.toolName}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { decision: "deny" };
		}
	};

	private async evaluate(
		request: CodingAgentToolApprovalFunctionRequest,
		signal: AbortSignal | undefined,
	): Promise<CodingAgentToolApprovalDecision> {
		this.queueRequested(request);

		// 自动化会话无人值守分档（ADR-0132）：已授权档可对非 L4 静默放行；
		// 计费语境与 L4 仍强制人工；未授权档落入下方 Trust/UI 路径。
		const unattended = evaluateUnattendedToolAutoApprove({
			tiers: getUnattendedPermissionTiersForSession(request.sessionId),
			toolName: request.toolName,
			level: request.level,
			summary: request.summary,
			inputPreview: request.inputPreview,
		});
		if (unattended.outcome === "autoApprove") {
			this.queueDecision(request, "approve");
			return { decision: "approve" };
		}

		// Trust 命中：L3 及以下静默放行（grant 由宿主管理）；L4 永远逐次确认。
		if (request.level !== "L4") {
			const trust = await this.trustStoreFor(request.sessionId);
			if (trust && (await trust.allows(`tool:${request.toolName}`))) {
				this.queueDecision(request, "approve");
				return { decision: "approve" };
			}
		}

		const broker = this.actionApprovals;
		if (!broker) {
			this.queueDecision(request, "deny");
			return { decision: "deny" };
		}
		const decision = await broker.request(
			{
				actionId: `tool-approval:${request.approvalId}`,
				approvalPresentation: TOOL_APPROVAL_PRESENTATION,
				input: {
					toolName: request.toolName,
					level: request.level,
					summary: request.summary,
					affectedResources: [...request.affectedResources],
					inputPreview: request.inputPreview as never,
					rememberAvailable: request.level !== "L4",
				},
				title: mainT("taskApproval.title", { tool: request.toolName }),
				summary: request.summary,
				permission: `tool:${request.toolName}`,
			},
			signal,
		);

		if (!decision.approved) {
			this.queueDecision(request, "deny");
			return { decision: "deny" };
		}
		const rememberSession = (decision.input as { remember?: unknown } | undefined)?.remember === true;
		if (rememberSession && request.level !== "L4") {
			const trust = await this.trustStoreFor(request.sessionId);
			await trust?.grant({ capabilities: [`tool:${request.toolName}`] });
			this.queueDecision(request, "approve");
			return { decision: "approve" };
		}
		this.queueDecision(request, "approve_once");
		return { decision: "approve_once" };
	}

	private queueRequested(request: CodingAgentToolApprovalFunctionRequest): void {
		const event: ApprovalRequestedRecordedEvent = {
			type: "approval.requested.recorded",
			sessionId: request.sessionId,
			turnId: request.turnId,
			request: {
				schemaVersion: 1,
				approvalId: request.approvalId,
				taskId: "",
				sessionId: request.sessionId,
				turnId: request.turnId,
				toolName: request.toolName,
				risk: request.risk,
				summary: request.summary,
				inputPreview: request.inputPreview,
				affectedResources: request.affectedResources,
				createdAt: Date.now(),
			},
			timestamp: Date.now(),
		};
		this.queuedFacts.set(request.sessionId, [...(this.queuedFacts.get(request.sessionId) ?? []), event]);
		this.watchSessionForFlush(request.sessionId);
	}

	private queueDecision(
		request: CodingAgentToolApprovalFunctionRequest,
		decision: ApprovalDecisionRecordedEvent["decision"],
	): void {
		const event: ApprovalDecisionRecordedEvent = {
			type: "approval.decision.recorded",
			sessionId: request.sessionId,
			turnId: request.turnId,
			approvalId: request.approvalId,
			decision,
			timestamp: Date.now(),
		};
		this.queuedDecisions.set(request.sessionId, [...(this.queuedDecisions.get(request.sessionId) ?? []), event]);
	}

	/** 会话事件上出现 Turn 终态即尝试落盘；非 idle 时退避重试。 */
	private watchSessionForFlush(sessionId: string): void {
		if (this.subscriptions.has(sessionId)) return;
		const unsubscribe = getSharedRuntime().subscribe(sessionId, (event) => {
			if (
				event.type === "session.lifecycle" &&
				(event.phase === "turn_end" || event.phase === "agent_end" || event.phase === "aborted")
			) {
				void this.flush(sessionId, 0);
			}
		});
		this.subscriptions.set(sessionId, unsubscribe);
	}

	private async flush(sessionId: string, attempt: number): Promise<void> {
		const facts = [...(this.queuedFacts.get(sessionId) ?? []), ...(this.queuedDecisions.get(sessionId) ?? [])];
		if (facts.length === 0) return;
		try {
			await getSharedRuntime().recordTaskFacts(sessionId, facts);
			this.queuedFacts.delete(sessionId);
			this.queuedDecisions.delete(sessionId);
			log.info(`flushed ${facts.length} approval fact(s) for ${sessionId}`);
		} catch (error) {
			if (attempt >= FLUSH_MAX_ATTEMPTS) {
				log.warn(
					`dropping approval facts for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
				);
				this.queuedFacts.delete(sessionId);
				this.queuedDecisions.delete(sessionId);
				return;
			}
			setTimeout(() => void this.flush(sessionId, attempt + 1), FLUSH_RETRY_INTERVAL_MS);
		}
	}

	private async trustStoreFor(sessionId: string): Promise<NodeProjectTrustStore | undefined> {
		try {
			const runtime = getSharedRuntime();
			const sessionPath = runtime.getSessionPath(sessionId);
			if (!sessionPath) return undefined;
			const root = await readSessionCwdFromHeader(sessionPath);
			if (!root) return undefined;
			const cached = this.trustCache.get(root);
			if (cached) return cached;
			const store = new NodeProjectTrustStore({ projectRoot: root });
			this.trustCache.set(root, store);
			return store;
		} catch (error) {
			log.warn(
				`trust store unavailable for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return undefined;
		}
	}
}

const sharedToolApprovalBroker = new DesktopToolApprovalBroker();

export function getDesktopToolApprovalBroker(): DesktopToolApprovalBroker {
	return sharedToolApprovalBroker;
}
