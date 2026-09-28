import type { RuntimeResourceContext, RuntimeSessionObservationEvent } from "@vetta/runtime-core";
import type { AgentSession, ModelCallContributionContext, SessionContextRecord } from "@vetta/runtime-core/kernel";
import { createNodeSandboxCodingToolEnvironment, type ForegroundCommandOperations } from "@vetta/runtime-node/coding";
import { addSessionGrant, clearSessionGrants, findSessionGrant } from "@vetta/runtime-node/sandbox";
import type { CodingToolCatalogEntry } from "@vetta/runtime-tools";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentSandboxAuthorizationPort } from "../../src/execution/sandbox/authorization-contract.js";
import { SandboxUnavailableError } from "../../src/execution/sandbox/errors.js";
import { CodingAgentSessionExecutionRuntime } from "../../src/execution/session/runtime.js";
import { createCodingAgentNodeSessionExecutionEnvironment } from "../../src/host/tool-environment/node/node-session-execution-environment.js";

describe("CodingAgentSessionExecutionRuntime", () => {
	const commandToolName = process.platform === "win32" ? "shell" : "bash";

	afterEach(() => {
		clearSessionGrants("session-flip-grants");
	});

	it("switches execution mode per session and reports the real busy state", async () => {
		let state: AgentSession["state"] = "idle";
		const fixture = createRuntimeFixture("session-mode");
		const controller = fixture.runtime.createExecutionController({
			get state() {
				return state;
			},
		} as unknown as AgentSession);

		expect(fixture.runtime.readRegistrations().map(({ tool }) => tool.name)).toEqual(
			expect.arrayContaining([commandToolName, "read", "write", "edit", "task_output", "task_stop"]),
		);
		expect(controller.isBusy()).toBe(false);
		state = "running";
		expect(controller.isBusy()).toBe(true);
		state = "idle";

		await controller.reconfigure({
			mode: "sandbox",
			sessionId: "session-mode",
		});

		expect(fixture.runtime.readMode()).toBe("sandbox");
		expect(fixture.runtime.readRegistrations().map(({ tool }) => tool.name)).toEqual(
			expect.arrayContaining(["read", "write", "edit", "task_output", "task_stop"]),
		);

		await controller.reconfigure({
			mode: "full-access",
			sessionId: "session-mode",
		});
		expect(fixture.runtime.readRegistrations().map(({ tool }) => tool.name)).toEqual(
			expect.arrayContaining([commandToolName, "read", "write", "edit", "task_output", "task_stop"]),
		);
		await fixture.runtime.dispose();
		expect(fixture.environmentDisposeCalls).toBe(1);
	});

	it("ADR-0133 P0: 沙箱模式下环境给不出沙箱时,构造期必须显式失败而不是产出残缺工具集", () => {
		// Given:宿主声明无沙箱(如远程项目分支、无沙箱测试装置),会话却请求 sandbox 模式。
		// VETTA_SANDBOX_FAIL_OPEN 若被外部环境设置会把结果翻成 fail-open,先摘掉保证确定。
		const previousFailOpen = process.env.VETTA_SANDBOX_FAIL_OPEN;
		delete process.env.VETTA_SANDBOX_FAIL_OPEN;
		const environment = createCodingAgentNodeSessionExecutionEnvironment({
			sessionId: "session-fail-closed",
			cwd: process.cwd(),
			scenario: "cli",
		});
		try {
			// When:构造 session execution runtime(buildModeRegistrations 的 sandbox 分支)
			// Then:立刻抛 SandboxUnavailableError(kind=platform-unsupported)并携带修复指引,
			// 不允许继续以只剩 task_* 的死工具集把会话建出来。
			let thrown: unknown;
			try {
				new CodingAgentSessionExecutionRuntime({
					cwd: process.cwd(),
					sandboxAuthorization: DENY_SANDBOX_AUTHORIZATION,
					initialMode: "sandbox",
					environment: { ...environment, sandbox: { createToolSet: () => undefined } },
					activation: { mode: "explicit", toolNames: [] },
					readSessionId: () => "session-fail-closed",
					resourceContext: minimalResourceContext(),
				});
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(SandboxUnavailableError);
			const unavailable = thrown as InstanceType<typeof SandboxUnavailableError>;
			expect(unavailable.kind).toBe("platform-unsupported");
			expect(unavailable.message).toContain("Switch to full-access");
		} finally {
			if (previousFailOpen !== undefined) process.env.VETTA_SANDBOX_FAIL_OPEN = previousFailOpen;
			void environment.dispose();
		}
	});

	it("clears cached sandbox grants when the execution mode flips, but not on same-mode reconfigure", async () => {
		// ADR-0133 §5(TM-07):旧 mode 批准过的越界授权不得带入新 mode。
		const grantRequest = {
			capability: "file.write" as const,
			toolName: "write",
			target: "outside.txt",
			resolvedTarget: `${process.cwd()}-outside`,
			grantRoot: `${process.cwd()}-outside`,
			reason: "test",
		};
		const fixture = createRuntimeFixture("session-flip-grants");
		const controller = fixture.runtime.createExecutionController({ state: "idle" } as unknown as AgentSession);

		try {
			// Given:会话里已经缓存了一条 sandbox grant
			addSessionGrant("session-flip-grants", grantRequest);
			expect(findSessionGrant("session-flip-grants", grantRequest)).toBeDefined();

			// When:同 mode 重复 reconfigure(初始就是 full-access)
			await controller.reconfigure({ mode: "full-access", sessionId: "session-flip-grants" });
			// Then:mode 未变化,grant 保留
			expect(findSessionGrant("session-flip-grants", grantRequest)).toBeDefined();

			// When:切到 sandbox
			await controller.reconfigure({ mode: "sandbox", sessionId: "session-flip-grants" });
			// Then:grant 已被清空,下一次越界请求必须重新询问用户
			expect(findSessionGrant("session-flip-grants", grantRequest)).toBeUndefined();

			// When:再缓存一条并切回 full-access
			addSessionGrant("session-flip-grants", grantRequest);
			await controller.reconfigure({ mode: "full-access", sessionId: "session-flip-grants" });
			// Then:反向 flip 同样清空,不区分方向
			expect(findSessionGrant("session-flip-grants", grantRequest)).toBeUndefined();
		} finally {
			await fixture.runtime.dispose();
		}
	});

	it("preserves the product model order when sandbox replaces execution tools", async () => {
		const fixture = createRuntimeFixture("session-sandbox-order", (toolName) =>
			createSourceToolEntry(toolName, "active", "1", toolName === "read" ? 100 : undefined),
		);
		const controller = fixture.runtime.createExecutionController({ state: "idle" } as unknown as AgentSession);

		try {
			await controller.reconfigure({
				mode: "sandbox",
				sessionId: "session-sandbox-order",
			});

			const readRegistration = fixture.runtime.readRegistrations().find(({ tool }) => tool.name === "read");
			expect(readRegistration).toMatchObject({
				modelOrder: 100,
				tool: { modelOrder: 100 },
			});
		} finally {
			await fixture.runtime.dispose();
		}
	});

	it("applies shared registry removal to future frames without revoking an advertised Turn tool", async () => {
		const states = new Map<string, CodingToolCatalogEntry["state"]>();
		let commandRevision = "1";
		const fixture = createRuntimeFixture("session-dynamic", (toolName) =>
			createSourceToolEntry(
				toolName,
				states.get(toolName) ?? "active",
				toolName === commandToolName ? commandRevision : "1",
			),
		);
		const signal = new AbortController().signal;
		const prepared = await fixture.runtime.feature.prepare({ signal });
		const contribution = await prepared.contribute({ signal });
		const provider = contribution.modelCallProviders?.[0];
		if (!provider) throw new Error("Expected session execution model-call provider");

		try {
			const initialTools = (await provider.contribute(modelCallContext(signal))).tools ?? [];
			expect(initialTools.map(({ name }) => name)).toEqual(
				expect.arrayContaining([commandToolName, "task_output", "task_stop"]),
			);

			states.set(commandToolName, "deactivated");
			expect((await provider.contribute(modelCallContext(signal))).tools?.map(({ name }) => name)).not.toContain(
				commandToolName,
			);
			const advertisedCommand = initialTools.find(({ name }) => name === commandToolName);
			if (!advertisedCommand) throw new Error("Expected advertised command tool");
			await expect(
				advertisedCommand.execute({
					sessionId: "session-dynamic",
					turnId: "turn-dynamic",
					toolCallId: "tool-bash",
					input: { command: process.platform === "win32" ? "Write-Output stable" : "printf stable" },
					signal,
				}),
			).resolves.toMatchObject({ content: expect.any(Array) });

			states.set(commandToolName, "active");
			commandRevision = "2";
			expect(fixture.runtime.ownsTool(commandToolName)).toBe(false);
			expect((await provider.contribute(modelCallContext(signal))).tools?.map(({ name }) => name)).not.toContain(
				commandToolName,
			);
		} finally {
			await prepared.dispose();
			await fixture.runtime.dispose();
		}
	});

	it("isolates background tasks and publishes session observations plus model-visible notifications", async () => {
		const first = createRuntimeFixture("session-first");
		const second = createRuntimeFixture("session-second");
		const command = process.platform === "win32" ? "Write-Output done" : "true";

		try {
			const task = first.runtime.backgroundService.spawn({
				command,
				cwd: process.cwd(),
				env: { ...process.env },
			});

			expect(task.id).toBe("b1");
			expect(first.runtime.backgroundService.list()).toHaveLength(1);
			expect(second.runtime.backgroundService.list()).toEqual([]);

			const result = await first.runtime.backgroundService.wait(task.id, { maxMs: 5_000 });
			expect(result.stillRunning).toBe(false);
			expect(result.snapshot.status).toBe("completed");
			expect(
				first.observations.some(
					(event) =>
						event.type === "session.extension" &&
						event.extensionId === "coding-agent.background-work" &&
						event.event === "tasks.changed",
				),
			).toBe(true);
			expect(second.observations).toEqual([]);
			expect(first.records).toEqual([
				expect.objectContaining({
					type: "task-notification",
					modelVisible: true,
					display: true,
				}),
			]);
			expect(second.records).toEqual([]);
		} finally {
			await Promise.all([first.runtime.dispose(), second.runtime.dispose()]);
		}
	});
});

function createRuntimeFixture(
	sessionId: string,
	resolveToolEntry?: (toolName: string) => CodingToolCatalogEntry | undefined,
): {
	readonly runtime: CodingAgentSessionExecutionRuntime;
	readonly observations: RuntimeSessionObservationEvent[];
	readonly records: SessionContextRecord[];
	readonly asyncDeliveries: number;
	readonly environmentDisposeCalls: number;
} {
	const observations: RuntimeSessionObservationEvent[] = [];
	const records: SessionContextRecord[] = [];
	let asyncDeliveries = 0;
	let environmentDisposeCalls = 0;
	const environment = createCodingAgentNodeSessionExecutionEnvironment({
		sessionId: "session-execution-runtime-test",
		cwd: process.cwd(),
		scenario: "cli",
	});
	const sandboxCommandOperations: ForegroundCommandOperations = {
		async exec(_command, _cwd, options) {
			options.onData(Buffer.from("ok"));
			return { exitCode: 0 };
		},
	};
	const runtime = new CodingAgentSessionExecutionRuntime({
		cwd: process.cwd(),
		sandboxAuthorization: DENY_SANDBOX_AUTHORIZATION,
		environment: {
			...environment,
			sandbox: {
				createToolSet: () =>
					createNodeSandboxCodingToolEnvironment({
						cwd: process.cwd(),
						platform: "linux",
						commandOperations: sandboxCommandOperations,
						editPathPolicy: { getRejectionReason: () => undefined },
						writePathPolicy: { getRejectionReason: () => undefined },
					}),
				clearSessionGrants,
			},
			dispose: async () => {
				environmentDisposeCalls += 1;
				await environment.dispose();
			},
		},
		activation: {
			mode: "explicit",
			toolNames: ["bash", "shell", "read", "write", "edit", "task_output", "task_stop"],
		},
		readSessionId: () => sessionId,
		resolveToolEntry,
		resourceContext: {
			operation: "create",
			contextAppender: {
				append: (next) => {
					records.push(...next);
				},
			},
			async deliverAsyncContext(next) {
				asyncDeliveries += 1;
				records.push(...next);
			},
			abortCurrentRun() {},
			async reportObservation(observation) {
				observations.push(observation);
			},
		},
	});
	return {
		runtime,
		observations,
		records,
		get asyncDeliveries() {
			return asyncDeliveries;
		},
		get environmentDisposeCalls() {
			return environmentDisposeCalls;
		},
	};
}

const DENY_SANDBOX_AUTHORIZATION: CodingAgentSandboxAuthorizationPort = {
	isAvailable: () => false,
	request: async () => "deny",
};

/** 构造期测试只把 resourceContext 存进 options,不会触发任何调用;给最小可写实现。 */
function minimalResourceContext(): RuntimeResourceContext {
	return {
		operation: "create",
		contextAppender: { append: () => {} },
		async deliverAsyncContext() {},
		abortCurrentRun() {},
		async reportObservation() {},
	};
}

function createSourceToolEntry(
	toolName: string,
	state: CodingToolCatalogEntry["state"],
	revision: string,
	modelOrder?: number,
): CodingToolCatalogEntry {
	return {
		binding: {
			sourceId: "shared-tools",
			capabilityId: toolName,
			revision,
		},
		registration: {
			...(modelOrder !== undefined ? { modelOrder } : {}),
			tool: {
				name: toolName,
				label: toolName,
				description: toolName,
				...(modelOrder !== undefined ? { modelOrder } : {}),
				inputSchema: { type: "object" },
				execute: async () => ({ content: [] }),
			},
		},
		state,
	};
}

function modelCallContext(signal: AbortSignal): ModelCallContributionContext {
	return {
		sessionId: "session-dynamic",
		turnId: "turn-dynamic",
		signal,
	};
}
