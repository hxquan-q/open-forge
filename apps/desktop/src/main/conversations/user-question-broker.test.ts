// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import { DesktopUserQuestionBroker } from "./user-question-broker.js";

const request = {
	requestId: "question-1",
	sessionId: "session-1",
	questions: [{ question: "Choose?", header: "Choice", options: [] }],
};

function createBroker() {
	const broker = new DesktopUserQuestionBroker();
	const presenter = { present: vi.fn() };
	const resolved = vi.fn();
	const detach = broker.setPresenter(presenter);
	const stopResolved = broker.onQuestionResolved(resolved);
	return { broker, presenter, resolved, detach, stopResolved };
}

describe("DesktopUserQuestionBroker", () => {
	it("keeps a question pending until the user answers, then reports it resolved once", async () => {
		const { broker, presenter, resolved } = createBroker();
		const answer = broker.handle(request);

		expect(presenter.present).toHaveBeenCalledWith(request);
		expect(broker.listPendingQuestions()).toEqual([request]);

		const reply = { cancelled: false, answers: [{ question: "Choose?", answers: ["A"] }] };
		broker.respond("question-1", reply);
		await expect(answer).resolves.toEqual(reply);
		expect(broker.listPendingQuestions()).toEqual([]);
		expect(resolved).toHaveBeenCalledWith({ requestId: "question-1", sessionId: "session-1" });
		expect(resolved).toHaveBeenCalledTimes(1);

		// 重复应答（双击、迟到的 IPC）不会影响已结束的提问。
		broker.respond("question-1", { cancelled: true, answers: [] });
		expect(resolved).toHaveBeenCalledTimes(1);
	});

	it("sanitizes renderer replies and treats malformed ones as cancelled", async () => {
		const { broker } = createBroker();
		const malformed = broker.handle(request);
		broker.respond("question-1", { cancelled: false });
		await expect(malformed).resolves.toEqual({ cancelled: true, answers: [] });

		const filtered = broker.handle({ ...request, requestId: "question-2" });
		broker.respond("question-2", {
			cancelled: false,
			answers: [
				{ question: 42, answers: ["bad question"] },
				{ question: "Choose?", answers: ["A", 3] },
			],
		});
		await expect(filtered).resolves.toEqual({
			cancelled: false,
			answers: [{ question: "Choose?", answers: ["A"] }],
		});
	});

	it("treats interruption, renderer loss and a missing surface as cancelled", async () => {
		const { broker, detach } = createBroker();
		const controller = new AbortController();
		const aborted = broker.handle(request, controller.signal);
		controller.abort();
		await expect(aborted).resolves.toEqual({ cancelled: true, answers: [] });

		const orphaned = broker.handle({ ...request, requestId: "question-2" });
		broker.cancelAll();
		await expect(orphaned).resolves.toEqual({ cancelled: true, answers: [] });

		detach();
		expect(broker.isAvailable()).toBe(false);
		await expect(broker.handle({ ...request, requestId: "question-3" })).resolves.toEqual({
			cancelled: true,
			answers: [],
		});
	});

	it("races a remote handler against the renderer surface, first answer wins", async () => {
		type QuestionReply = { cancelled: boolean; answers: Array<{ question: string; answers: string[] }> };
		const { broker, presenter, resolved } = createBroker();
		const remoteReply: QuestionReply = { cancelled: false, answers: [{ question: "Choose?", answers: ["remote"] }] };
		let finishRemote!: (reply: QuestionReply) => void;
		const remote = new Promise<QuestionReply>((resolve) => {
			finishRemote = resolve;
		});
		const unregister = broker.registerRemoteHandler("session-1", () => remote);
		const answer = broker.handle(request);

		expect(presenter.present).toHaveBeenCalledWith(request);
		expect(broker.listPendingQuestions()).toEqual([request]);

		// 远程先答：renderer 的呈现在竞速落败时按取消收尾，迟到应答不再生效。
		finishRemote(remoteReply);
		await expect(answer).resolves.toEqual(remoteReply);
		broker.respond("question-1", { cancelled: true, answers: [] });
		expect(broker.listPendingQuestions()).toEqual([]);
		expect(resolved).toHaveBeenCalledTimes(1);
		unregister();
	});
});
