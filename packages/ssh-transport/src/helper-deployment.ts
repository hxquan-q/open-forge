// Modified by The Open Forge contributors.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	HELPER_PROTOCOL_VERSION,
	isCompatibleHelperVersion,
	SshHelperClient,
	type SshHelperHello,
} from "./helper-client.js";
import { quoteShellArgument } from "./remote-command.js";
import type { RemotePlatform, SshConnection } from "./ssh-connection.js";

export interface SshHelperTarget {
	readonly os: "linux" | "darwin";
	readonly arch: "amd64" | "arm64";
}

/** 给出某个远端平台对应的 helper 二进制在**本机**的路径；没有这个平台的构建时返回 undefined。 */
export type SshHelperBinaryResolver = (target: SshHelperTarget) => string | undefined;

export interface ConnectSshHelperOptions {
	readonly resolveBinary: SshHelperBinaryResolver;
	/** 每一步降级的原因。helper 是可选加速，失败不该打断用户，但得留下可查的痕迹。 */
	readonly onDiagnostic?: (message: string) => void;
	readonly handshakeTimeoutMs?: number;
}

const HANDSHAKE_TIMEOUT_MS = 15_000;

export function resolveSshHelperTarget(platform: RemotePlatform): SshHelperTarget | undefined {
	const os = /^linux$/i.test(platform.os) ? "linux" : /^darwin$/i.test(platform.os) ? "darwin" : undefined;
	const arch = /^(x86_64|amd64)$/i.test(platform.arch)
		? "amd64"
		: /^(aarch64|arm64)$/i.test(platform.arch)
			? "arm64"
			: undefined;
	return os && arch ? { os, arch } : undefined;
}

/** helper 建立结果的三态：成功 / 这台主机用不了（永久） / 临时失败（可恢复）。 */
export type SshHelperEstablishment =
	| { readonly status: "ready"; readonly client: SshHelperClient }
	| { readonly status: "unsupported"; readonly reason: string }
	| { readonly status: "transient-failure"; readonly reason: string };

/**
 * 把 helper 送到远端并连上它。失败分两类：
 * - `unsupported`：远端平台/架构不匹配、本机没有对应构建或协议版本不兼容——
 *   换个时间重试也不会变，调用方应按连接缓存「用不了」的结论。
 * - `transient-failure`：网络、上传、通道或握手的一时失败——允许有界恢复。
 *
 * 安装目录按**协议版本**命名，不按构建哈希（ADR-0124）。内容用 sha256 比对：同一协议版本
 * 下二进制被替换（修了个 bug）时会重新上传，而目录名不变，旧 helper 起的任务依然看得见——
 * 任务状态存在与版本无关的目录里。
 *
 * 各阶段耗时（probe/resolve/digest/upload/handshake）随诊断输出；不含主机地址、
 * 命令或凭据内容。
 */
export async function connectSshHelper(
	connection: SshConnection,
	options: ConnectSshHelperOptions,
): Promise<SshHelperEstablishment> {
	const note = (message: string): void => options.onDiagnostic?.(`[ssh-helper] ${connection.host.label}: ${message}`);
	const phases: { readonly name: string; readonly ms: number }[] = [];
	const startedAt = Date.now();
	const mark = (name: string, phaseStartedAt: number): void => {
		phases.push({ name, ms: Date.now() - phaseStartedAt });
	};
	const phaseSummary = (): string =>
		`${phases.map((phase) => `${phase.name} ${phase.ms}ms`).join(", ") || "no phases"}`;
	try {
		let phaseAt = startedAt;
		const target = resolveSshHelperTarget(await connection.probePlatform());
		mark("probe", phaseAt);
		if (!target) {
			note("unsupported remote platform; using ssh exec");
			return { status: "unsupported", reason: "unsupported remote platform" };
		}
		const localPath = options.resolveBinary(target);
		if (!localPath) {
			note(`no helper build for ${target.os}-${target.arch}; using ssh exec`);
			return { status: "unsupported", reason: `no helper build for ${target.os}-${target.arch}` };
		}
		phaseAt = Date.now();
		const binary = await readFile(localPath);
		const digest = createHash("sha256").update(binary).digest("hex");
		const home = await connection.resolveHomeDirectory();
		mark("resolve", phaseAt);
		const remoteHome = home.replace(/\/+$/, "");
		const directory = `${remoteHome}/.cache/openforge/helper/${HELPER_PROTOCOL_VERSION}`;
		const remotePath = `${directory}/openforge-ssh-helper`;

		phaseAt = Date.now();
		const needsUpload = (await remoteDigest(connection, remotePath)) !== digest;
		mark("digest", phaseAt);
		if (needsUpload) {
			phaseAt = Date.now();
			await connection.makeDirectory(directory);
			await connection.writeFile(remotePath, binary);
			await connection.exec(`chmod 700 ${quoteShellArgument(remotePath)}`);
			// 上传后再验一次：半截文件跑起来的报错与「这台机器不支持」无法区分。
			if ((await remoteDigest(connection, remotePath)) !== digest) {
				note("uploaded helper failed its checksum; using ssh exec");
				throw new Error("uploaded helper failed its checksum");
			}
			note(`installed helper ${HELPER_PROTOCOL_VERSION} (${target.os}-${target.arch})`);
			// 旧品牌的安装目录在新位置就位后清掉，避免在别人的机器上留孤儿目录。
			await connection.exec(`rm -rf ${quoteShellArgument(`${remoteHome}/.cache/vetta/helper`)}`);
			mark("upload", phaseAt);
		}

		phaseAt = Date.now();
		const client = SshHelperClient.attach((feed) => {
			const channel = connection.openChannel(`${quoteShellArgument(remotePath)} serve`, feed);
			if (!channel) throw new Error("this SSH runner cannot hold a channel open");
			return channel;
		});
		const hello = await withTimeout(
			client.call<SshHelperHello>("hello"),
			options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
		);
		mark("handshake", phaseAt);
		if (!isCompatibleHelperVersion(hello.protocolVersion)) {
			note(`helper speaks protocol ${hello.protocolVersion}, expected ${HELPER_PROTOCOL_VERSION}; using ssh exec`);
			client.close();
			return {
				status: "unsupported",
				reason: `helper protocol ${hello.protocolVersion} incompatible`,
			};
		}
		note(`helper ready in ${Date.now() - startedAt}ms (${phaseSummary()})`);
		return { status: "ready", client };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		note(`unavailable after ${Date.now() - startedAt}ms (${phaseSummary}); using ssh exec (${reason})`);
		return { status: "transient-failure", reason };
	}
}

async function remoteDigest(connection: SshConnection, remotePath: string): Promise<string | undefined> {
	const quoted = quoteShellArgument(remotePath);
	const chunks: Uint8Array[] = [];
	// Linux 有 sha256sum，macOS 只有 shasum；都没有就当作「需要上传」。
	const result = await connection.exec(
		`sha256sum -- ${quoted} 2>/dev/null || shasum -a 256 -- ${quoted} 2>/dev/null`,
		{
			onStdout: (chunk) => chunks.push(chunk),
		},
	);
	if (result.exitCode !== 0) return undefined;
	// 登录 shell 的 profile 可能往 stdout 打横幅，所以按形状找摘要，不假定它在第一行。
	return /\b[0-9a-f]{64}\b/.exec(Buffer.concat(chunks).toString("utf8"))?.[0];
}

function withTimeout<Value>(promise: Promise<Value>, timeoutMs: number): Promise<Value> {
	return new Promise<Value>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`no handshake within ${timeoutMs}ms`)), timeoutMs);
		timer.unref?.();
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}
