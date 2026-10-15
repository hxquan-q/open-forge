// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";

/**
 * state.md 校验规则的可执行对照（ac-gate v1 的机器可判子集）。
 * 规范出处：agent/skills/ac-pipeline/SKILL.md §3 与 allstar-team-design.md §8.4。
 * 这里把「主控按提示词逐项核对」的规则固化为测试，保证规范本身自洽。
 */

type StepStatus = "not_started" | "in_progress" | "done" | "interrupted";
type SessionStatus = "not_applicable" | "active" | "suspended" | "closed";
type UserConfirmation = "unconfirmed" | "confirmed" | "skipped" | "not_required";

interface StateStep {
	seq: number;
	name: string;
	status: StepStatus;
	executor?: string;
	agentRef?: string | null;
	sessionStatus?: SessionStatus;
	artifacts?: string[];
	userConfirmation?: UserConfirmation;
	executions?: number;
	isSubStep?: boolean;
	subSteps?: StateStep[];
}

interface PipelineState {
	pipeline: string;
	round: number;
	branch: string;
	updatedAt: string;
	currentStep: number;
	steps: StateStep[];
}

const LEGAL_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
	not_started: ["in_progress"],
	in_progress: ["done", "interrupted"],
	interrupted: ["in_progress"],
	done: ["in_progress"], // 下游跳回时
};

export function validateTransition(from: StepStatus, to: StepStatus): boolean {
	return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function validateState(state: PipelineState): string[] {
	const issues: string[] = [];
	if (state.pipeline !== "allstar-coding") issues.push("pipeline must be allstar-coding");
	if (!Array.isArray(state.steps) || state.steps.length === 0) issues.push("steps must be a non-empty array");

	const allSteps: StateStep[] = [];
	const collect = (steps: StateStep[]): void => {
		for (const step of steps) {
			allSteps.push(step);
			if (step.subSteps?.length) collect(step.subSteps);
		}
	};
	collect(state.steps);

	for (const step of allSteps) {
		const label = `${step.isSubStep ? "subStep" : "step"} ${step.seq} (${step.name})`;
		if (step.userConfirmation === "unconfirmed" && step.status === "done") {
			issues.push(`${label}: done with unconfirmed user gate`);
		}
		if ((step.executions ?? 1) > 3) {
			issues.push(`${label}: executions ${step.executions} exceeds the 3-round cap (must escalate to user)`);
		}
		if (step.status === "done" && step.isSubStep && step.executor === "developer") {
			const session = step.sessionStatus ?? "not_applicable";
			if (!["suspended", "closed", "not_applicable"].includes(session)) {
				issues.push(`${label}: developer task done but session is ${session} (must be suspended or closed)`);
			}
			if (session !== "closed" && session !== "not_applicable" && !step.agentRef) {
				issues.push(`${label}: suspended developer session without agentRef`);
			}
		}
	}

	const current = allSteps.find((step) => step.seq === state.currentStep && !step.isSubStep);
	if (current && current.status !== "in_progress" && current.status !== "interrupted" && current.status !== "done") {
		issues.push(`currentStep ${state.currentStep} points at ${current.status}`);
	}
	return issues;
}

describe("state.md transition rules (ac-pipeline §3.3)", () => {
	it("allows exactly the documented transitions", () => {
		expect(validateTransition("not_started", "in_progress")).toBe(true);
		expect(validateTransition("in_progress", "done")).toBe(true);
		expect(validateTransition("in_progress", "interrupted")).toBe(true);
		expect(validateTransition("interrupted", "in_progress")).toBe(true);
		expect(validateTransition("done", "in_progress")).toBe(true); // 跳回
		expect(validateTransition("not_started", "done")).toBe(false);
		expect(validateTransition("done", "interrupted")).toBe(false);
		expect(validateTransition("not_started", "not_started")).toBe(false);
	});
});

describe("state.md integrity rules (ac-gate G2/G4)", () => {
	const baseState = (steps: StateStep[]): PipelineState => ({
		pipeline: "allstar-coding",
		round: 1,
		branch: "ac/2026-09-24-calculator",
		updatedAt: "2026-09-24T16:00:00+08:00",
		currentStep: 4,
		steps,
	});

	it("accepts the healthy example from the design doc", () => {
		const state = baseState([
			{
				seq: 1,
				name: "原型+需求文档生成确认",
				status: "done",
				executor: "requirements",
				artifacts: ["docs/ac/originModel.html", "docs/ac/requires.md"],
				userConfirmation: "confirmed",
				executions: 1,
				subSteps: [],
			},
			{
				seq: 4,
				name: "实际代码实现",
				status: "in_progress",
				executor: "developer",
				subSteps: [
					{
						seq: 1,
						name: "T1: dto 层实现",
						status: "done",
						executor: "developer",
						agentRef: "dev_t1",
						sessionStatus: "suspended",
						executions: 1,
						isSubStep: true,
						subSteps: [],
					},
				],
			},
		]);
		expect(validateState(state)).toEqual([]);
	});

	it("rejects done-at-an-unconfirmed gate", () => {
		const state = baseState([
			{
				seq: 1,
				name: "原型+需求文档生成确认",
				status: "done",
				executor: "requirements",
				userConfirmation: "unconfirmed",
				executions: 1,
				subSteps: [],
			},
		]);
		const issues = validateState(state);
		expect(issues.some((issue) => issue.includes("unconfirmed user gate"))).toBe(true);
	});

	it("rejects executions beyond the 3-round cap", () => {
		const state = baseState([
			{
				seq: 4,
				name: "实际代码实现",
				status: "in_progress",
				executor: "developer",
				executions: 4,
				subSteps: [],
			},
		]);
		expect(validateState(state).some((issue) => issue.includes("3-round cap"))).toBe(true);
	});

	it("rejects a developer task done while its session stays active", () => {
		const state = baseState([
			{
				seq: 4,
				name: "实际代码实现",
				status: "in_progress",
				executor: "developer",
				subSteps: [
					{
						seq: 1,
						name: "T1: dto 层实现",
						status: "done",
						executor: "developer",
						agentRef: "dev_t1",
						sessionStatus: "active",
						executions: 1,
						isSubStep: true,
						subSteps: [],
					},
				],
			},
		]);
		expect(validateState(state).some((issue) => issue.includes("session is active"))).toBe(true);
	});

	it("rejects a suspended developer session without an agentRef", () => {
		const state = baseState([
			{
				seq: 4,
				name: "实际代码实现",
				status: "in_progress",
				executor: "developer",
				subSteps: [
					{
						seq: 2,
						name: "T2: service 层实现",
						status: "done",
						executor: "developer",
						agentRef: null,
						sessionStatus: "suspended",
						executions: 1,
						isSubStep: true,
						subSteps: [],
					},
				],
			},
		]);
		expect(validateState(state).some((issue) => issue.includes("without agentRef"))).toBe(true);
	});
});
