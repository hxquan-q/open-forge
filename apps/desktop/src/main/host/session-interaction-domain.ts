// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SESSION_INTERACTION_HOST_METHODS } from "@vetta/host-protocol";
import { getDesktopPlanReviewBroker } from "../conversations/plan-review-broker.js";
import { getDesktopUserQuestionBroker } from "../conversations/user-question-broker.js";

/**
 * 问答与计划评审应答子域的 Host 实现（TASK-0465 组 3 / TASK-0478）：薄桥接，
 * 能力全部在 broker（与旧 IPC handler 同职责，只换合同入口）。
 * respond* 的 result 是不可信 renderer 输入，由 broker 自身的 normalize 收窄。
 */
export const sessionInteractionHostDomain: HostDomainImplementation<typeof SESSION_INTERACTION_HOST_METHODS> = {
	listPendingQuestions: () =>
		getDesktopUserQuestionBroker()
			.listPendingQuestions()
			.map((request) => ({
				requestId: request.requestId,
				sessionId: request.sessionId,
				questions: request.questions.map((question) => ({
					question: question.question,
					header: question.header,
					options: question.options.map((option) => ({
						label: option.label,
						description: option.description,
						...(option.badges === undefined ? {} : { badges: [...option.badges] }),
					})),
					...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
				})),
			})),
	respondToQuestion: ({ requestId, result }) => {
		getDesktopUserQuestionBroker().respond(requestId, result);
		return null;
	},
	listPendingPlanReviews: () => getDesktopPlanReviewBroker().listPending(),
	respondToPlanReview: ({ requestId, result }) => {
		getDesktopPlanReviewBroker().respond(requestId, result);
		return null;
	},
};
