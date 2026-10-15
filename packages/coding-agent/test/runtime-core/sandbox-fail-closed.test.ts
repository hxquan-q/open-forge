// ADR-0133 §2 fail-closed 语义回归。
//
// 每条都用 Given/When/Then 锁定一个"出问题时用户该看到什么":
//   * 平台不支持时 sandbox 模式绝不能"shrug"地只剩 task_* 两个工具
//   * 修复指引必须随 error.message 可见,宿主不依赖按类型分流也能给用户下一步
//   * TM-07(mode flip 清 grant)的行为合同由 session-execution-runtime.test.ts 经
//     controller.reconfigure + 真实 grant store 锁定,此处不重复。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxPermissionDecision } from "@vetta/runtime-core/sandbox";
import { clearSessionGrants, createNodeSandboxHost } from "@vetta/runtime-node/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentSandboxAuthorizationPort } from "../../src/execution/sandbox/authorization-contract.js";
import { SandboxUnavailableError } from "../../src/execution/sandbox/errors.js";
import { createCodingAgentSandboxToolRegistrations } from "../../src/execution/sandbox/tool-registrations.js";

const SESSION_IDS = ["fail-closed-platform"] as const;

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
			// 原始报错与修复指引都必须出现在 message 里:宿主只展示 error.message,
			// 用户也要能因此看到「装 bwrap / 配 VETTA_WINDOWS_SANDBOX_HOST_PATH」的下一步。
			expect(unavailable.message).toContain("bubblewrap");
			expect(unavailable.message).toContain("Install bwrap");
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

// --- helpers ---

function silentAuthorization(decision: SandboxPermissionDecision): CodingAgentSandboxAuthorizationPort {
	return {
		isAvailable: () => true,
		request: async () => decision,
	};
}
