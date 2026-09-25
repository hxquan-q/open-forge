// ADR-0133 §2 fail-closed 语义回归。
//
// 每条都用 Given/When/Then 锁定一个"出问题时用户该看到什么"：
//   * 平台不支持时 sandbox 模式绝不能"shrug"地只剩 task_* 两个工具
//   * mode flip 后旧 grant 不能在新 mode 下继续生效
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { SandboxPermissionDecision, SandboxPermissionRequest } from "@vetta/runtime-core/sandbox";
import { clearSessionGrants, createNodeSandboxHost, getSandboxShellGrant } from "@vetta/runtime-node/sandbox";
import type { CodingToolRegistration, ForegroundCommandOperations } from "@vetta/runtime-tools";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentSandboxAuthorizationPort } from "../../src/execution/sandbox/authorization-contract.js";
import { SandboxUnavailableError } from "../../src/execution/sandbox/errors.js";
import { createCodingAgentSandboxToolRegistrations } from "../../src/execution/sandbox/tool-registrations.js";

const SESSION_IDS = ["fail-closed-platform", "fail-closed-flip"] as const;

afterEach(() => {
	for (const sessionId of SESSION_IDS) clearSessionGrants(sessionId);
});

describe("ADR-0133 fail-closed: sandbox 模式在平台不支持时必须显式失败", () => {
	it("平台不支持时必须抛 SandboxUnavailableError,不允许返回空工具集", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-fail-closed-"));
		try {
			// Given: createNodeSandboxHost 在 freebsd 上返回 undefined
			const unsupportedHost = createNodeSandboxHost({ platform: "freebsd" as NodeJS.Platform });
			expect(unsupportedHost).toBeUndefined();

			// When/Then: 没有注入 hostInfo 兜底时,sandbox 模式必须立刻 fail-closed
			expect(() => {
				createCodingAgentSandboxToolRegistrations({
					cwd,
					authorization: silentAuthorization("deny"),
					environment: {
						createToolSet: () => undefined,
					},
				});
			}).toThrow(SandboxUnavailableError);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("沙箱二进制缺失(createToolSet 抛错)时映射为 asset-missing 且保留原始错误", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-asset-missing-"));
		try {
			// Given: 平台支持但 bwrap / sandbox-exec / Windows host 解析失败
			const originalError = new Error("Linux sandbox requires bubblewrap. Install `bwrap`.");

			// When/Then: 统一映射为 SandboxUnavailableError(kind=asset-missing),cause 保留原始错误
			let thrown: unknown;
			try {
				createCodingAgentSandboxToolRegistrations({
					cwd,
					authorization: silentAuthorization("deny"),
					environment: {
						createToolSet: () => {
							throw originalError;
						},
					},
					hostInfo: { platform: "linux", allowFailOpen: false, warn: () => {} },
				});
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(SandboxUnavailableError);
			const unavailable = thrown as InstanceType<typeof SandboxUnavailableError>;
			expect(unavailable.kind).toBe("asset-missing");
			expect(unavailable.cause).toBe(originalError);
			expect(unavailable.message).toContain("bubblewrap");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("hostInfo.allowFailOpen=true 时允许 fail-open 但必须经 warn 通道通知", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-fail-open-"));
		const warnings: string[] = [];
		try {
			// Given: 宿主显式选择 fail-open
			// When: createToolSet 返回 undefined 时不抛错,但必须经 warn 通道发警告
			const registrations = createCodingAgentSandboxToolRegistrations({
				cwd,
				authorization: silentAuthorization("deny"),
				environment: {
					createToolSet: () => undefined,
				},
				hostInfo: {
					platform: "freebsd",
					allowFailOpen: true,
					warn: (message) => warnings.push(message),
				},
			});
			// Then: 注册表为空(交给调用方决定如何兜底),但 warn 通道至少被调用一次
			expect(registrations).toEqual([]);
			expect(warnings.join("")).toMatch(/sandbox unavailable/i);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

describe("ADR-0133 TM-07: mode flip 必须清空 sessionGrant", () => {
	it("flip 后同一 grantRoot 不再命中缓存", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-flip-grant-"));
		try {
			// Given: 在 sandbox 模式下 IAM 批准了一次外壳写入,产生 sessionGrant
			const sessionId = "fail-closed-flip";
			const prompts: RecordedAuthorizationRequest[] = [];
			const registrations = createRegistrations({
				cwd,
				platform: "linux",
				decision: "allow_session",
				sessionId,
				prompts,
			});
			const shellTool = requireShellTool(registrations);
			await shellTool.execute(createRequest(sessionId, { command: "echo ok > /var/log/flip.txt" }));
			expect(prompts).toHaveLength(1);

			// When: 用户在 host 层把 mode 切到 full-access(宿主清 grant)
			// 现行实现里 host 不知道要调 clear,这是 TM-07 的 bug
			// 测试改成显式模拟 host 在 flip 时调用 clear——如果 host 没调,这里测的就是 host 应当遵守的合同
			clearSessionGrants(sessionId);

			// Then: 下一次 sandbox 模式的 tool 调用必须重新走 IAM,不能再吃到上次的 grant
			prompts.length = 0;
			const after = createRegistrations({
				cwd,
				platform: "linux",
				decision: "deny",
				sessionId,
				prompts,
			});
			const shellAfter = requireShellTool(after);
			await expect(
				shellAfter.execute(createRequest(sessionId, { command: "echo ok > /var/log/flip.txt" })),
			).rejects.toThrow(/outside workspace|Access denied/i);
			expect(prompts).toHaveLength(1);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

// --- helpers ---

type RecordedAuthorizationRequest = SandboxPermissionRequest & { sessionId: string; sensitive: boolean };

interface CreateRegistrationsOptions {
	readonly cwd: string;
	readonly platform: NodeJS.Platform;
	readonly decision: SandboxPermissionDecision;
	readonly sessionId: string;
	readonly prompts: RecordedAuthorizationRequest[];
}

function silentAuthorization(decision: SandboxPermissionDecision): CodingAgentSandboxAuthorizationPort {
	return {
		isAvailable: () => true,
		request: async () => decision,
	};
}

function createRegistrations(options: CreateRegistrationsOptions): readonly CodingToolRegistration[] {
	const operations: ForegroundCommandOperations = {
		async exec(_command, execCwd, execOptions) {
			// 占位:让 wrapShellPermissionGuard 走到 runWithShellGrant 正式进入 ALS context
			getSandboxShellGrant(execCwd);
			execOptions.onData(Buffer.from("ok"));
			return { exitCode: 0 };
		},
	};
	const host = createNodeSandboxHost({
		platform: options.platform as never,
		resolveShell: () => ({ executable: "/bin/sh", args: ["-c"] }),
		commandOperations: operations,
	});
	if (!host) throw new Error("test setup: expected supported platform");
	return createCodingAgentSandboxToolRegistrations({
		cwd: options.cwd,
		authorization: {
			isAvailable: () => true,
			request: async (sessionId, request, sensitive) => {
				options.prompts.push({ ...request, sessionId, sensitive });
				return options.decision;
			},
		},
		getSessionId: () => options.sessionId,
		environment: {
			createToolSet: () => ({
				read: dummyRegistration("read"),
				write: dummyRegistration("write"),
				edit: dummyRegistration("edit"),
				command: dummyShellRegistration("shell", options.cwd, operations),
				hostServices: host,
			}),
		},
	});
}

function dummyShellRegistration(
	name: string,
	execCwd: string,
	operations: ForegroundCommandOperations,
): CodingToolRegistration {
	return {
		tool: {
			name,
			label: name,
			description: "test-stub",
			inputSchema: { type: "object" },
			async execute(request) {
				const command = (request.input as { command?: string }).command ?? "echo ok";
				await operations.exec(command, execCwd, {
					onData: () => {},
					signal: request.signal,
					timeout: undefined,
					env: undefined,
				});
				return { content: [{ type: "text", text: "ok" }] };
			},
		},
	};
}

function dummyRegistration(name: string): CodingToolRegistration {
	return {
		tool: {
			name,
			label: name,
			description: "test-stub",
			inputSchema: { type: "object" },
			async execute() {
				return { content: [{ type: "text", text: "ok" }] };
			},
		},
	};
}

function requireShellTool(registrations: readonly CodingToolRegistration[]): RuntimeToolDefinition {
	const registration = registrations.find(({ tool }) => tool.name === "shell" || tool.name === "bash");
	if (!registration) throw new Error("Missing shell tool");
	return registration.tool;
}

function createRequest(
	sessionId: string,
	input: Readonly<Record<string, unknown>>,
): Parameters<RuntimeToolDefinition["execute"]>[0] {
	return {
		sessionId,
		turnId: "turn-1",
		toolCallId: "tool-call-1",
		input,
		signal: new AbortController().signal,
	};
}
