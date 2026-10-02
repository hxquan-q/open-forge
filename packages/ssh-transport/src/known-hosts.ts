// Copyright The Open Forge contributors.
import { createHash, createHmac } from "node:crypto";

/**
 * OpenSSH `known_hosts` 行的解析与匹配。
 *
 * 进程内传输（ssh2）拿不到 OpenSSH 的主机密钥校验，必须自己实现同一套语义：命中放行、
 * 未登记问用户、登记过但密钥变更一律拒绝。这里只做文件格式这一层——问用户、写回文件
 * 由宿主组合。
 *
 * 支持的条目形态与 `sshd(8)` 一致：逗号分隔的主机模式（含 `*`/`?`/`!取反`）、
 * `[host]:port` 非默认端口条目、`|1|salt|hash` 哈希主机名（HMAC-SHA1）。
 * 标记行按 `sshd(8)` 的角色参与裁决：`@revoked` 命中同钥时整条连接必须拒绝
 * （撤销优先于任何普通匹配，与行序无关）；`@cert-authority` 与未知标记不构成对
 * raw host key 的信任，也不据此判定密钥变更。证书链验证不在本层实现。
 */

export interface KnownHostEntry {
	/** 逗号拆分后的主机模式列表，含哈希条目（此时 patterns.length === 1）。 */
	readonly patterns: readonly string[];
	readonly keyType: string;
	readonly keyBase64: string;
	readonly marker?: string;
}

export type KnownHostsVerdict = "match" | "mismatch" | "unknown" | "revoked";

/** 解析一行；注释与空行返回 undefined。 */
export function parseKnownHostsLine(line: string): KnownHostEntry | undefined {
	const trimmed = line.trim();
	if (trimmed.length === 0 || trimmed.startsWith("#")) return undefined;
	const fields = trimmed.split(/\s+/);
	if (fields.length < 3) return undefined;
	let index = 0;
	let marker: string | undefined;
	if (fields[0].startsWith("@")) {
		marker = fields[0];
		index = 1;
		if (fields.length - index < 3) return undefined;
	}
	return {
		patterns: fields[index].split(","),
		keyType: fields[index + 1],
		keyBase64: fields[index + 2],
		...(marker === undefined ? {} : { marker }),
	};
}

/**
 * 匹配主机名与端口对应的密钥，语义对齐 OpenSSH 的 host key 检查：
 *
 * - `@revoked` 条目命中同钥 → `revoked`，且优先于普通匹配——先扫完全部行再裁决，
 *   撤销不会被先遇到的普通同钥放行盖过；
 * - 普通条目命中同钥 → `match`；条目存在但密钥不同 → `mismatch`；无条目 → `unknown`；
 * - `@revoked` 登记的是另一把钥匙时不参与裁决（OpenSSH 对 revoked 行只在同钥时生效）；
 * - `@cert-authority` 与未知标记行整行跳过，不产生信任也不判定变更。
 */
export function matchKnownHosts(
	lines: readonly string[],
	host: string,
	port: number,
	keyBase64: string,
): KnownHostsVerdict {
	let sawEntry = false;
	let sawMatch = false;
	for (const line of lines) {
		const entry = parseKnownHostsLine(line);
		if (!entry) continue;
		if (!matchEntryPatterns(entry.patterns, host, port)) continue;
		if (entry.marker !== undefined && entry.marker !== "@revoked") continue;
		if (entry.keyBase64 === keyBase64) {
			// 撤销优先：同钥 revoked 立即定案；普通同钥先记下，继续扫完防止后面还有撤销行。
			if (entry.marker === "@revoked") return "revoked";
			sawMatch = true;
		} else if (entry.marker === undefined) {
			sawEntry = true;
		}
	}
	return sawMatch ? "match" : sawEntry ? "mismatch" : "unknown";
}

/**
 * OpenSSH 显示的 `SHA256:…` 指纹：对 wire-format 公钥 blob 做 SHA-256 再 base64（去 `=`）。
 * 与 `ssh-keygen -lf`、首次连接提示里的指纹一致，用户可以直接对照。
 */
export function formatHostKeyFingerprint(keyBlob: Uint8Array): string {
	const digest = createHash("sha256").update(keyBlob).digest("base64").replace(/=+$/, "");
	return `SHA256:${digest}`;
}

/** 追加到应用自有 known_hosts 的一行；非 22 端口用 `[host]:port` 形式。 */
export function formatKnownHostLine(host: string, port: number, keyType: string, keyBase64: string): string {
	const hostField = port === 22 ? host : `[${host}]:${port}`;
	return `${hostField} ${keyType} ${keyBase64}`;
}

/** OpenSSH 语义：任一 `!pattern` 命中则整行不匹配，否则任一正模式命中即匹配。 */
function matchEntryPatterns(patterns: readonly string[], host: string, port: number): boolean {
	if (patterns.some((p) => p.startsWith("!") && matchHostPattern(p.slice(1), host, port))) return false;
	return patterns.some((pattern) => !pattern.startsWith("!") && matchHostPattern(pattern, host, port));
}

function matchHostPattern(pattern: string, host: string, port: number): boolean {
	if (pattern.startsWith("|1|")) return matchHashedPattern(pattern, host, port);
	if (pattern.startsWith("[")) {
		const close = pattern.indexOf("]:");
		if (close < 0) return false;
		return globMatch(pattern.slice(1, close), host) && pattern.slice(close + 2) === String(port);
	}
	// 非默认端口只匹配 `[host]:port` 条目：裸主机条目隐含 22。
	if (port !== 22) return false;
	return globMatch(pattern, host);
}

/**
 * `|1|salt|hash`：salt 与 hash 都是 base64，hash = HMAC-SHA1(salt, host字符串)。
 * 端口非 22 时被哈希的串是 `[host]:port`。
 */
function matchHashedPattern(pattern: string, host: string, port: number): boolean {
	const parts = pattern.split("|");
	// parts: ["", "1", salt, hash]
	if (parts.length !== 4 || parts[1] !== "1") return false;
	const salt = Buffer.from(parts[2], "base64");
	const expected = Buffer.from(parts[3], "base64");
	const hostString = port === 22 ? host : `[${host}]:${port}`;
	const actual = createHmac("sha1", salt).update(hostString, "utf8").digest();
	return actual.equals(expected);
}

function globMatch(pattern: string, value: string): boolean {
	const regex = new RegExp(
		`^${pattern
			.split("")
			.map((char) => {
				if (char === "*") return ".*";
				if (char === "?") return ".";
				return char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
			})
			.join("")}$`,
		"i",
	);
	return regex.test(value);
}
