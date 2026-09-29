import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import {
	buildControlPath,
	classifySshPrompt,
	createNodeSshProcessRunner,
	createSsh2ProcessRunner,
	type SshConnection,
	SshConnectionManager,
	type SshConnectionStatus,
	type SshProcessRunner,
} from "@vetta/ssh-transport";
import { readConfigSync } from "../config/desktop-config-store.js";
import { getAppLogger } from "../logger.js";
import { resolveAskpassEnvironment, resolveSshPrompt } from "./askpass-runtime.js";
import { resolveSshHelperBinary } from "./helper-assets.js";
import { broadcastSshHostStatus } from "./ssh-events.js";
import { createSshHostKeyVerifier } from "./ssh-hostkey-verifier.js";

const log = getAppLogger("ssh");

let manager: SshConnectionManager | undefined;

/**
 * ControlMaster socket 的存放目录。
 *
 * 这是个 Unix domain socket 路径，`sun_path` 在 macOS 上只有 104 字节。优先放在
 * Open Forge 主目录下（通常很短），但用户的家目录可能很长——例如域账号或中文用户名——
 * 那时退回 `/tmp`。两者都超长时 buildControlPath 会抛，让失败在连接前就暴露出来，
 * 而不是变成一次原因完全看不出的连接超时。
 */
function resolveControlDirectory(): string {
	const candidates = [join(getVettaHomePath(), "ssh"), join(tmpdir(), "vetta-ssh")];
	for (const candidate of candidates) {
		try {
			mkdirSync(candidate, { recursive: true, mode: 0o700 });
			// 先用一个样例 id 验长度，避免建完目录才发现每次连接都超长。
			buildControlPath(candidate, "probe");
			return candidate;
		} catch {
			// 建不出来或路径太长，试下一个候选。
		}
	}
	throw new Error("Unable to create a short-enough SSH control socket directory.");
}

function resolveHostLabel(hostId: string): string {
	return readConfigSync().sshHosts?.find((host) => host.id === hostId)?.label ?? hostId;
}

/**
 * Windows 上走进程内 ssh2 传输：OpenSSH 的 ControlMaster 多路复用依赖 unix fd 传递，
 * MSYS2 与 Win32-OpenSSH 都过不去（BUG-0049），每条命令都会在 mux 握手处死掉。
 * ssh2 的 Client 本身就是多路复用传输，认证、主机密钥确认和凭据提示经同一套
 * prompt service 接到界面上。
 *
 * 其余平台维持系统 OpenSSH：`~/.ssh/config` 的完整解析、ProxyCommand、FIDO 等都由
 * 它原生承担，没有理由换。
 */
function createPlatformRunner(): SshProcessRunner {
	if (process.platform !== "win32") return createNodeSshProcessRunner();
	return createSsh2ProcessRunner({
		// argv 里是 target 不是 hostId：按 target 反查主机。
		resolveHost: (target) => readConfigSync().sshHosts?.find((host) => host.target === target),
		verifyHostKey: createSshHostKeyVerifier({
			ask: (request) => resolveSshPrompt(request, resolveHostLabel),
		}),
		askSecret: async (request) => {
			const answer = await resolveSshPrompt(
				{
					hostId: request.hostId,
					// keyboard-interactive 的提示文本要自己分类——2FA 验证码不该被记住。
					kind: request.kind === "keyboard-interactive" ? classifySshPrompt(request.prompt) : request.kind,
					prompt: request.prompt,
					round: request.round,
				},
				resolveHostLabel,
			);
			return answer.ok ? (answer.value ?? "") : undefined;
		},
		// OpenSSH for Windows 的 agent 走命名管道；MSYS 的 SSH_AUTH_SOCK 优先级更高。
		agentPath: process.env.SSH_AUTH_SOCK ?? "\\\\.\\pipe\\openssh-ssh-agent",
		logger: (line) => log.info(line),
	});
}

/**
 * 进程内唯一的 SSH 连接管理器。
 *
 * 单例是必须的：ControlMaster 的复用以 socket 路径为准，而路径由 hostId 推导。
 * 多个管理器实例会各自缓存平台探测结果和连接状态，UI 显示的状态就会和实际执行
 * 用的那条连接对不上。
 */
export function getSshConnectionManager(): SshConnectionManager {
	manager ??= new SshConnectionManager({
		runner: createPlatformRunner(),
		controlDirectory: resolveControlDirectory(),
		// 同步读配置：连接可能在任意一次工具调用中途建立，异步读会让这里变成一个
		// 需要在每个调用点 await 的入口。
		resolveHost: (hostId) => readConfigSync().sshHosts?.find((host) => host.id === hostId),
		// 口令、私钥密码、2FA 和首次主机指纹确认都靠它接到界面上；缺了这套环境变量，
		// 这些连接只会挂到超时。ssh2 传输不读 env——提示经 resolveSshPrompt 直进服务。
		resolveEnv:
			process.platform === "win32" ? undefined : (hostId) => resolveAskpassEnvironment(hostId, resolveHostLabel),
		helper: {
			resolveBinary: resolveSshHelperBinary,
			// helper 起不来不影响使用，但要能查：否则「后台任务断线就没了」无从解释。
			onDiagnostic: (message) => log.info(message),
		},
		onTrace: ({ command, output }) => {
			// 远端有输出却一条都解析不出：多半是远端的 stat 输出格式与预期不符。
			// 界面只会显示「没有子目录」，不记下来就无从查起。
			log.warn("remote directory listing parsed to nothing", { command, output });
		},
		onStatusChanged: broadcastSshHostStatus,
	});
	return manager;
}

export function getSshConnection(hostId: string): SshConnection {
	return getSshConnectionManager().connection(hostId);
}

export function getSshHostStatus(hostId: string): SshConnectionStatus {
	return getSshConnectionManager().getStatus(hostId);
}
