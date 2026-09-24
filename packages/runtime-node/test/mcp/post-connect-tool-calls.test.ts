import type { McpClientHandle } from "@vetta/runtime-mcp/client";
import type {
	McpInitializeParams,
	McpInitializeResult,
	McpJsonObject,
	McpStdioServerConfig,
	McpTool,
	McpToolCallResult,
	McpToolsListResult,
} from "@vetta/runtime-mcp/protocol";
import { describe, expect, it } from "vitest";
import { resolvePostConnectArgs, withPostConnectToolCalls } from "../../src/mcp/client/post-connect-tool-calls.js";

const SECRET_PASSWORD = "s3cret-pw-9x2";

const CONNECT_DATABASE_TOOL: McpTool = {
	name: "connect_database",
	inputSchema: {
		type: "object",
		properties: {
			type: { type: "string" },
			host: { type: "string" },
			port: { type: "number" },
			user: { type: "string" },
			password: { type: "string" },
			database: { type: "string" },
			filePath: { type: "string" },
		},
		required: ["type"],
	},
};

class FakeClient implements McpClientHandle {
	readonly calls: Array<{ method: string; name?: string; args?: unknown }> = [];
	tools: McpTool[] = [CONNECT_DATABASE_TOOL, { name: "query", inputSchema: { type: "object" } }];

	getName(): string {
		return "universal-db";
	}
	getPid(): number | undefined {
		return undefined;
	}
	isClientInitialized(): boolean {
		return true;
	}
	async initialize(_params: McpInitializeParams): Promise<McpInitializeResult> {
		this.calls.push({ method: "initialize" });
		return { protocolVersion: "2025-11-25", serverInfo: { name: "fake", version: "1" } };
	}
	async listTools(): Promise<McpToolsListResult> {
		this.calls.push({ method: "listTools" });
		return { tools: this.tools };
	}
	async callTool(name: string, args?: McpJsonObject): Promise<McpToolCallResult> {
		this.calls.push({ method: "callTool", name, args });
		return { content: [] };
	}
	async listResources() {
		return { resources: [] };
	}
	async readResource() {
		return { contents: [] };
	}
	async listPrompts() {
		return { prompts: [] };
	}
	async close(): Promise<void> {}
}

const INIT_PARAMS: McpInitializeParams = {
	protocolVersion: "2025-11-25",
	clientInfo: { name: "vetta-test", version: "1" },
};

function dbConfig(overrides?: Partial<McpStdioServerConfig>): McpStdioServerConfig {
	return {
		command: "npx",
		args: ["-y", "universal-db-mcp@2.14.0"],
		env: {
			DB_TYPE: "mysql",
			DB_HOST: "db.internal",
			DB_PORT: "3306",
			DB_USER: "readonly",
			DB_PASSWORD: SECRET_PASSWORD,
			DB_DATABASE: "appdb",
		},
		postConnectToolCalls: [
			{
				tool: "connect_database",
				args: {
					type: "{env:DB_TYPE}",
					host: "{env:DB_HOST}",
					port: "{env:DB_PORT:number}",
					user: "{env:DB_USER}",
					password: "{env:DB_PASSWORD}",
					database: "{env:DB_DATABASE}",
					filePath: "{env:DB_FILE_PATH}",
				},
			},
		],
		...overrides,
	};
}

describe("withPostConnectToolCalls", () => {
	it("initialize 成功后、任何后续调用前自发执行 bootstrap，参数为 env resolve 值", async () => {
		const inner = new FakeClient();
		const client = withPostConnectToolCalls(inner, "universal-db", dbConfig());
		await client.initialize(INIT_PARAMS);

		expect(inner.calls.map((c) => c.method)).toEqual(["initialize", "listTools", "callTool"]);
		const bootstrap = inner.calls[2];
		expect(bootstrap.name).toBe("connect_database");
		expect(bootstrap.args).toEqual({
			type: "mysql",
			host: "db.internal",
			port: 3306,
			user: "readonly",
			password: SECRET_PASSWORD,
			database: "appdb",
		});

		// bootstrap 完成后普通 agent 调用照常放行
		await client.callTool("query", { sql: "select 1" });
		expect(inner.calls.at(-1)).toEqual({ method: "callTool", name: "query", args: { sql: "select 1" } });
	});

	it("env 缺失的 key 整体从 arguments 剔除（sqlite 子集场景）", async () => {
		const inner = new FakeClient();
		const config = dbConfig({
			env: { DB_TYPE: "sqlite", DB_FILE_PATH: "/data/app.db" },
		});
		await withPostConnectToolCalls(inner, "universal-db", config).initialize(INIT_PARAMS);

		expect(inner.calls.at(-1)?.args).toEqual({ type: "sqlite", filePath: "/data/app.db" });
	});

	it("每次 initialize 都重新执行 bootstrap（覆盖 lazy handle 重连语义）", async () => {
		const inner = new FakeClient();
		const client = withPostConnectToolCalls(inner, "universal-db", dbConfig());
		await client.initialize(INIT_PARAMS);
		await client.initialize(INIT_PARAMS);

		const bootstraps = inner.calls.filter((c) => c.name === "connect_database");
		expect(bootstraps).toHaveLength(2);
	});

	it("required 参数缺失时报错且不发出 callTool", async () => {
		const inner = new FakeClient();
		const config = dbConfig({
			env: { DB_HOST: "db.internal" },
		});
		await expect(withPostConnectToolCalls(inner, "universal-db", config).initialize(INIT_PARAMS)).rejects.toThrow(
			/requires parameter 'type'/,
		);
		expect(inner.calls.filter((c) => c.method === "callTool")).toHaveLength(0);
	});

	it("spec 参数不在上游 inputSchema 中报不兼容且不发出 callTool", async () => {
		const inner = new FakeClient();
		const config = dbConfig({
			postConnectToolCalls: [{ tool: "connect_database", args: { type: "mysql", typooooo: "x" } }],
		});
		await expect(withPostConnectToolCalls(inner, "universal-db", config).initialize(INIT_PARAMS)).rejects.toThrow(
			/incompatible/,
		);
		expect(inner.calls.filter((c) => c.method === "callTool")).toHaveLength(0);
	});

	it("目标 tool 未被上游 advertise 时报不兼容", async () => {
		const inner = new FakeClient();
		inner.tools = [{ name: "query", inputSchema: { type: "object" } }];
		await expect(withPostConnectToolCalls(inner, "universal-db", dbConfig()).initialize(INIT_PARAMS)).rejects.toThrow(
			/not advertised/,
		);
	});

	it("bootstrap 失败向上传播（视同连接失败），且透出信息不含凭据", async () => {
		const inner = new FakeClient();
		inner.callTool = async () => {
			throw new Error(`upstream: connect failed mysql://readonly:${SECRET_PASSWORD}@db.internal:3306/appdb`);
		};
		await expect(withPostConnectToolCalls(inner, "universal-db", dbConfig()).initialize(INIT_PARAMS)).rejects.toThrow(
			/connect failed/,
		);
		try {
			await withPostConnectToolCalls(inner, "universal-db", dbConfig()).initialize(INIT_PARAMS);
			expect.unreachable();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).not.toContain(SECRET_PASSWORD);
			expect(message).toContain("mysql://readonly:****@db.internal");
		}
	});

	it("诊断输出只含 server/tool/成败，绝不包含 resolved 凭据", async () => {
		const inner = new FakeClient();
		const diagnostics: string[] = [];
		await withPostConnectToolCalls(inner, "universal-db", dbConfig(), (m) => diagnostics.push(m)).initialize(
			INIT_PARAMS,
		);

		expect(diagnostics.length).toBeGreaterThan(0);
		for (const message of diagnostics) {
			expect(message).not.toContain(SECRET_PASSWORD);
			expect(message).not.toContain("readonly");
			expect(message).not.toContain("db.internal");
		}
	});

	it("未声明 postConnectToolCalls 或非 stdio 配置时原样返回 client", () => {
		const inner = new FakeClient();
		const stdio = dbConfig({ postConnectToolCalls: undefined });
		expect(withPostConnectToolCalls(inner, "universal-db", stdio)).toBe(inner);
		const http = { type: "http" as const, url: "http://localhost/mcp" };
		expect(withPostConnectToolCalls(inner, "universal-db", http)).toBe(inner);
	});
});

describe("resolvePostConnectArgs", () => {
	it("字面量原样透传，{env:KEY} 从 env 取值", () => {
		expect(
			resolvePostConnectArgs({ literal: "read-only", templated: "{env:DB_USER}" }, { DB_USER: "alice" }),
		).toEqual({ literal: "read-only", templated: "alice" });
	});

	it(":number 生效、非数值按缺失剔除", () => {
		expect(resolvePostConnectArgs({ port: "{env:P:number}" }, { P: "5432" })).toEqual({ port: 5432 });
		expect(resolvePostConnectArgs({ port: "{env:P:number}" }, { P: "not-a-port" })).toEqual({});
	});

	it(":boolean 生效、非布尔字面量按缺失剔除", () => {
		expect(resolvePostConnectArgs({ flag: "{env:F:boolean}" }, { F: "true" })).toEqual({ flag: true });
		expect(resolvePostConnectArgs({ flag: "{env:F:boolean}" }, { F: "FALSE" })).toEqual({ flag: false });
		expect(resolvePostConnectArgs({ flag: "{env:F:boolean}" }, { F: "yes" })).toEqual({});
	});

	it("env 缺失或为空串时整个 key 剔除，不置空串/undefined/null", () => {
		const resolved = resolvePostConnectArgs(
			{ a: "{env:MISSING}", empty: "{env:EMPTY}", blank: "{env:BLANK}", b: "x" },
			{ EMPTY: "", BLANK: "   " },
		);
		expect(resolved).toEqual({ b: "x" });
		expect("a" in resolved).toBe(false);
		expect("empty" in resolved).toBe(false);
	});
});
