import { describe, expect, it } from "vitest";
import { validateMcpConfig } from "./mcp-config-validation";

describe("validateMcpConfig managed runtime environment", () => {
	it("accepts string overrides only for a managed HTTP runtime", () => {
		expect(
			validateMcpConfig({
				mcpServers: {
					xiaohongshu: {
						type: "http",
						url: "http://127.0.0.1/mcp",
						managedRuntimeId: "xiaohongshu-runtime",
						managedRuntimeEnv: { XHS_PROXY: "http://127.0.0.1:7890" },
					},
				},
			}),
		).toMatchObject({
			mcpServers: {
				xiaohongshu: { managedRuntimeEnv: { XHS_PROXY: "http://127.0.0.1:7890" } },
			},
		});
	});

	it("rejects runtime environment overrides on an ordinary remote HTTP server", () => {
		expect(() =>
			validateMcpConfig({
				mcpServers: {
					remote: {
						type: "http",
						url: "https://example.com/mcp",
						managedRuntimeEnv: { TOKEN: "secret" },
					},
				},
			}),
		).toThrow(/managedRuntimeEnv/);
	});
});

describe("validateMcpConfig idleTimeout", () => {
	it("accepts a non-negative integer on stdio servers, including 0", () => {
		for (const idleTimeout of [0, 60000]) {
			expect(
				validateMcpConfig({ mcpServers: { local: { command: "node", idleTimeout } } }).mcpServers.local,
			).toMatchObject({ idleTimeout });
		}
	});

	it("rejects negative or fractional idleTimeout", () => {
		for (const idleTimeout of [-1, 1.5, "60000"]) {
			expect(() => validateMcpConfig({ mcpServers: { local: { command: "node", idleTimeout } } })).toThrow(
				/idleTimeout/,
			);
		}
	});

	it("rejects idleTimeout on http servers", () => {
		expect(() =>
			validateMcpConfig({
				mcpServers: { remote: { type: "http", url: "https://example.com/mcp", idleTimeout: 1000 } },
			}),
		).toThrow(/idleTimeout/);
	});
});

describe("validateMcpConfig resourceScope", () => {
	it("accepts the two ownership scopes and rejects anything else", () => {
		for (const resourceScope of ["application", "workspace"] as const) {
			expect(
				validateMcpConfig({ mcpServers: { local: { command: "node", resourceScope } } }).mcpServers.local,
			).toMatchObject({ resourceScope });
		}
		expect(() => validateMcpConfig({ mcpServers: { local: { command: "node", resourceScope: "global" } } })).toThrow(
			/resourceScope/,
		);
	});
});

describe("validateMcpConfig postConnectToolCalls", () => {
	const calls = [
		{
			tool: "connect_database",
			args: {
				type: "{env:DB_TYPE}",
				port: "{env:DB_PORT:number}",
				password: "{env:DB_PASSWORD}",
			},
		},
	];

	it("接受 stdio server 上的 { tool, args? } 声明（模板 token 原样透传）", () => {
		const parsed = validateMcpConfig({
			mcpServers: { "universal-db": { command: "npx", args: ["-y", "pkg"], postConnectToolCalls: calls } },
		});
		expect(parsed.mcpServers["universal-db"]).toMatchObject({ postConnectToolCalls: calls });
	});

	it("拒绝畸形 spec，且不允许出现在 http server 上", () => {
		for (const postConnectToolCalls of [
			"connect_database",
			[{ tool: "" }],
			[{ args: {} }],
			[{ tool: "x", args: { port: 3306 } }],
		]) {
			expect(() => validateMcpConfig({ mcpServers: { local: { command: "node", postConnectToolCalls } } })).toThrow(
				/postConnectToolCalls/,
			);
		}
		expect(() =>
			validateMcpConfig({
				mcpServers: { remote: { type: "http", url: "https://example.com/mcp", postConnectToolCalls: calls } },
			}),
		).toThrow(/postConnectToolCalls/);
	});
});
