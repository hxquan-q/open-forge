// Modified by The Open Forge contributors.
import { defineRuntimeObservation, type RuntimeObservationPublisher } from "@vetta/runtime-core/observation";
import { type AsyncExecutionGate, type AsyncExecutionGateEvent, createAsyncExecutionGate } from "@vetta/runtime-tools";

export const CODING_AGENT_OCR_ADMISSION_OBSERVATION = defineRuntimeObservation<AsyncExecutionGateEvent>(
	"coding-agent.ocr",
	"admission",
	"debug",
);

const OCR_MAX_QUEUED = 8;
const OCR_WAIT_TIMEOUT_MS = 60_000;

let sharedOcrExecutionGate: AsyncExecutionGate | undefined;

/** Coding Agent 的所有 Session 共用同一 OCR 并发策略。 */
export function getCodingAgentOcrExecutionGate(
	maxConcurrent = 1,
	observationPublisher?: RuntimeObservationPublisher,
): AsyncExecutionGate {
	const concurrency = Number.isInteger(maxConcurrent) && maxConcurrent >= 1 ? maxConcurrent : 1;
	sharedOcrExecutionGate ??= createAsyncExecutionGate(concurrency, {
		maxQueued: OCR_MAX_QUEUED,
		scheduling: "round-robin",
	});
	const shared = sharedOcrExecutionGate;
	// Publisher ownership stays with this session; only scheduling state is process-wide.
	return {
		run(operation, options) {
			return shared.run(operation, {
				...options,
				waitTimeoutMs: Math.min(options?.waitTimeoutMs ?? OCR_WAIT_TIMEOUT_MS, OCR_WAIT_TIMEOUT_MS),
				onEvent(event) {
					observationPublisher?.record(CODING_AGENT_OCR_ADMISSION_OBSERVATION, event, {
						sessionId: event.ownerId,
						toolCallId: event.requestId,
					});
					return options?.onEvent?.(event);
				},
			});
		},
	};
}
