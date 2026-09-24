// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	ARTIFACT_FIXTURES,
	approvalRequestFixture,
	artifactDescriptorFixture,
	PERMISSION_GRANT_FIXTURES,
	permissionGrantFixture,
	runTaskScenario,
	TASK_FIXTURE_IDS,
	TASK_SCENARIOS,
	taskIdentityFixture,
	taskSnapshotFixture,
	toolRiskDescriptorFixture,
} from "../../src/task/fixtures.js";
import {
	readApprovalRequest,
	readArtifactDescriptor,
	readPermissionGrant,
	readRuntimeTaskEvent,
	readRuntimeTaskSnapshot,
	readToolRiskDescriptor,
} from "../../src/task/read-contracts.js";
import {
	ARTIFACT_AVAILABILITY,
	canTransitionRuntimeTask,
	isPermissionGrantActive,
	isRuntimeTaskTerminal,
	permissionGrantAllows,
	RUNTIME_TASK_ERROR_CODES,
	RuntimeTaskError,
	type RuntimeTaskIntent,
	rebuildRuntimeTaskSnapshot,
	resolveArtifactAvailability,
	transitionRuntimeTask,
} from "../../src/task/state-machine.js";

const step = (intent: RuntimeTaskIntent) => ({ eventId: "evt-x", at: 2_000, intent });

describe("task state machine", () => {
	it("runs every scenario to its expected terminal/active status", () => {
		for (const scenario of TASK_SCENARIOS) {
			const { snapshot } = runTaskScenario(scenario);
			expect(snapshot.status).toBe(scenario.expectedStatus);
		}
	});

	it("commits ordered events per transition (status_changed before turn_bound)", () => {
		const { events } = runTaskScenario(TASK_SCENARIOS[0]!);
		expect(events[0]?.type).toBe("task.created");
		const types = events.slice(1).map((e) => e.type);
		// plan → status, start → status + turn_bound, attach → artifact, review → status, review approve → status
		expect(types).toEqual([
			"task.status_changed",
			"task.status_changed",
			"task.turn_bound",
			"task.artifact_attached",
			"task.status_changed",
			"task.status_changed",
		]);
		// status transitions land in order and record the from-status actually held
		const statusEvents = events.filter((e) => e.type === "task.status_changed");
		expect(statusEvents.map((e) => [e.from, e.to])).toEqual([
			["draft", "planning"],
			["planning", "running"],
			["running", "awaiting_review"],
			["awaiting_review", "completed"],
		]);
	});

	it("rejects illegal transitions with a stable error code", () => {
		const draft = taskSnapshotFixture();
		expect(() => transitionRuntimeTask(draft, step({ type: "submit_review" }))).toThrowError(RuntimeTaskError);
		expect(() => transitionRuntimeTask(draft, step({ type: "submit_review" }))).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION }),
		);
		// terminal states accept nothing
		const completed = runTaskScenario(TASK_SCENARIOS[0]!).snapshot;
		for (const intent of [
			{ type: "plan" },
			{ type: "start", turnId: "t2", generation: "g2" },
			{ type: "cancel" },
			{ type: "fail" },
		] as const) {
			expect(() => transitionRuntimeTask(completed, step(intent))).toThrowError(
				expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION }),
			);
		}
		expect(isRuntimeTaskTerminal("completed")).toBe(true);
		expect(isRuntimeTaskTerminal("running")).toBe(false);
		expect(canTransitionRuntimeTask("paused", "running")).toBe(true);
		expect(canTransitionRuntimeTask("paused", "awaiting_review")).toBe(false);
	});

	it("requires a Turn binding to enter running — a Task owns no model loop", () => {
		const planning = runTaskScenario({
			name: "x",
			description: "",
			steps: [{ intent: { type: "plan" } }],
			expectedStatus: "planning",
		}).snapshot;
		expect(() => transitionRuntimeTask(planning, step({ type: "start", turnId: "", generation: "" }))).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.MISSING_TURN_BINDING }),
		);
		// generation 是每次绑定的必备输入：start 不能只给 turnId 不给已获取的 Snapshot generation
		expect(() =>
			transitionRuntimeTask(planning, step({ type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: "" })),
		).toThrowError(expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.MISSING_TURN_BINDING }));
		const running = transitionRuntimeTask(
			planning,
			step({ type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: TASK_FIXTURE_IDS.generation }),
		);
		expect(running.snapshot.activeTurnId).toBe(TASK_FIXTURE_IDS.turn);
		expect(running.snapshot.activeGeneration).toBe(TASK_FIXTURE_IDS.generation);
	});

	it("keeps identity immutable across transitions; generation lives on turn_bound", () => {
		const identity = taskIdentityFixture();
		const { snapshot, events } = runTaskScenario({ ...TASK_SCENARIOS[0]!, identity });
		expect(snapshot.identity).toEqual(identity);
		// Task 身份只固定 taskId/rootSessionId；generation 按 task.turn_bound 逐次记录
		expect(snapshot.identity).not.toHaveProperty("generation");
		const bound = events.filter((e) => e.type === "task.turn_bound");
		expect(bound).toHaveLength(1);
		if (bound[0]?.type !== "task.turn_bound") throw new Error("unreachable");
		expect(bound[0].generation).toBe(TASK_FIXTURE_IDS.generation);
		expect(snapshot.activeGeneration).toBe(TASK_FIXTURE_IDS.generation);
	});

	it("tracks pending approvals through request and resolution", () => {
		const { snapshot } = runTaskScenario(TASK_SCENARIOS[1]!); // approved
		expect(snapshot.pendingApprovalIds).toEqual([]);
		expect(snapshot.status).toBe("completed");
		// resolving an approval that was never requested is a stable error
		expect(() =>
			transitionRuntimeTask(
				taskSnapshotFixture({ status: "awaiting_approval", pendingApprovalIds: ["other"] }),
				step({
					type: "approval_resolved",
					approvalId: TASK_FIXTURE_IDS.approval,
					decision: "approve",
					turnId: TASK_FIXTURE_IDS.turn,
				}),
			),
		).toThrowError(expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.UNKNOWN_APPROVAL }));
		// approving without a Turn binding is rejected — resume must name the Turn
		const awaiting = runTaskScenario({
			name: "x",
			description: "",
			steps: [
				{ intent: { type: "plan" } },
				{ intent: { type: "request_approval", approvalId: TASK_FIXTURE_IDS.approval } },
			],
			expectedStatus: "awaiting_approval",
		}).snapshot;
		expect(() =>
			transitionRuntimeTask(
				awaiting,
				step({ type: "approval_resolved", approvalId: TASK_FIXTURE_IDS.approval, decision: "approve" }),
			),
		).toThrowError(expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.MISSING_TURN_BINDING }));
	});

	it("rejects duplicate artifact attachment but allows it on active tasks", () => {
		const attached = runTaskScenario({
			name: "x",
			description: "",
			steps: [
				{ intent: { type: "plan" } },
				{ intent: { type: "attach_artifact", artifactId: TASK_FIXTURE_IDS.artifact } },
			],
			expectedStatus: "planning",
		}).snapshot;
		expect(attached.artifactIds).toEqual([TASK_FIXTURE_IDS.artifact]);
		expect(() =>
			transitionRuntimeTask(attached, step({ type: "attach_artifact", artifactId: TASK_FIXTURE_IDS.artifact })),
		).toThrowError(expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.DUPLICATE_ARTIFACT }));
		// terminal tasks cannot attach
		const completed = runTaskScenario(TASK_SCENARIOS[0]!).snapshot;
		expect(() => transitionRuntimeTask(completed, step({ type: "attach_artifact", artifactId: "a2" }))).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION }),
		);
	});
});

describe("task restart recovery", () => {
	it("rebuilds an identical snapshot from the committed event log", () => {
		for (const scenario of TASK_SCENARIOS) {
			const { snapshot, events } = runTaskScenario(scenario);
			expect(rebuildRuntimeTaskSnapshot(events)).toEqual(snapshot);
		}
	});

	it("preserves pending approvals across a simulated restart", () => {
		// stop mid-approval: task is awaiting_approval with a pending id
		const partial = runTaskScenario({
			name: "x",
			description: "",
			steps: [
				{ intent: { type: "plan" } },
				{ intent: { type: "request_approval", approvalId: TASK_FIXTURE_IDS.approval } },
			],
			expectedStatus: "awaiting_approval",
		});
		const restored = rebuildRuntimeTaskSnapshot(partial.events);
		expect(restored.status).toBe("awaiting_approval");
		expect(restored.pendingApprovalIds).toEqual([TASK_FIXTURE_IDS.approval]);
		// and the restored task can still resolve the approval, resuming the approved Turn
		const resolved = transitionRuntimeTask(
			restored,
			step({
				type: "approval_resolved",
				approvalId: TASK_FIXTURE_IDS.approval,
				decision: "approve",
				turnId: TASK_FIXTURE_IDS.turn,
				generation: TASK_FIXTURE_IDS.generation,
			}),
		);
		expect(resolved.snapshot.status).toBe("running");
		expect(resolved.snapshot.activeTurnId).toBe(TASK_FIXTURE_IDS.turn);
		expect(resolved.snapshot.activeGeneration).toBe(TASK_FIXTURE_IDS.generation);
	});

	it("rejects corrupt or foreign event logs with a stable error", () => {
		expect(() => rebuildRuntimeTaskSnapshot([])).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
		const { events } = runTaskScenario(TASK_SCENARIOS[0]!);
		const foreign = events.map((e) => ({ ...e, taskId: "other-task" }));
		expect(() => rebuildRuntimeTaskSnapshot(foreign)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
		const dupCreated = [...events, events[0]!];
		expect(() => rebuildRuntimeTaskSnapshot(dupCreated)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
	});

	it("fails closed on status_changed.from mismatch — never silently adopts `to`", () => {
		const { events } = runTaskScenario(TASK_SCENARIOS[0]!);
		// 伪造一条 from 与当前快照不符的 status_changed（planning 实为 draft→planning 后的合法 from，
		// 但这里紧跟 created，当前状态是 draft，from:"planning" 与快照不符）。
		const corrupted = [
			events[0]!,
			{
				schemaVersion: 1 as const,
				taskId: TASK_FIXTURE_IDS.task,
				eventId: "evt-bad-from",
				at: 1_500,
				type: "task.status_changed" as const,
				from: "planning" as const,
				to: "running" as const,
			},
		];
		expect(() => rebuildRuntimeTaskSnapshot(corrupted)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
	});

	it("fails closed on transitions the state machine cannot reach", () => {
		const { events } = runTaskScenario(TASK_SCENARIOS[0]!);
		const corrupted = [
			events[0]!,
			{
				schemaVersion: 1 as const,
				taskId: TASK_FIXTURE_IDS.task,
				eventId: "evt-unreachable",
				at: 1_500,
				type: "task.status_changed" as const,
				from: "draft" as const,
				to: "completed" as const, // draft 不可直达 completed
			},
		];
		expect(() => rebuildRuntimeTaskSnapshot(corrupted)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
	});

	it("fails closed on duplicate eventIds and out-of-order timestamps", () => {
		const { events } = runTaskScenario(TASK_SCENARIOS[0]!);
		const dupId = [events[0]!, events[1]!, { ...events[1]!, at: events[1]!.at + 1 }];
		expect(() => rebuildRuntimeTaskSnapshot(dupId)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
		const reordered = [events[0]!, events[2]!, { ...events[1]!, eventId: "evt-late" }];
		expect(() => rebuildRuntimeTaskSnapshot(reordered)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
	});

	it("fails closed on duplicate artifacts, approvals and non-pending resolutions", () => {
		const attached = runTaskScenario({
			name: "x",
			description: "",
			steps: [
				{ intent: { type: "plan" } },
				{ intent: { type: "attach_artifact", artifactId: TASK_FIXTURE_IDS.artifact } },
			],
			expectedStatus: "planning",
		});
		const dupArtifact = [...attached.events, attached.events.at(-1)!];
		expect(() => rebuildRuntimeTaskSnapshot(dupArtifact)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);

		const pending = runTaskScenario({
			name: "x",
			description: "",
			steps: [
				{ intent: { type: "plan" } },
				{ intent: { type: "request_approval", approvalId: TASK_FIXTURE_IDS.approval } },
			],
			expectedStatus: "awaiting_approval",
		});
		const requested = pending.events.find((e) => e.type === "task.approval_requested")!;
		const dupApproval = [...pending.events, { ...requested, eventId: "evt-dup", at: 1_900 }];
		expect(() => rebuildRuntimeTaskSnapshot(dupApproval)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
		const strayResolve = [
			...pending.events,
			{
				schemaVersion: 1 as const,
				taskId: TASK_FIXTURE_IDS.task,
				eventId: "evt-stray",
				at: 1_901,
				type: "task.approval_resolved" as const,
				approvalId: "approval-never-requested",
				decision: "approve" as const,
			},
		];
		expect(() => rebuildRuntimeTaskSnapshot(strayResolve)).toThrowError(
			expect.objectContaining({ code: RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID }),
		);
	});

	it("survives JSON serialization round-trip of events", () => {
		const { snapshot, events } = runTaskScenario(TASK_SCENARIOS[1]!);
		const revived = (JSON.parse(JSON.stringify(events)) as unknown[]).map((e) => readRuntimeTaskEvent(e));
		expect(revived.every((e) => e !== undefined)).toBe(true);
		expect(rebuildRuntimeTaskSnapshot(revived as never)).toEqual(snapshot);
	});
});

describe("permission grants", () => {
	const now = 1_300;

	it("active grants allow listed capabilities", () => {
		const grant = PERMISSION_GRANT_FIXTURES.active();
		expect(isPermissionGrantActive(grant, now)).toBe(true);
		expect(permissionGrantAllows(grant, "tool.write", now)).toBe(true);
		expect(permissionGrantAllows(grant, "tool.unknown", now)).toBe(false);
	});

	it("revoked and expired grants deny everything, deterministically", () => {
		expect(isPermissionGrantActive(PERMISSION_GRANT_FIXTURES.revoked(), now)).toBe(false);
		expect(permissionGrantAllows(PERMISSION_GRANT_FIXTURES.revoked(), "tool.write", now)).toBe(false);
		expect(isPermissionGrantActive(PERMISSION_GRANT_FIXTURES.expired(), now)).toBe(false);
		// expiry is boundary-exclusive: expiresAt <= now is inactive
		const boundary = permissionGrantFixture({ expiresAt: now });
		expect(isPermissionGrantActive(boundary, now)).toBe(false);
		const stillValid = permissionGrantFixture({ expiresAt: now + 1 });
		expect(isPermissionGrantActive(stillValid, now)).toBe(true);
	});

	it("explicit deny wins over an allow-listed capability", () => {
		const grant = PERMISSION_GRANT_FIXTURES.deniedCapability();
		expect(permissionGrantAllows(grant, "tool.write", now)).toBe(true);
		expect(permissionGrantAllows(grant, "tool.shell", now)).toBe(false);
	});

	it("project trust stays scoped and cannot masquerade as session trust", () => {
		const project = PERMISSION_GRANT_FIXTURES.project();
		expect(project.scope).toBe("project");
		expect(project.projectRoot).toBe("/project");
		// narrowing rejects the cross-scope shapes outright
		expect(readPermissionGrant({ ...project, projectRoot: undefined })).toBeUndefined();
		expect(readPermissionGrant({ ...PERMISSION_GRANT_FIXTURES.active(), projectRoot: "/project" })).toBeUndefined();
	});
});

describe("artifact availability", () => {
	it("ready when content exists or no uri is bound (bundle)", () => {
		expect(resolveArtifactAvailability(ARTIFACT_FIXTURES.document(), () => true).status).toBe(
			ARTIFACT_AVAILABILITY.READY,
		);
		expect(resolveArtifactAvailability(ARTIFACT_FIXTURES.bundle(), () => false).status).toBe(
			ARTIFACT_AVAILABILITY.READY,
		);
	});

	it("reports missing stably when the backing content is gone", () => {
		const result = resolveArtifactAvailability(ARTIFACT_FIXTURES.missingContent(), () => false);
		expect(result.status).toBe(ARTIFACT_AVAILABILITY.MISSING);
		// the descriptor itself survives — it is a projection, not the truth source
		expect(result.descriptor.artifactId).toBe("artifact-fixture-missing");
	});
});

describe("boundary narrowing", () => {
	it("round-trips fixtures through JSON and narrows them back", () => {
		const grant = permissionGrantFixture();
		expect(readPermissionGrant(JSON.parse(JSON.stringify(grant)))).toEqual(grant);
		const artifact = artifactDescriptorFixture();
		expect(readArtifactDescriptor(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact);
		const approval = approvalRequestFixture();
		expect(readApprovalRequest(JSON.parse(JSON.stringify(approval)))).toEqual(approval);
		const snapshot = taskSnapshotFixture();
		expect(readRuntimeTaskSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
		const risk = toolRiskDescriptorFixture("L4");
		expect(readToolRiskDescriptor(JSON.parse(JSON.stringify(risk)))).toEqual(risk);
	});

	it("rejects unknown or missing schemaVersion — never normalizes future versions to v1", () => {
		const snapshot = taskSnapshotFixture();
		expect(readRuntimeTaskSnapshot({ ...snapshot, schemaVersion: 99 })).toBeUndefined();
		expect(readRuntimeTaskSnapshot({ ...snapshot, schemaVersion: undefined })).toBeUndefined();
		expect(readRuntimeTaskSnapshot({ ...snapshot, schemaVersion: "1" })).toBeUndefined();

		const event = runTaskScenario(TASK_SCENARIOS[0]!).events[1]!;
		expect(readRuntimeTaskEvent({ ...event, schemaVersion: 99 })).toBeUndefined();
		expect(readRuntimeTaskEvent({ ...event, schemaVersion: undefined })).toBeUndefined();

		const artifact = artifactDescriptorFixture();
		expect(readArtifactDescriptor({ ...artifact, schemaVersion: 99 })).toBeUndefined();
		const grant = permissionGrantFixture();
		expect(readPermissionGrant({ ...grant, schemaVersion: 99 })).toBeUndefined();
		const approval = approvalRequestFixture();
		expect(readApprovalRequest({ ...approval, schemaVersion: 99 })).toBeUndefined();
	});

	it("rejects malformed records instead of throwing", () => {
		expect(readRuntimeTaskSnapshot({ status: "running" })).toBeUndefined();
		expect(readRuntimeTaskSnapshot({ ...taskSnapshotFixture(), status: "bogus" })).toBeUndefined();
		expect(readArtifactDescriptor({ ...artifactDescriptorFixture(), kind: "bogus" })).toBeUndefined();
		expect(readPermissionGrant({ ...permissionGrantFixture(), capabilities: "all" })).toBeUndefined();
		expect(readApprovalRequest({ ...approvalRequestFixture(), risk: { defaultLevel: "L9" } })).toBeUndefined();
		expect(readRuntimeTaskEvent({ type: "task.unknown" })).toBeUndefined();
		expect(readRuntimeTaskEvent(null)).toBeUndefined();
	});

	it("drops unknown fields rather than persisting them", () => {
		const grant = { ...permissionGrantFixture(), uiHint: { color: "red" } };
		expect(readPermissionGrant(grant)).toEqual(permissionGrantFixture());
	});
});

describe("contract invariants", () => {
	it("snapshot carries facts only — no renderer/model payload fields", () => {
		// `content`/`details` separation is structural: Task snapshots and events
		// must not grow model-visible content or UI detail bags.
		const snapshot = taskSnapshotFixture();
		expect(Object.keys(snapshot).sort()).toEqual(
			[
				"artifactIds",
				"createdAt",
				"identity",
				"pendingApprovalIds",
				"schemaVersion",
				"status",
				"title",
				"updatedAt",
			].sort(),
		);
		expect("content" in snapshot).toBe(false);
		expect("details" in snapshot).toBe(false);
	});

	it("approval request is Runtime-owned state with expiry support", () => {
		const request = approvalRequestFixture({ expiresAt: 2_000 });
		expect(request.taskId).toBe(TASK_FIXTURE_IDS.task);
		expect(request.sessionId).toBe(TASK_FIXTURE_IDS.session);
		expect(request.turnId).toBe(TASK_FIXTURE_IDS.turn);
		expect(request.risk.defaultLevel).toBe("L3");
	});
});
