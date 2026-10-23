// Modified by The Open Forge contributors.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	confirmWorktreeAssociation,
	copyProjectAsNewBinding,
	type MemoryIdentityRegistry,
	moveProjectBinding,
	resolveConversationProjectRoot,
	resolveMemoryIdentity,
} from "./memory-identity.js";

/**
 * TASK-0370 身份解析合同：同名仓库隔离、同仓 Worktree 候选/确认、
 * 移动保留 ID、复制新 ID、对话子 cwd 归属、SSH 命名空间。
 */

const PRINCIPAL = { principalId: "principal-1" };

function emptyRegistry(): MemoryIdentityRegistry {
	return { principal: PRINCIPAL, projects: [], workspaceViews: [] };
}

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "memory-identity-"));
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("项目身份解析", () => {
	it("无 Git 普通目录：首次新建 projectId，再次解析复用", () => {
		const first = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/repos/plain" });
		expect(first.created).toBe(true);
		const second = resolveMemoryIdentity({ registry: first.registry, cwd: "D:/repos/plain" });
		expect(second.created).toBe(false);
		expect(second.projectId).toBe(first.projectId);
		expect(second.worktreeAssociation).toBe("unshared");
	});

	it("同名独立仓库隔离：basename/内容相同也不共享", () => {
		const left = resolveMemoryIdentity({
			registry: emptyRegistry(),
			cwd: "D:/work/project-a",
			gitCommonDir: "D:/work/project-a/.git",
		});
		const right = resolveMemoryIdentity({
			registry: left.registry,
			cwd: "E:/other/project-a",
			gitCommonDir: "E:/other/project-a/.git",
		});
		expect(right.projectId).not.toBe(left.projectId);
		expect(right.worktreeAssociation).toBe("unshared");
	});

	it("同仓两个 Worktree：未确认仅 candidate；确认后共享项目 scope 且 view 不同", () => {
		const main = resolveMemoryIdentity({
			registry: emptyRegistry(),
			cwd: "D:/repo/main",
			gitCommonDir: "D:/repo/main/.git",
		});
		const worktree = resolveMemoryIdentity({
			registry: main.registry,
			cwd: "D:/repo/wt-feature",
			gitCommonDir: "D:/repo/main/.git",
			ensureWorkspaceView: true,
		});
		expect(worktree.worktreeAssociation).toBe("candidate");
		expect(worktree.projectId).not.toBe(main.projectId);
		expect(worktree.workspaceViewId).not.toBe("");

		const confirmed = confirmWorktreeAssociation(worktree.registry, {
			leftProjectId: main.projectId,
			rightProjectId: worktree.projectId,
			gitCommonDir: "D:/repo/main/.git",
		});
		const afterConfirm = resolveMemoryIdentity({
			registry: confirmed,
			cwd: "D:/repo/wt-feature",
			gitCommonDir: "D:/repo/main/.git",
		});
		expect(afterConfirm.worktreeAssociation).toBe("confirmed");
		// 确认共享的是项目事实，view 仍按目录隔离。
		expect(afterConfirm.workspaceViewId).toBe(worktree.workspaceViewId);
		expect(afterConfirm.projectId).toBe(worktree.projectId);
	});

	it("移动目录：显式重关联保留 projectId；旧 alias 不再命中 cwd 但记录保留", () => {
		const initial = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/old/place" });
		const moved = moveProjectBinding(initial.registry, { projectId: initial.projectId, newLocation: "E:/new/place" });
		const resolved = resolveMemoryIdentity({ registry: moved, cwd: "E:/new/place" });
		expect(resolved.created).toBe(false);
		expect(resolved.projectId).toBe(initial.projectId);
	});

	it("复制成新项目：新 projectId，与模板零共享", () => {
		const template = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/original" });
		const copy = copyProjectAsNewBinding(template.registry, {
			templateProjectId: template.projectId,
			newLocation: "D:/copy",
		});
		expect(copy.projectId).not.toBe(template.projectId);
		const resolved = resolveMemoryIdentity({ registry: copy.registry, cwd: "D:/copy" });
		expect(resolved.projectId).toBe(copy.projectId);
	});

	it("Windows 大小写与分隔符：同一目录不同写法命中同一绑定", () => {
		const initial = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:\\Repos\\MyProject\\" });
		const again = resolveMemoryIdentity({ registry: initial.registry, cwd: "d:/repos/myproject" });
		expect(again.created).toBe(false);
		expect(again.projectId).toBe(initial.projectId);
	});

	it("对话子 cwd（uuid 目录）归属项目根", () => {
		const project = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/proj" });
		const root = resolveConversationProjectRoot(["D:/proj", "D:/other"], "D:/proj/.vetta/sessions/uuid-123");
		expect(root).toBe("D:/proj");
		const resolved = resolveMemoryIdentity({
			registry: project.registry,
			cwd: "D:/proj/.vetta/sessions/uuid-123",
			conversationProjectRoot: root,
		});
		expect(resolved.projectId).toBe(project.projectId);
		expect(resolved.created).toBe(false);
	});

	it("SSH location：客户端命名空间，不回落本机目录", () => {
		const first = resolveMemoryIdentity({
			registry: emptyRegistry(),
			cwd: "/local/cwd/ignored",
			ssh: { hostId: "Host-A", remotePath: "/srv/app" },
		});
		const again = resolveMemoryIdentity({
			registry: first.registry,
			cwd: "/anything",
			ssh: { hostId: "host-a", remotePath: "/srv/app/" },
		});
		expect(again.created).toBe(false);
		expect(again.projectId).toBe(first.projectId);
	});

	it("allowedScopes 输出 user+project，principal/projectId 来自绑定", () => {
		const resolved = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/x" });
		expect(resolved.allowedScopes).toEqual([
			{ name: "user", principalId: "principal-1" },
			{ name: "project", principalId: "principal-1", projectId: resolved.projectId },
		]);
	});
});

describe("注册表持久化（重启合同）", () => {
	it("load 不存在文件返回空注册表；save 后 load 等价；损坏文件显式报错", async () => {
		const { loadMemoryIdentityRegistry, MemoryIdentityStorageError, saveMemoryIdentityRegistry } = await import(
			"./memory-identity-storage.js"
		);
		const filePath = join(workDir, "nested", "identity-registry.json");
		expect(loadMemoryIdentityRegistry({ filePath, principal: PRINCIPAL })).toEqual({
			principal: PRINCIPAL,
			projects: [],
			workspaceViews: [],
		});

		const first = resolveMemoryIdentity({ registry: emptyRegistry(), cwd: "D:/persist" });
		saveMemoryIdentityRegistry({ filePath, registry: first.registry });
		const reloaded = loadMemoryIdentityRegistry({ filePath, principal: PRINCIPAL });
		const resolved = resolveMemoryIdentity({ registry: reloaded, cwd: "D:/persist" });
		expect(resolved.created).toBe(false);
		expect(resolved.projectId).toBe(first.projectId);

		writeFileSync(filePath, "{ broken json", "utf8");
		expect(() => loadMemoryIdentityRegistry({ filePath, principal: PRINCIPAL })).toThrowError(
			MemoryIdentityStorageError,
		);
	});
});
