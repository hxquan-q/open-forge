// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import type { SshHost } from "./ssh-host.js";
import { parseDirectTarget, parseSshConfigQuery, resolveSshTarget } from "./ssh-target.js";

const host = (partial: Partial<SshHost>): SshHost => ({
	id: "h1",
	label: "h1",
	target: "ubuntu@example.com",
	source: "manual",
	...partial,
});

describe("ssh -G 输出解析", () => {
	it("提取 hostname/user/port/identityfile/proxyjump/proxycommand", () => {
		const parsed = parseSshConfigQuery(
			[
				"user ubuntu",
				"hostname 10.0.0.1",
				"port 2222",
				"identityfile ~/.ssh/id_ed25519",
				"identityfile none",
				"identityfile /keys/second.pem",
				"proxyjump jump.example.com",
				"proxycommand none",
			].join("\n"),
		);
		expect(parsed.username).toBe("ubuntu");
		expect(parsed.hostname).toBe("10.0.0.1");
		expect(parsed.port).toBe(2222);
		expect(parsed.identityFiles).toHaveLength(2);
		expect(parsed.proxyJump).toBe("jump.example.com");
		expect(parsed.proxyCommand).toBeUndefined();
	});
});

describe("resolveSshTarget", () => {
	it("manual 主机的 -i/-p 传给 ssh -G，输出覆盖默认值", async () => {
		const argsSeen: string[][] = [];
		const resolved = await resolveSshTarget(
			host({ target: "ubuntu@example.com", port: 2200, identityFile: "C:\\keys\\win.pem" }),
			async (args) => {
				argsSeen.push([...args]);
				return "user ubuntu\nhostname 203.0.113.7\nport 2200\nidentityfile C:\\keys\\win.pem\nproxyjump none\n";
			},
		);
		expect(argsSeen[0]).toEqual(["-G", "-p", "2200", "-i", "C:\\keys\\win.pem", "ubuntu@example.com"]);
		expect(resolved.hostname).toBe("203.0.113.7");
		expect(resolved.username).toBe("ubuntu");
		expect(resolved.identityFiles).toEqual(["C:\\keys\\win.pem"]);
	});

	it("ssh -G 不可用时回退到 user@host 直解析", async () => {
		const resolved = await resolveSshTarget(host({ target: "deploy@203.0.113.9", port: 2222 }), async () => {
			throw new Error("spawn ssh ENOENT");
		});
		expect(resolved).toMatchObject({ hostname: "203.0.113.9", port: 2222, username: "deploy", proxyHops: [] });
	});

	it("ProxyJump 规格保留原文交给 ssh -G 递归解析——跳机也可能是别名", async () => {
		const queries: string[] = [];
		const resolved = await resolveSshTarget(host({ target: "work" }), async (args) => {
			const target = args[args.length - 1];
			queries.push(target);
			if (target === "work") return "hostname 10.1.0.5\nuser ubuntu\nport 22\nproxyjump bastion\n";
			if (target === "bastion")
				return "hostname 203.0.113.1\nuser admin\nport 2222\nidentityfile /keys/bastion.pem\nproxyjump none\n";
			throw new Error(`unexpected target ${target}`);
		});
		expect(queries).toEqual(["work", "bastion"]);
		expect(resolved.proxyHops).toHaveLength(1);
		expect(resolved.proxyHops[0]).toMatchObject({
			hostname: "203.0.113.1",
			port: 2222,
			username: "admin",
			identityFiles: ["/keys/bastion.pem"],
		});
	});

	it("带 user@host:port 的 ProxyJump 规格把端口拆出来", async () => {
		const resolved = await resolveSshTarget(host({ target: "work" }), async (args) => {
			const target = args[args.length - 1];
			if (target === "work") return "hostname 10.1.0.5\nuser ubuntu\nport 22\nproxyjump admin@jump:2222\n";
			return "hostname 198.51.100.2\nuser admin\nport 2222\nproxyjump none\n";
		});
		expect(resolved.proxyHops[0]).toMatchObject({ hostname: "198.51.100.2", port: 2222, username: "admin" });
	});

	it("ProxyCommand 原样带出，由调用方决定报不支持", async () => {
		const resolved = await resolveSshTarget(
			host({ target: "work" }),
			async () => "hostname 10.1.0.5\nuser ubuntu\nport 22\nproxycommand nc -X connect %h %p\n",
		);
		expect(resolved.proxyCommand).toBe("nc -X connect %h %p");
	});

	it("代理链超过上限时报错而不是死循环", async () => {
		await expect(
			resolveSshTarget(host({ target: "work" }), async () => "hostname h\nuser u\nport 22\nproxyjump next\n"),
		).rejects.toThrow(/proxy chain/);
	});
});

describe("parseDirectTarget", () => {
	it("user@host 拆出用户名；裸 host 用本机用户名", () => {
		expect(parseDirectTarget(host({ target: "a@b" })).username).toBe("a");
		expect(parseDirectTarget(host({ target: "b" })).username.length).toBeGreaterThan(0);
	});
});
