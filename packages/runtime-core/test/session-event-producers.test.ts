// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "../src/contracts.js";

type RuntimeSessionEventType = Exclude<SessionEvent, { readonly channel: "assistant" }>["type"];

interface SessionEventProducer {
	/** Source file, relative to the repository root, that constructs the event. */
	readonly file: string;
	/** The `type` literal written there when the event is built from an observation of another name. */
	readonly literal?: string;
}

/**
 * Every Runtime SessionEvent type and where it is produced.
 *
 * `satisfies Record<…>` keeps this exhaustive: adding an event type to the contract
 * fails to compile until its producer is named here, and an event type removed from
 * the contract must be removed here too. The test below checks that each named file
 * really constructs the event, so a type whose producer disappears cannot linger in
 * the contract while consumers keep branching on it.
 *
 * 与上游 e0c24f4ab 的差异：本仓的 message.delta / thinking.delta / toolcall.start
 * 由 Desktop 调度器生产（真实消费方存在），因此本表按仓库根相对路径登记跨包生产者；
 * 已删除的 message.final / toolcall.args 由 check-session-event-tombstones.mjs 墓碑拦截。
 */
const SESSION_EVENT_PRODUCERS = {
	"session.context.state": { file: "packages/runtime-core/src/session-context-state.ts" },
	"session.lifecycle": { file: "packages/runtime-core/src/runtime-host/session-events.ts" },
	"session.path_changed": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	"message.delta": { file: "apps/desktop/src/main/scheduler/task-executor.ts" },
	"thinking.delta": { file: "apps/desktop/src/main/scheduler/task-executor.ts" },
	"toolcall.start": { file: "apps/desktop/src/main/scheduler/task-executor.ts" },
	"tool.start": { file: "packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts" },
	"tool.update": { file: "packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts" },
	"tool.phase": { file: "packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts" },
	"tool.end": { file: "packages/runtime-core/src/kernel/stateless-agent-core-turn-engine.ts" },
	"usage.update": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	error: { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	"session.extension": { file: "packages/runtime-core/src/session-extensions/contracts.ts" },
	"task.lifecycle": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	"artifact.descriptor": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	"approval.requested": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	"approval.decision": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
	active_tools_update: { file: "packages/runtime-core/src/runtime-host/runtime-host-session-event-relay.ts" },
	"compaction.start": { file: "packages/runtime-core/src/runtime-host/composed-runtime-factory.ts" },
	"compaction.end": { file: "packages/runtime-core/src/kernel/turn-pipeline.ts" },
	"retry.start": { file: "packages/runtime-core/src/runtime-host/session-retry.ts" },
	"retry.end": { file: "packages/runtime-core/src/runtime-host/session-retry.ts" },
	"queue.changed": { file: "packages/runtime-core/src/runtime-host/kernel-session-events.ts" },
} satisfies Record<RuntimeSessionEventType, SessionEventProducer>;

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

describe("SessionEvent contract", () => {
	it.each(Object.entries(SESSION_EVENT_PRODUCERS) as Array<[RuntimeSessionEventType, SessionEventProducer]>)(
		"%s has a producer",
		(type, producer) => {
			const source = readFileSync(`${REPO_ROOT}${producer.file}`, "utf8");
			const literal = producer.literal ?? type;
			expect(source).toMatch(new RegExp(`type:\\s*"${escapeRegExp(literal)}"`, "u"));
		},
	);
});
