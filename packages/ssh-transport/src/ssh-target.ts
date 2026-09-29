// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import type { SshHost } from "./ssh-host.js";

/**
 * 进程内传输的连接参数。
 *
 * `ssh-config` 别名的参数由 OpenSSH 在连接时解析，进程内实现必须自己取同一份答案：
 * 首选 `ssh -G`，它原样输出 Include、Match、全局默认与命令行覆盖后的最终配置，与我们
 * 复刻一份配置文件解析相比，行为必然与用户手敲 `ssh` 一致——这正是 ADR-0124 选系统
 * OpenSSH 的理由的延续，只是换成不依赖 ControlMaster 的 `-G` 查询模式。
 */

export interface ResolvedSshTarget {
	readonly hostname: string;
	readonly port: number;
	readonly username: string;
	readonly identityFiles: readonly string[];
	/** ProxyJump 链的最终解析结果，按从近到远排序。 */
	readonly proxyHops: readonly ResolvedSshTarget[];
	/** 有 ProxyCommand 时是原样命令串。当前实现不支持，调用方据此报明确错误。 */
	readonly proxyCommand?: string;
}

/** `ssh -G` 的执行方式注入：生产实现走真实二进制，测试给固定输出或错误。 */
export type RunSshConfigQuery = (args: readonly string[]) => Promise<string>;

const CONFIG_QUERY_TIMEOUT_MS = 15_000;
const MAX_PROXY_HOPS = 4;

/** 解析一台主机的最终连接参数；`ssh` 二进制不可用时回退到 `user@host` 直解析。 */
export async function resolveSshTarget(
	host: SshHost,
	runQuery: RunSshConfigQuery = runSshConfigQuery,
	depth = 0,
): Promise<ResolvedSshTarget> {
	const direct = parseDirectTarget(host);
	let merged: MergedSshTarget;
	try {
		const args = ["-G"];
		if (host.port !== undefined) args.push("-p", String(host.port));
		if (host.identityFile) args.push("-i", host.identityFile);
		args.push(host.target);
		merged = mergeWithDefaults(parseSshConfigQuery(await runQuery(args)), direct);
	} catch {
		// 找不到 ssh 二进制时并非世界末日：manual 的 user@host 与 identityFile/port 仍然够用。
		// ssh-config 别名就只能报「解析不出来」——比连到错误目标好。
		merged = { ...direct, proxyJumpSpecs: [] };
	}
	if (merged.proxyJumpSpecs.length === 0 && merged.proxyCommand === undefined) {
		return { ...merged, proxyHops: [] };
	}
	if (depth >= MAX_PROXY_HOPS) {
		throw new Error(`SSH proxy chain for ${host.label} exceeds ${MAX_PROXY_HOPS} hops.`);
	}
	const hops: ResolvedSshTarget[] = [];
	for (const spec of merged.proxyJumpSpecs) {
		hops.push(await resolveSshTarget(specToPseudoHost(spec), runQuery, depth + 1));
	}
	return { ...merged, proxyHops: hops };
}

interface MergedSshTarget extends Omit<ResolvedSshTarget, "proxyHops"> {
	readonly proxyJumpSpecs: readonly string[];
}

/** 不走 `ssh -G` 的最小解析：`user@host`、`host`、显式 port 与 identityFile。 */
export function parseDirectTarget(host: SshHost): ResolvedSshTarget {
	const at = host.target.lastIndexOf("@");
	const username = at >= 0 ? host.target.slice(0, at) : userInfo().username;
	const hostname = at >= 0 ? host.target.slice(at + 1) : host.target;
	return {
		hostname,
		port: host.port ?? 22,
		username,
		identityFiles: host.identityFile ? [host.identityFile] : [],
		proxyHops: [],
	};
}

/** `ssh -G` 输出的 `key value` 行解析。 */
export function parseSshConfigQuery(output: string): {
	readonly hostname?: string;
	readonly port?: number;
	readonly username?: string;
	readonly identityFiles: readonly string[];
	readonly proxyJump?: string;
	readonly proxyCommand?: string;
} {
	const result: {
		hostname?: string;
		port?: number;
		username?: string;
		identityFiles: string[];
		proxyJump?: string;
		proxyCommand?: string;
	} = { identityFiles: [] };
	for (const raw of output.split("\n")) {
		const line = raw.trim();
		if (line.length === 0) continue;
		const space = line.indexOf(" ");
		if (space < 0) continue;
		const key = line.slice(0, space).toLowerCase();
		const value = line.slice(space + 1).trim();
		switch (key) {
			case "hostname":
				result.hostname = value;
				break;
			case "user":
				result.username = value;
				break;
			case "port": {
				const port = Number(value);
				if (Number.isInteger(port) && port > 0 && port <= 65535) result.port = port;
				break;
			}
			case "identityfile":
				if (value !== "none") result.identityFiles.push(expandHome(value));
				break;
			case "proxyjump":
				if (value !== "none") result.proxyJump = value;
				break;
			case "proxycommand":
				if (value !== "none") result.proxyCommand = value;
				break;
		}
	}
	return result;
}

function mergeWithDefaults(
	fromConfig: ReturnType<typeof parseSshConfigQuery>,
	direct: ResolvedSshTarget,
): MergedSshTarget {
	return {
		hostname: fromConfig.hostname ?? direct.hostname,
		port: fromConfig.port ?? direct.port,
		username: fromConfig.username ?? direct.username,
		identityFiles: fromConfig.identityFiles.length > 0 ? fromConfig.identityFiles : direct.identityFiles,
		proxyJumpSpecs:
			fromConfig.proxyJump === undefined
				? []
				: fromConfig.proxyJump
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s.length > 0),
		...(fromConfig.proxyCommand === undefined ? {} : { proxyCommand: fromConfig.proxyCommand }),
	};
}

/**
 * ProxyJump 规格转回 SshHost 形状供递归解析。
 *
 * 规格保留为 target（可能是别名本身），交给 `ssh -G` 再解析一次——跳转机也可能是
 * ssh config 里的别名，直接展开成 `user@host` 会丢掉它自己的 User/IdentityFile 配置。
 */
function specToPseudoHost(spec: string): SshHost {
	const at = spec.lastIndexOf("@");
	const userPart = at >= 0 ? spec.slice(0, at + 1) : "";
	const hostPart = spec.slice(userPart.length);
	const colon = hostPart.lastIndexOf(":");
	const hasPort = colon >= 0 && /^\d+$/.test(hostPart.slice(colon + 1));
	const port = hasPort ? Number(hostPart.slice(colon + 1)) : undefined;
	const hostname = hasPort ? hostPart.slice(0, colon) : hostPart;
	return {
		id: `jump:${spec}`,
		label: spec,
		target: `${userPart}${hostname}`,
		...(port === undefined ? {} : { port }),
		source: "manual",
	};
}

function expandHome(value: string): string {
	if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
		return `${userInfo().homedir}${value.slice(1)}`;
	}
	return value;
}

function runSshConfigQuery(args: readonly string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("ssh", [...args], { timeout: CONFIG_QUERY_TIMEOUT_MS }, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout);
		});
	});
}
