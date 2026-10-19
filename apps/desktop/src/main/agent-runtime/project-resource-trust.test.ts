// Modified by The Open Forge contributors.
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDesktopProjectResourceTrustPort,
	type ProjectTrustDialogChoice,
	type ProjectTrustStoreLike,
} from "./project-resource-trust.js";

function fakeStore(initiallyTrusted: boolean): ProjectTrustStoreLike & { grantCalls: number } {
	return {
		grantCalls: 0,
		allows: async () => initiallyTrusted,
		grant: async function (this: { grantCalls: number }) {
			this.grantCalls++;
		},
	};
}

function fakeDialog(choice: ProjectTrustDialogChoice) {
	return vi.fn(async (): Promise<ProjectTrustDialogChoice> => choice);
}

describe("createDesktopProjectResourceTrustPort（GHSA-mqxh 决策③④）", () => {
	let tempDir: string;
	let cwd: string;
	let emptyCwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `dptr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		cwd = join(tempDir, "project");
		emptyCwd = join(tempDir, "empty");
		mkdirSync(join(cwd, ".vetta", "skills"), { recursive: true });
		mkdirSync(emptyCwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("已记住的授权直接放行，不再弹窗", async () => {
		const dialog = fakeDialog("remember");
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: dialog,
			createTrustStore: () => fakeStore(true),
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "trusted" });
		expect(dialog).not.toHaveBeenCalled();
	});

	it("未决 + 信任并记住：写授权后放行", async () => {
		const store = fakeStore(false);
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: fakeDialog("remember"),
			createTrustStore: () => store,
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "trusted" });
		expect(store.grantCalls).toBe(1);
	});

	it("未决 + 仅本次：不写授权，本次放行", async () => {
		const store = fakeStore(false);
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: fakeDialog("once"),
			createTrustStore: () => store,
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "trust-once" });
		expect(store.grantCalls).toBe(0);
	});

	it("未决 + 拒绝：不放行、不写授权", async () => {
		const store = fakeStore(false);
		const dialog = fakeDialog("deny");
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: dialog,
			createTrustStore: () => store,
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: false, reason: "user-denied" });
		expect(store.grantCalls).toBe(0);
		expect(dialog).toHaveBeenCalledWith(cwd);
	});

	it("无项目资源的仓库：直接放行不弹窗", async () => {
		const dialog = fakeDialog("deny");
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: dialog,
			createTrustStore: () => fakeStore(false),
		});
		await expect(port.decideProjectResourceTrust(emptyCwd)).resolves.toEqual({
			trusted: true,
			reason: "no-project-resources",
		});
		expect(dialog).not.toHaveBeenCalled();
	});

	it("远端项目（ssh://）：非交互默认拒绝，不弹窗", async () => {
		const dialog = fakeDialog("remember");
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: dialog,
			createTrustStore: () => fakeStore(true),
		});
		await expect(port.decideProjectResourceTrust("ssh://host-1/home/me/app")).resolves.toEqual({
			trusted: false,
			reason: "remote-project-non-interactive",
		});
		expect(dialog).not.toHaveBeenCalled();
	});

	it("OPENFORGE_TRUST_PROJECT=1：显式信任优先于一切", async () => {
		const dialog = fakeDialog("deny");
		const port = createDesktopProjectResourceTrustPort({
			env: { OPENFORGE_TRUST_PROJECT: "1" },
			showDialog: dialog,
			createTrustStore: () => fakeStore(false),
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({ trusted: true, reason: "env-override" });
		expect(dialog).not.toHaveBeenCalled();
	});

	it("trust store 读取异常：fail closed", async () => {
		const dialog = fakeDialog("remember");
		const port = createDesktopProjectResourceTrustPort({
			env: {},
			showDialog: dialog,
			createTrustStore: () => ({
				allows: async () => {
					throw new Error("EACCES");
				},
				grant: async () => undefined,
			}),
		});
		await expect(port.decideProjectResourceTrust(cwd)).resolves.toEqual({
			trusted: false,
			reason: "trust-store-error",
		});
		expect(dialog).not.toHaveBeenCalled();
	});
});
