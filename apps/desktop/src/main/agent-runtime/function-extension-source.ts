// Modified by The Open Forge contributors.
import {
	CODING_AGENT_ARTIFACT_FUNCTION,
	CODING_AGENT_ASK_USER_QUESTION_FUNCTION,
	CODING_AGENT_ATTACH_ARTIFACT_FUNCTION,
	CODING_AGENT_BROWSER_TAB_FUNCTION,
	CODING_AGENT_FILE_ORGANIZE_FUNCTION,
	CODING_AGENT_PLAN_REVIEW_FUNCTION,
	CODING_AGENT_SANDBOX_AUTHORIZATION_FUNCTION,
	CODING_AGENT_TOOL_APPROVAL_FUNCTION,
	type CodingAgentArtifactFunctionRequest,
	type CodingAgentArtifactFunctionResult,
} from "@vetta/coding-agent/function-extensions";
import {
	SessionExtensionFunctionRegistry,
	type SessionExtensionFunctionSource,
} from "@vetta/runtime-core/session-extensions";
import { invokeDesktopBrowserTab } from "../browser-automation/in-app-browser-tab-host.js";
import { getDesktopPlanReviewBroker } from "../conversations/plan-review-broker.js";
import { getDesktopSandboxAuthorizationBroker } from "../conversations/sandbox-authorization-broker.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";
import { getAppLogger } from "../logger.js";
import { getDesktopFileOrganizeBroker } from "../task-activity/file-organize-broker.js";
import { desktopTaskActivityService } from "../task-activity/task-activity-service.js";
import { getDesktopToolApprovalBroker } from "../task-activity/tool-approval-broker.js";

export interface DesktopCodingAgentFunctionSourceLogger {
	warn(message: string, context: { readonly functionId: string; readonly errorName?: string }): void;
}

let desktopFunctionSource: SessionExtensionFunctionSource | undefined;

/** Composition Root 创建后登记共享函数源，供会话级收窄（如团队成员会话）包装使用。 */
export function setDesktopCodingAgentFunctionSource(source: SessionExtensionFunctionSource): void {
	desktopFunctionSource = source;
}

export function getDesktopCodingAgentFunctionSource(): SessionExtensionFunctionSource | undefined {
	return desktopFunctionSource;
}

export interface DesktopCodingAgentFunctionSourceOptions {
	readonly logger?: DesktopCodingAgentFunctionSourceLogger;
	readonly invokeArtifact?: (
		request: CodingAgentArtifactFunctionRequest,
		signal: AbortSignal,
	) => Promise<CodingAgentArtifactFunctionResult>;
	readonly invokeBrowserTab?: typeof invokeDesktopBrowserTab;
}

/** Desktop product composition adapter; Runtime only receives the generic function source. */
export function createDesktopCodingAgentFunctionSource(
	options: DesktopCodingAgentFunctionSourceOptions = {},
): SessionExtensionFunctionSource {
	const questions = getDesktopUserQuestionBroker();
	const sandbox = getDesktopSandboxAuthorizationBroker();
	const planReviews = getDesktopPlanReviewBroker();
	const toolApprovals = getDesktopToolApprovalBroker();
	const fileOrganize = getDesktopFileOrganizeBroker();
	const warn: DesktopCodingAgentFunctionSourceLogger["warn"] = (message, context) =>
		(options.logger ?? getAppLogger("agent-runtime")).warn(message, context);
	const registry = new SessionExtensionFunctionRegistry();
	registry.register(CODING_AGENT_ASK_USER_QUESTION_FUNCTION, (request, signal) => questions.handle(request, signal));
	registry.register(CODING_AGENT_SANDBOX_AUTHORIZATION_FUNCTION, (request, signal) => sandbox.handle(request, signal));
	registry.register(CODING_AGENT_TOOL_APPROVAL_FUNCTION, (request, signal) => toolApprovals.handle(request, signal));
	registry.register(CODING_AGENT_FILE_ORGANIZE_FUNCTION, (request, signal) => fileOrganize.handle(request, signal));
	if (options.invokeArtifact) {
		registry.register(CODING_AGENT_ARTIFACT_FUNCTION, options.invokeArtifact);
	}
	registry.register(CODING_AGENT_ATTACH_ARTIFACT_FUNCTION, async (request) => {
		const outcome = await desktopTaskActivityService.attachToActiveTask(request.sessionId, {
			kind: request.kind,
			title: request.title,
			uri: request.uri,
			...(request.contentType ? { contentType: request.contentType } : {}),
		});
		return outcome.ok ? { attached: true } : { attached: false, reason: outcome.message };
	});
	registry.register(CODING_AGENT_PLAN_REVIEW_FUNCTION, (request, signal) => planReviews.handle(request, signal));
	// 应用内 WebView 会话能力由 Desktop 恒常提供；无页面时由 host 返回 no_browser_session。
	registry.register(CODING_AGENT_BROWSER_TAB_FUNCTION, options.invokeBrowserTab ?? invokeDesktopBrowserTab);
	const unavailable = new Set<string>();
	const readAvailability = (functionId: string, available: boolean): boolean => {
		if (available) {
			unavailable.delete(functionId);
			return true;
		}
		if (!unavailable.has(functionId)) {
			unavailable.add(functionId);
			warn("coding agent function unavailable", { functionId });
		}
		return false;
	};

	return {
		has(token) {
			if (token.id === CODING_AGENT_ARTIFACT_FUNCTION.id) {
				return options.invokeArtifact !== undefined;
			}
			if (token.id === CODING_AGENT_ASK_USER_QUESTION_FUNCTION.id) {
				return readAvailability(token.id, questions.isAvailable());
			}
			if (token.id === CODING_AGENT_SANDBOX_AUTHORIZATION_FUNCTION.id) {
				return readAvailability(token.id, sandbox.isAvailable());
			}
			if (token.id === CODING_AGENT_PLAN_REVIEW_FUNCTION.id) {
				return readAvailability(token.id, planReviews.isAvailable());
			}
			if (token.id === CODING_AGENT_BROWSER_TAB_FUNCTION.id) {
				return true;
			}
			return false;
		},
		async invoke(token, input, signal) {
			try {
				return await registry.invoke(token, input, signal);
			} catch (error) {
				if (!signal?.aborted) {
					warn("coding agent function invocation failed", {
						functionId: token.id,
						errorName: error instanceof Error ? error.name : "UnknownError",
					});
				}
				throw error;
			}
		},
	};
}
