// Copyright The Open Forge contributors.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { formatKnownHostLine, matchKnownHosts, type Ssh2HostKeyInfo } from "@vetta/ssh-transport";
import { getAppLogger } from "../logger.js";
import type { SshAskpassRequest } from "./askpass-server.js";

const log = getAppLogger("ssh-hostkey");

/**
 * ssh2 传输的主机密钥校验。
 *
 * 与用户 `~/.ssh/known_hosts` 共享同一份事实：OpenSSH 路径下确认过的主机，换到进程内
 * 传输不该再问一遍，反过来也成立——「这台机器我已经确认过」是用户给出的承诺，不应该
 * 绑在具体传输实现上。所以写回也落到同一个文件，而不是应用私有的第二份登记。
 *
 * 语义与 StrictHostKeyChecking=ask 对齐：登记过且密钥一致→放行；登记过但密钥不同→拒绝
 * （中间人或重装系统必须由用户手工处置，没有任何提示能「安全地」代做决定）；没见过→
 * 走确认提示，同意后写回。
 */
export function createSshHostKeyVerifier(options: {
	ask: (request: SshAskpassRequest) => Promise<{ ok: boolean }>;
	knownHostsPath?: string;
}): (info: Ssh2HostKeyInfo) => Promise<boolean> {
	const userKnownHosts = join(homedir(), ".ssh", "known_hosts");
	const appKnownHosts = options.knownHostsPath ?? join(getVettaHomePath(), "ssh", "known_hosts");
	return async (info) => {
		for (const file of [userKnownHosts, appKnownHosts]) {
			const verdict = matchKnownHosts(readLines(file), info.hostname, info.port, info.keyBase64);
			if (verdict === "match") return true;
			if (verdict === "mismatch") {
				// OpenSSH 在这时直接拒绝并要求用户手动修 known_hosts；提示「换个指纹重连」
				// 反而鼓励用户在中间人攻击下点确认。
				log.warn("host key changed, refusing connection", {
					host: info.hostname,
					port: info.port,
					fingerprint: info.fingerprint,
					knownHostsFile: file,
				});
				return false;
			}
		}
		const answer = await options.ask({
			hostId: info.hostId,
			kind: "confirm",
			// 与 OpenSSH 首次连接的提示同形：用户手册、教程和肌肉记忆都认这个文本。
			prompt:
				`The authenticity of host '${info.hostname} (port ${info.port})' can't be established.\n` +
				`${info.keyType} key fingerprint is ${info.fingerprint}.\n` +
				"Are you sure you want to continue connecting?",
		});
		if (!answer.ok) return false;
		try {
			appendLine(appKnownHosts, formatKnownHostLine(info.hostname, info.port, info.keyType, info.keyBase64));
			return true;
		} catch (error) {
			// 写不下登记就不放行：下次还得问一遍，但至少不会因为「刚同意过却记不住」而重复打扰。
			log.warn("could not record host key", error);
			return false;
		}
	};
}

function readLines(file: string): readonly string[] {
	if (!existsSync(file)) return [];
	try {
		return readFileSync(file, "utf8").split("\n");
	} catch (error) {
		log.warn("could not read known_hosts", { file, error });
		return [];
	}
}

function appendLine(file: string, line: string): void {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	appendFileSync(file, `${line}\n`, { mode: 0o600 });
}
