// Copyright The Open Forge contributors.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatHostKeyFingerprint, formatKnownHostLine, matchKnownHosts } from "./known-hosts.js";

const KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyMaterialForTestingPurposesOnly";
const OTHER_KEY = "AAAAB3NzaC1yc2EAAAADAQABAAABgQCAnotherFakeKeyForMismatchCheck";

describe("known_hosts 匹配", () => {
	it("裸主机条目只在 22 端口命中", () => {
		const lines = [`example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "example.com", 2222, KEY)).toBe("unknown");
	});

	it("非默认端口只认 [host]:port 条目", () => {
		const lines = [`[example.com]:2222 ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 2222, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("unknown");
	});

	it("同一主机登记过但给出另一把密钥 → mismatch，界面据此拒绝而不是再问", () => {
		const lines = [`example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, OTHER_KEY)).toBe("mismatch");
	});

	it("哈希条目（|1|salt|hash）按 HMAC-SHA1 匹配", () => {
		const salt = Buffer.from("0123456789abcdefghij").toString("base64");
		const hash = createHmac("sha1", Buffer.from(salt, "base64")).update("hashed.example.com").digest("base64");
		const lines = [`|1|${salt}|${hash} ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "hashed.example.com", 22, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "other.example.com", 22, KEY)).toBe("unknown");
	});

	it("非默认端口的哈希条目被哈希的串是 [host]:port", () => {
		const salt = Buffer.from("0123456789abcdefghij").toString("base64");
		const hash = createHmac("sha1", Buffer.from(salt, "base64")).update("[hashed.example.com]:2222").digest("base64");
		const lines = [`|1|${salt}|${hash} ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "hashed.example.com", 2222, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "hashed.example.com", 22, KEY)).toBe("unknown");
	});

	it("逗号多主机模式、* 通配与 ! 取反", () => {
		const lines = [`a.example.com,b.example.com ssh-ed25519 ${KEY}`, `*.corp,!bad.corp ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "b.example.com", 22, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "x.corp", 22, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "bad.corp", 22, KEY)).toBe("unknown");
	});

	it("注释、空行不干扰匹配", () => {
		const lines = ["# comment", "", `example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("match");
	});

	it("@revoked 同钥 → revoked，撤销优先于普通匹配", () => {
		const lines = [`@revoked example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("revoked");
	});

	it("普通同钥在前、撤销在后 → 仍是 revoked（行序不影响撤销）", () => {
		const lines = [`example.com ssh-ed25519 ${KEY}`, `@revoked example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("revoked");
	});

	it("撤销在前、普通同钥在后 → 仍是 revoked", () => {
		const lines = [`@revoked example.com ssh-ed25519 ${KEY}`, `example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("revoked");
	});

	it("@revoked 登记的是另一把钥匙 → 不算 revoked 也不算 mismatch，按未知主机处理", () => {
		const lines = [`@revoked example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, OTHER_KEY)).toBe("unknown");
	});

	it("@cert-authority 行不直接信任 raw host key", () => {
		const lines = [`@cert-authority ca.example.com ssh-ed25519 ${KEY}`];
		// CA 行只对证书校验有意义；对端拿同一把 raw key 来时既不放行、也不据此判变更。
		expect(matchKnownHosts(lines, "ca.example.com", 22, KEY)).toBe("unknown");
		expect(matchKnownHosts(lines, "ca.example.com", 22, OTHER_KEY)).toBe("unknown");
	});

	it("未知 marker 不产生信任也不产生 mismatch", () => {
		const lines = [`@something-else example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("unknown");
		expect(matchKnownHosts(lines, "example.com", 22, OTHER_KEY)).toBe("unknown");
	});

	it("CA 行与普通行并存时普通语义不变", () => {
		const lines = [`@cert-authority ca.example.com ssh-ed25519 ${KEY}`, `example.com ssh-ed25519 ${KEY}`];
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("match");
		expect(matchKnownHosts(lines, "example.com", 22, OTHER_KEY)).toBe("mismatch");
	});

	it("@revoked 支持非默认端口与哈希条目", () => {
		const salt = Buffer.from("0123456789abcdefghij").toString("base64");
		const hash = createHmac("sha1", Buffer.from(salt, "base64")).update("hashed.example.com").digest("base64");
		const lines = [
			`@revoked [example.com]:2222 ssh-ed25519 ${KEY}`,
			`@revoked |1|${salt}|${hash} ssh-ed25519 ${KEY}`,
		];
		expect(matchKnownHosts(lines, "example.com", 2222, KEY)).toBe("revoked");
		expect(matchKnownHosts(lines, "example.com", 22, KEY)).toBe("unknown");
		expect(matchKnownHosts(lines, "hashed.example.com", 22, KEY)).toBe("revoked");
	});

	it("生成行与解析行互为往返", () => {
		expect(formatKnownHostLine("h", 22, "ssh-ed25519", KEY)).toBe(`h ssh-ed25519 ${KEY}`);
		expect(formatKnownHostLine("h", 2200, "ssh-ed25519", KEY)).toBe(`[h]:2200 ssh-ed25519 ${KEY}`);
	});
});

describe("主机密钥指纹", () => {
	it("与 OpenSSH 的 SHA256:base64nopad 同形", () => {
		const blob = Buffer.from("ssh-ed25519-blob-material");
		const fingerprint = formatHostKeyFingerprint(blob);
		expect(fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
		expect(fingerprint).not.toContain("=");
	});
});
