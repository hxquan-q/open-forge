// Copyright The Open Forge contributors.
import type { DatasetProfile, DatasetProfileResult } from "@vetta/runtime-node/dataset";
import { describe, expect, it, vi } from "vitest";
import {
	CODING_AGENT_DATASET_PROFILE_TOOL_DESCRIPTION,
	createCodingAgentDatasetProfileToolRegistration,
} from "../../src/features/dataset/index.js";

function profile(partial: Partial<DatasetProfile> = {}): DatasetProfile {
	return {
		format: "csv",
		path: "/data/sales.csv",
		uri: "file:///data/sales.csv",
		sizeBytes: 2048,
		modifiedAtMs: 1_700_000_000_000,
		rowCount: 3,
		truncated: false,
		columns: [
			{ name: "amount", type: "number", emptyCells: 0, invalidCells: 1 },
			{ name: "name", type: "string", emptyCells: 0, invalidCells: 0 },
		],
		issues: [{ row: 2, reason: "invalid-value", column: "amount" }],
		issueCount: 1,
		missingColumns: [],
		...partial,
	};
}

function ok(partial: Partial<DatasetProfile> = {}): DatasetProfileResult {
	return { ok: true, profile: profile(partial) };
}

function executionContext<TInput extends object>(input: TInput) {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "call-1",
		input,
		signal: new AbortController().signal,
	};
}

describe("dataset_profile tool", () => {
	it("注册合同：名称、场景白名单、类别、描述指向稳定常量", () => {
		const operations = { profileDataset: vi.fn(async () => ok()) };
		const registration = createCodingAgentDatasetProfileToolRegistration({ operations, modelOrder: 1_960 });
		expect(registration.tool.name).toBe("dataset_profile");
		expect(registration.tool.description).toBe(CODING_AGENT_DATASET_PROFILE_TOOL_DESCRIPTION);
		expect(registration.scopeUse).toEqual(["conversation", "project", "cli"]);
		expect(registration.category).toBe("kb-read");
		expect(registration.modelOrder).toBe(1_960);
	});

	it("剖析结果转述：列类型/问题行/缺列逐项进入模型可见文本与 details", async () => {
		const operations = {
			profileDataset: vi.fn(async () => ok({ missingColumns: ["region"], truncated: true })),
		};
		const tool = createCodingAgentDatasetProfileToolRegistration({ operations }).tool;
		const result = await tool.execute(
			executionContext({ path: "/data/sales.csv", expectedColumns: ["amount", "region"] }),
		);
		expect(result.isError).toBeUndefined();
		expect(operations.profileDataset).toHaveBeenCalledWith("/data/sales.csv", {
			expectedColumns: ["amount", "region"],
			signal: expect.any(AbortSignal),
		});
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("csv");
		expect(text).toContain("amount: number");
		expect(text).toContain("1 invalid");
		expect(text).toContain("missing expected columns: region");
		expect(text).toContain("truncated");
		expect(text).toContain("file:///data/sales.csv");
		expect(result.details).toMatchObject({ profile: { rowCount: 3 } });
	});

	it("相对路径拒绝执行，不回落默认目录", async () => {
		const operations = { profileDataset: vi.fn(async () => ok()) };
		const tool = createCodingAgentDatasetProfileToolRegistration({ operations }).tool;
		const result = await tool.execute(executionContext({ path: "relative/file.csv" }));
		expect(result.isError).toBe(true);
		expect(operations.profileDataset).not.toHaveBeenCalled();
	});

	it("各失败原因映射为可执行的引导文案", async () => {
		for (const reason of [
			"missing",
			"not-a-file",
			"unsupported-format",
			"too-large",
			"empty",
			"no-header",
			"parse-failed",
			"cancelled",
		] as const) {
			const operations = {
				profileDataset: vi.fn(async () => ({ ok: false as const, reason })),
			};
			const tool = createCodingAgentDatasetProfileToolRegistration({ operations }).tool;
			const result = await tool.execute(executionContext({ path: "/d/x.csv" }));
			expect(result.isError).toBe(true);
			expect(result.content[0]?.type === "text" && result.content[0].text).toContain("dataset_profile:");
		}
	});

	it("取消信号原样透传给宿主实现", async () => {
		const operations = { profileDataset: vi.fn(async () => ok()) };
		const tool = createCodingAgentDatasetProfileToolRegistration({ operations }).tool;
		const controller = new AbortController();
		const ctx = { ...executionContext({ path: "/d/x.csv" }), signal: controller.signal };
		await tool.execute(ctx);
		expect(operations.profileDataset).toHaveBeenCalledWith("/d/x.csv", {
			expectedColumns: undefined,
			signal: controller.signal,
		});
	});
});
