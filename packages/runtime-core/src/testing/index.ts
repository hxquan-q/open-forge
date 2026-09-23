// Copyright The Open Forge contributors.
/**
 * Deterministic contract fixtures for runtime-core consumers. Kept behind an
 * explicit `./testing` entry (mirroring `@vetta/ai/testing`) so production
 * bundles never pick up fixture factories.
 */
export {
	ARTIFACT_FIXTURES,
	approvalRequestFixture,
	artifactDescriptorFixture,
	PERMISSION_GRANT_FIXTURES,
	permissionGrantFixture,
	runTaskScenario,
	TASK_FIXTURE_IDS,
	TASK_SCENARIO_APPROVED,
	TASK_SCENARIO_CANCELLED_FROM_PAUSE,
	TASK_SCENARIO_CHANGES_REQUESTED,
	TASK_SCENARIO_COMPLETED,
	TASK_SCENARIO_DENIED,
	TASK_SCENARIO_FAILED,
	TASK_SCENARIOS,
	type TaskScenario,
	type TaskScenarioStep,
	taskIdentityFixture,
	taskSnapshotFixture,
	toolRiskDescriptorFixture,
} from "../task/fixtures.js";
