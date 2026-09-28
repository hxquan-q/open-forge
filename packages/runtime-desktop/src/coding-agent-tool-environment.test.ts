// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { addSessionGrant, clearSessionGrants, findSessionGrant } from "@vetta/runtime-node/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopCodingAgentSessionExecutionEnvironment } from "./coding-agent-tool-environment.js";

/** 一个最小的 `.xlsx`（ZIP 魔数）：只要 read 判定为二进制文档即可，内容不进上下文。 */
const WORKBOOK_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

/**
 * BUG-0026 回归：会话执行环境路径的 read 注册此前拿不到上下文里的 `availableSkillNames`，
 * 二进制提示恒为「没有可用技能」，与「会话里就装着该技能」的事实不符。
 */
describe("Desktop 会话执行环境的二进制读提示", () => {
	const temporaryRoots: string[] = [];

	afterEach(async () => {
		for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
	});

	it("会话文件工具的 read 注册点名本会话可调用的技能", async () => {
		const root = await createTemporaryProject();
		const environment = await createDesktopCodingAgentSessionExecutionEnvironment({
			sessionId: "session-file-tools",
			cwd: root,
			agentDir: join(root, "agent"),
			scenario: "project",
			availableSkillNames: () => new Set(["xlsx"]),
		});
		try {
			const read = environment.registrations.find(({ tool }) => tool.name === "read");
			if (!read) throw new Error("Expected the session file tools to register read");
			expect(await readBinaryHint(read.tool, join(root, "book.xlsx"))).toContain('"xlsx" skill');
		} finally {
			await environment.dispose();
		}
	});

	it("沙箱工具集的 read 注册同样点名技能", async () => {
		const root = await createTemporaryProject();
		const environment = await createDesktopCodingAgentSessionExecutionEnvironment({
			sessionId: "session-sandbox-tools",
			cwd: root,
			agentDir: join(root, "agent"),
			scenario: "project",
			availableSkillNames: () => new Set(["xlsx"]),
		});
		try {
			const toolSet = environment.sandbox.createToolSet({
				// 沙箱实现按平台选二进制。这里只构造注册、不执行任何命令，给出本平台确实存在的
				// 路径即可让三种平台都建得出工具集；断言的是 read 的提示，与沙箱能否真跑无关。
				windowsSandboxHostPath: process.execPath,
				linuxBubblewrapPath: "/bin/true",
				macosSandboxExecPath: "/usr/bin/sandbox-exec",
			});
			if (!toolSet) throw new Error("Expected a sandbox tool set on a supported platform");
			expect(await readBinaryHint(toolSet.read.tool, join(root, "book.xlsx"))).toContain('"xlsx" skill');
		} finally {
			await environment.dispose();
		}
	});

	async function createTemporaryProject(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "desktop-session-execution-environment-"));
		temporaryRoots.push(root);
		await mkdir(join(root, "agent"), { recursive: true });
		await writeFile(join(root, "book.xlsx"), WORKBOOK_BYTES);
		return root;
	}
});

describe("Desktop 会话执行环境的沙箱授权缓存接线", () => {
	// ADR-0133 §5(TM-07):mode flip 时 session runtime 会调 sandbox.clearSessionGrants 清本会话
	// grant。这里锁定生产接线确实把它接到 runtime-node 的真实 grant store——上层测试若用
	// fixture 手工注入同名字段,删掉这处接线仍然全绿,所以要单独钉住。
	const grantSessionId = "desktop-clear-grants-session";
	const otherSessionId = "desktop-clear-grants-other";
	const temporaryRoots: string[] = [];
	const grantRequest = {
		capability: "file.write" as const,
		toolName: "write",
		target: "outside.txt",
		resolvedTarget: `${process.cwd()}-outside`,
		grantRoot: `${process.cwd()}-outside`,
		reason: "wiring test",
	};

	afterEach(async () => {
		clearSessionGrants(grantSessionId);
		clearSessionGrants(otherSessionId);
		for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
	});

	it("本机会话环境暴露的 clearSessionGrants 清掉本会话缓存且不影响其他会话", async () => {
		const root = await mkdtemp(join(tmpdir(), "desktop-clear-grants-"));
		temporaryRoots.push(root);
		await mkdir(join(root, "agent"), { recursive: true });
		const environment = await createDesktopCodingAgentSessionExecutionEnvironment({
			sessionId: grantSessionId,
			cwd: root,
			agentDir: join(root, "agent"),
			scenario: "project",
		});
		try {
			addSessionGrant(grantSessionId, grantRequest);
			addSessionGrant(otherSessionId, grantRequest);
			expect(environment.sandbox.clearSessionGrants).toBeTypeOf("function");

			environment.sandbox.clearSessionGrants?.(grantSessionId);

			expect(findSessionGrant(grantSessionId, grantRequest)).toBeUndefined();
			expect(findSessionGrant(otherSessionId, grantRequest)).toBeDefined();
		} finally {
			await environment.dispose();
		}
	});
});

async function readBinaryHint(tool: RuntimeToolDefinition, path: string): Promise<string> {
	const result = await tool.execute({
		sessionId: "session-read-hint",
		turnId: "turn-read-hint",
		toolCallId: "call-read-hint",
		input: { path },
		signal: new AbortController().signal,
	});
	const text = result.content.find((item) => item.type === "text");
	return text?.type === "text" ? text.text : "";
}
