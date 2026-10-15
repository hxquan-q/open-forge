// Modified by The Open Forge contributors.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	AgentRpcProcess,
	createAgentRpcFixture,
	createAgentRpcProcessEnv,
	formatRpcWaitTimeout,
	waitForRpcProcessPid,
} from "./support/agent-rpc-test-process.js";

describe("Agent RPC process test fixture", () => {
	it("isolates user configuration while preserving required process launch variables", async () => {
		const fixture = await createAgentRpcFixture();
		try {
			const env = createAgentRpcProcessEnv(fixture, {
				baseEnv: {
					ComSpec: "C:\\Windows\\System32\\cmd.exe",
					HOME: "C:\\contaminated-home",
					PATH: "C:\\tools",
					SECRET_FROM_PARENT: "must-not-pass-through",
					VETTA_HOME: "C:\\contaminated-vetta-home",
				},
				overrides: { TEST_OVERRIDE: "enabled" },
			});

			expect(env).toMatchObject({
				APPDATA: join(fixture.root, "app-data"),
				CI: "1",
				ComSpec: "C:\\Windows\\System32\\cmd.exe",
				HOME: fixture.root,
				LOCALAPPDATA: join(fixture.root, "local-app-data"),
				NO_COLOR: "1",
				PATH: "C:\\tools",
				TEST_OVERRIDE: "enabled",
				USERPROFILE: fixture.root,
				VETTA_CODING_AGENT_DIR: fixture.agentDir,
				VETTA_HOME: join(fixture.root, "home"),
			});
			expect(env.SECRET_FROM_PARENT).toBeUndefined();
		} finally {
			await fixture.dispose();
		}
	});

	it("reports child exit diagnostics instead of waiting for the full MCP timeout", async () => {
		const fixture = await createAgentRpcFixture();
		const child = spawn(
			process.execPath,
			["-e", "process.stderr.write('fixture-mcp-start-failed'); setTimeout(() => process.exit(23), 50);"],
			{ stdio: "pipe", windowsHide: true },
		);
		const processHandle = new AgentRpcProcess(child);
		try {
			await expect(
				waitForRpcProcessPid(processHandle, join(fixture.root, "missing-mcp.pid"), { timeoutMs: 2_000 }),
			).rejects.toThrow(/RPC process exited.*exitCode=23.*fixture-mcp-start-failed/su);
			await expect(processHandle.close()).resolves.toBe(23);
		} finally {
			await processHandle.close();
			await fixture.dispose();
		}
	});
});

describe("RPC wait timeout diagnostics", () => {
	it("formats expectation, child state and phase from a snapshot without frame bodies", () => {
		const text = formatRpcWaitTimeout({
			timeoutMs: 20_000,
			expectation: { id: "req-7", command: "prompt" },
			child: { pid: 43121, exitCode: null, signalCode: null },
			phase: { ageMs: 21_300, framesReceived: 42, msSinceFirstFrame: 21_000, msSinceLastFrame: 350 },
			recentFrames: ["type=response id=req-6 command=get_state", "type=agent_start"],
			stderrTail: "",
		});
		expect(text).toContain("Timed out after 20000ms waiting for RPC frame (expected id=req-7 command=prompt)");
		expect(text).toContain("child: pid=43121 exit=running signal=none");
		expect(text).toContain("phase: ageMs=21300 frames=42 sinceFirstFrame=21000 sinceLastFrame=350");
		expect(text).toContain("recentFrames(2): type=response id=req-6 command=get_state | type=agent_start");
		expect(text).toContain("stderr(tail): <empty>");
	});

	it("distinguishes the startup phase (no frames) and an exited child", () => {
		const text = formatRpcWaitTimeout({
			timeoutMs: 5_000,
			child: { pid: undefined, exitCode: 3, signalCode: null },
			phase: { ageMs: 5_100, framesReceived: 0 },
			recentFrames: [],
			stderrTail: "startup failed",
		});
		expect(text).toContain("child: pid=unknown exit=3 signal=none");
		expect(text).toContain("sinceFirstFrame=never sinceLastFrame=never");
		expect(text).toContain("recentFrames(0): <none>");
		expect(text).toContain("stderr(tail): startup failed");
	});

	it("live child timeout names the expectation and keeps frame bodies out of the error", async () => {
		const child = spawn(
			process.execPath,
			[
				"-e",
				"process.stdout.write(JSON.stringify({type:'agent_start',data:{secret:'BODY-SECRET'}})+'\\n');" +
					"setTimeout(() => process.exit(0), 800);",
			],
			{ stdio: "pipe", windowsHide: true },
		);
		const handle = new AgentRpcProcess(child);
		try {
			const mark = handle.mark();
			let timedOut: Error | undefined;
			try {
				await handle.waitFor(() => false, mark, 250, { id: "probe-1", command: "diag.probe" });
			} catch (error) {
				timedOut = error instanceof Error ? error : new Error(String(error));
			}
			expect(timedOut).toBeDefined();
			expect(timedOut?.message).toContain("expected id=probe-1 command=diag.probe");
			expect(timedOut?.message).toContain("type=agent_start");
			expect(timedOut?.message).not.toContain("BODY-SECRET");
		} finally {
			await handle.close();
		}
	});
});
