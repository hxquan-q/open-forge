// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { PluginCommandRunResult } from "@vetta-org/plugin-sdk";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGitTabMeta } from "../src/components/useGitTabMeta";
import { invalidateGitTabProbe, setFsApi, setGitCommand } from "../src/git/runtime";

const ok = (stdout: string, exitCode = 0): PluginCommandRunResult => ({ stdout, stderr: "", exitCode });

/** 模拟宿主：cwd 决定 rev-parse 的结论，与真实的「仓库 / 非仓库」一致。 */
function installHost(repos: readonly string[]): void {
	setGitCommand({
		run: async (_file: string, args: string[] = [], options?: { cwd?: string }) => {
			if (args[0] === "--version") return ok("git version 2.43.0\n");
			return repos.includes(options?.cwd ?? "") ? ok("true\n") : ok("", 128);
		},
	});
	setFsApi({ stat: async () => null } as never);
}

beforeEach(() => {
	invalidateGitTabProbe();
});

afterEach(() => {
	// 必须先卸载再清缓存：反过来会让仍挂载的 hook 在广播中重渲染并立即重探测，
	// 用本用例的宿主 mock 把结论写回共享缓存，串扰下一个用例。
	cleanup();
	invalidateGitTabProbe();
});

describe("useGitTabMeta", () => {
	it("pins the tab in a repository and keeps it in the addable pool elsewhere", async () => {
		installHost(["/repo"]);

		const repo = renderHook(() => useGitTabMeta({ cwd: "/repo" }));
		await waitFor(() => expect(repo.result.current).toEqual({ pinned: true }));

		const plain = renderHook(() => useGitTabMeta({ cwd: "/plain" }));
		await waitFor(() => expect(plain.result.current).toEqual({ pinned: false }));
	});

	it("claims no frame while the probe is still running", () => {
		installHost(["/repo"]);
		const { result } = renderHook(() => useGitTabMeta({ cwd: "/repo" }));
		// 首帧还没有结论：不进入候选，避免先按错误判断抢占标签栏。
		expect(result.current).toBeNull();
	});

	it("contributes nothing without a workspace cwd", () => {
		installHost([]);
		const { result } = renderHook(() => useGitTabMeta({ cwd: null }));
		expect(result.current).toBeNull();
	});

	it("re-probes after invalidation without remounting, so turn-end git init surfaces the tab", async () => {
		// turn-end 的 invalidateGitTabProbe() 清空缓存时 hook 并不重挂载（宿主 fold 层
		// 始终在场）：探测必须在效果里被重新触发，否则标签卡永久停留在「不参与候选」。
		// 作废→重探测→恢复可能发生在 React 同一批次里，「先变 null 再恢复」的中间帧
		// 不一定可观察；重探测的本质证据是 git 命令被再次执行，所以直接数 rev-parse 次数。
		let revParseCount = 0;
		setGitCommand({
			run: async (_file: string, args: string[] = [], options?: { cwd?: string }) => {
				if (args[0] === "--version") return ok("git version 2.43.0\n");
				revParseCount += 1;
				return (options?.cwd ?? "") === "/repo" ? ok("true\n") : ok("", 128);
			},
		});
		setFsApi({ stat: async () => null } as never);

		const { result } = renderHook(() => useGitTabMeta({ cwd: "/repo" }));
		await waitFor(() => expect(result.current).toEqual({ pinned: true }));
		const countBeforeInvalidate = revParseCount;

		invalidateGitTabProbe();
		await waitFor(() => expect(result.current).toEqual({ pinned: true }));
		expect(revParseCount).toBeGreaterThan(countBeforeInvalidate);
	});
});
