// Copyright The Open Forge contributors.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SshAskpassRequest } from "./askpass-server.js";
import { createSshHostKeyVerifier } from "./ssh-hostkey-verifier.js";

vi.mock("../logger.js", () => ({ getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

const KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyMaterialForTestingPurposesOnly";
const OTHER_KEY = "AAAAB3NzaC1yc2EAAAADAQABAAABgQCAnotherFakeKeyForMismatchCheck";

interface Fixture {
	/** 用户 `~/.ssh/known_hosts` 的替身与应用自有登记文件，都在本轮临时目录里。 */
	userFile: string;
	appFile: string;
	ask: ReturnType<typeof vi.fn>;
	verify: ReturnType<typeof createSshHostKeyVerifier>;
}

let tempDirs: string[] = [];

beforeEach(() => {
	tempDirs = [];
});

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function createFixture(options: { userLines?: string[]; appLines?: string[]; answer?: { ok: boolean } }): Fixture {
	const dir = mkdtempSync(join(tmpdir(), "ssh-hostkey-verifier-"));
	tempDirs.push(dir);
	const userFile = join(dir, "user-known-hosts");
	const appFile = join(dir, "app-known-hosts");
	if (options.userLines) writeFileSync(userFile, `${options.userLines.join("\n")}\n`, "utf8");
	if (options.appLines) writeFileSync(appFile, `${options.appLines.join("\n")}\n`, "utf8");
	const ask = vi.fn(async (_request: SshAskpassRequest) => options.answer ?? { ok: false });
	const verify = createSshHostKeyVerifier({ ask, userKnownHostsPath: userFile, knownHostsPath: appFile });
	return { userFile, appFile, ask, verify };
}

const hostInfo = {
	hostId: "h1",
	hostname: "example.com",
	port: 22,
	keyType: "ssh-ed25519",
	keyBase64: KEY,
	fingerprint: "SHA256:testfingerprint",
};

describe("ssh2 主机密钥校验", () => {
	it("登记同钥 → 直接放行，不打扰用户", async () => {
		const fixture = createFixture({ userLines: [`example.com ssh-ed25519 ${KEY}`] });
		await expect(fixture.verify(hostInfo)).resolves.toBe(true);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("登记换钥 → 拒绝且不再确认（fail-closed 保持）", async () => {
		const fixture = createFixture({ userLines: [`example.com ssh-ed25519 ${OTHER_KEY}`] });
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("用户文件换钥、应用文件同钥 → 仍按先查到的变更拒绝", async () => {
		const fixture = createFixture({
			userLines: [`example.com ssh-ed25519 ${OTHER_KEY}`],
			appLines: [`example.com ssh-ed25519 ${KEY}`],
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("未登记 → 走确认提示，同意后写回应用文件", async () => {
		const fixture = createFixture({ answer: { ok: true } });
		await expect(fixture.verify(hostInfo)).resolves.toBe(true);
		expect(fixture.ask).toHaveBeenCalledTimes(1);
		expect(fixture.ask.mock.calls[0][0]).toMatchObject({ hostId: "h1", kind: "confirm" });
		expect(readFileSync(fixture.appFile, "utf8")).toBe(`example.com ssh-ed25519 ${KEY}\n`);
	});

	it("未登记且用户拒绝 → 不放行也不写回", async () => {
		const fixture = createFixture({ answer: { ok: false } });
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(readdirSync(join(fixture.appFile, ".."))).not.toContain("app-known-hosts");
	});

	it("@revoked 同钥 → 拒绝，不触发确认、不追加登记", async () => {
		const fixture = createFixture({
			userLines: [`example.com ssh-ed25519 ${KEY}`, `@revoked example.com ssh-ed25519 ${KEY}`],
			answer: { ok: true },
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("撤销登记在应用文件、普通匹配在用户文件 → 仍拒绝（跨文件撤销优先）", async () => {
		const fixture = createFixture({
			userLines: [`example.com ssh-ed25519 ${KEY}`],
			appLines: [`@revoked example.com ssh-ed25519 ${KEY}`],
			answer: { ok: true },
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("撤销登记在用户文件、普通匹配在应用文件 → 仍拒绝", async () => {
		const fixture = createFixture({
			userLines: [`@revoked example.com ssh-ed25519 ${KEY}`],
			appLines: [`example.com ssh-ed25519 ${KEY}`],
			answer: { ok: true },
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(false);
		expect(fixture.ask).not.toHaveBeenCalled();
	});

	it("@revoked 登记的是另一把钥匙 → 按未知主机走确认", async () => {
		const fixture = createFixture({
			userLines: [`@revoked example.com ssh-ed25519 ${OTHER_KEY}`],
			answer: { ok: true },
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(true);
		expect(fixture.ask).toHaveBeenCalledTimes(1);
	});

	it("@cert-authority 行不直接放行 raw host key，仍走确认", async () => {
		const fixture = createFixture({
			userLines: [`@cert-authority example.com ssh-ed25519 ${KEY}`],
			answer: { ok: true },
		});
		await expect(fixture.verify(hostInfo)).resolves.toBe(true);
		expect(fixture.ask).toHaveBeenCalledTimes(1);
	});
});
