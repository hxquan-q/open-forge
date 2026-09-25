// ADR-0133 §3 ALS 失败边界。这些 case 决定了"读到了不该读到的 grant"的主要路径。
//
// ALS-1 (顺序两次 grant) 已由 node-sandbox-host.test.ts 覆盖,这里不再重复;
// ALS-5 (mode flip 中途,运行中的 tool 沿用发起时的 grant) 属 runtime-host 层
// 语义,由 execution-mode-turn-boundary.test.ts 的 Turn 边界用例承载。
// 本文件锁定 ALS-2..ALS-4 与 grant 的跨异步可见性窗口。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxShellGrant } from "@vetta/runtime-core/sandbox";
import { afterEach, describe, expect, it } from "vitest";
import { getSandboxShellGrant, runWithSandboxShellGrant } from "../../src/sandbox/sandbox-permissions.js";

describe("ADR-0133 ALS 边界", () => {
	const cleanups: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const cleanup of cleanups.splice(0)) await cleanup();
	});

	it("ALS-2: 同一进程并发两路 runWithSandboxShellGrant 互不串扰", async () => {
		const cwdA = await mkdtemp(join(tmpdir(), "vetta-als-a-"));
		const cwdB = await mkdtemp(join(tmpdir(), "vetta-als-b-"));
		cleanups.push(async () => {
			await rm(cwdA, { recursive: true, force: true });
			await rm(cwdB, { recursive: true, force: true });
		});
		const grantA: SandboxShellGrant = { allowReadRoots: ["/a"], allowWriteRoots: ["/a"] };
		const grantB: SandboxShellGrant = { allowReadRoots: ["/b"], allowWriteRoots: ["/b"] };

		const observedByA: Array<SandboxShellGrant | undefined> = [];
		const observedByB: Array<SandboxShellGrant | undefined> = [];

		await Promise.all([
			runWithSandboxShellGrant(cwdA, grantA, async () => {
				// 让 A 等到 B 也进入 ALS context
				await new Promise((resolve) => setImmediate(resolve));
				observedByA.push(getSandboxShellGrant(cwdA));
			}),
			runWithSandboxShellGrant(cwdB, grantB, async () => {
				await new Promise((resolve) => setImmediate(resolve));
				observedByB.push(getSandboxShellGrant(cwdB));
			}),
		]);

		expect(observedByA).toEqual([grantA]);
		expect(observedByB).toEqual([grantB]);
	});

	it("ALS-3: callback 内同步 throw 不污染外层,外层 getSandboxShellGrant 为 undefined", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-als-c-"));
		cleanups.push(async () => {
			await rm(cwd, { recursive: true, force: true });
		});
		const grant: SandboxShellGrant = { allowReadRoots: ["/x"], allowWriteRoots: ["/x"] };

		await expect(
			runWithSandboxShellGrant(cwd, grant, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(getSandboxShellGrant(cwd)).toBeUndefined();
	});

	it("ALS-4: cwd 不匹配时 getSandboxShellGrant 返回 undefined", async () => {
		const cwdAllowed = await mkdtemp(join(tmpdir(), "vetta-als-allow-"));
		const cwdOther = await mkdtemp(join(tmpdir(), "vetta-als-other-"));
		cleanups.push(async () => {
			await rm(cwdAllowed, { recursive: true, force: true });
			await rm(cwdOther, { recursive: true, force: true });
		});
		const grant: SandboxShellGrant = { allowReadRoots: ["/y"], allowWriteRoots: ["/y"] };

		await runWithSandboxShellGrant(cwdAllowed, grant, async () => {
			// 同 cwd 可以读
			expect(getSandboxShellGrant(cwdAllowed)).toEqual(grant);
			// 不同 cwd 读不到
			expect(getSandboxShellGrant(cwdOther)).toBeUndefined();
		});
	});

	it("callback 内跨 await/macrotask 期间 grant 仍可见,结束后立刻不可见", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "vetta-als-d-"));
		cleanups.push(async () => {
			await rm(cwd, { recursive: true, force: true });
		});
		const grant: SandboxShellGrant = { allowReadRoots: ["/z"], allowWriteRoots: ["/z"] };

		const duringInner: Array<SandboxShellGrant | undefined> = [];
		await runWithSandboxShellGrant(cwd, grant, async () => {
			// 跨多个 microtask/macrotask 仍可见(这是 ALS 应当保证的)
			await new Promise((resolve) => setImmediate(resolve));
			duringInner.push(getSandboxShellGrant(cwd));
		});

		expect(duringInner).toEqual([grant]);
		expect(getSandboxShellGrant(cwd)).toBeUndefined();
	});
});
