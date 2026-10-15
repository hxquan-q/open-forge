import type { CodingToolRegistration } from "@vetta/runtime-tools";
import type { CodingAgentSandboxEnvironment } from "../../composition/contracts/session-execution-environment.js";
import type { CodingAgentSandboxAuthorizationPort } from "./authorization-contract.js";
import { formatSandboxRemediation, SandboxUnavailableError } from "./errors.js";
import { createSandboxToolRegistrations } from "./tool-utils.js";

/** ADR-0133 §2:sandbox 模式的环境探头,避免 sandbox policy 直接读 Node 全局。 */
export interface CodingAgentSandboxEnvironmentHostInfo {
	/** 当前 OS 平台标识(如 darwin/linux/win32);由 session runtime 默认构造,测试可显式替换。 */
	readonly platform: string;
	/** 是否允许 fail-open(ADR-0133 §2 escape hatch);由 session runtime 读取 VETTA_SANDBOX_FAIL_OPEN 决定。 */
	readonly allowFailOpen: boolean;
	/** fail-open 时向诊断通道写 warning 的回调。 */
	readonly warn: (message: string) => void;
}

export interface CodingAgentSandboxToolsOptions {
	readonly cwd: string;
	readonly authorization: CodingAgentSandboxAuthorizationPort;
	readonly windowsSandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
	readonly getSessionId?: () => string | undefined;
	readonly environment: CodingAgentSandboxEnvironment;
	/** ADR-0133 §2:环境探头;缺失时视为 fail-closed 严格模式。 */
	readonly hostInfo?: CodingAgentSandboxEnvironmentHostInfo;
}

/** 组装 Runtime 原生工具合同与宿主提供的 OS sandbox 命令操作。 */
export function createCodingAgentSandboxToolRegistrations(
	options: CodingAgentSandboxToolsOptions,
): readonly CodingToolRegistration[] {
	let toolSet: ReturnType<CodingAgentSandboxEnvironment["createToolSet"]>;
	try {
		toolSet = options.environment.createToolSet({
			windowsSandboxHostPath: options.windowsSandboxHostPath,
			linuxBubblewrapPath: options.linuxBubblewrapPath,
			macosSandboxExecPath: options.macosSandboxExecPath,
		});
	} catch (error) {
		// ADR-0133 §2:createToolSet 在装配阶段同步解析 bwrap / sandbox-exec / Windows
		// sandbox host 与 shell 路径;此阶段的任何失败都意味着环境给不出沙箱工具集,
		// 统一归类 asset-missing 并把原始错误留在 cause(修复指引会提示看 cause 详情)。
		if (error instanceof SandboxUnavailableError) throw error;
		throw new SandboxUnavailableError({
			kind: "asset-missing",
			message: `OS sandbox backend is unavailable: ${error instanceof Error ? error.message : String(error)}`,
			platform: options.hostInfo?.platform ?? "unknown",
			remediation: formatSandboxRemediation("asset-missing", options.hostInfo?.platform ?? "unknown"),
			cause: error,
		});
	}
	if (!toolSet) {
		// ADR-0133 §2:toolSet 缺失意味着 OS 沙箱不可用,不允许"以残缺工具集继续",
		// 否则调用方 buildModeRegistrations 会替换成仅含 task_* 的死工具集。
		const hostInfo = options.hostInfo;
		if (hostInfo?.allowFailOpen === true) {
			hostInfo.warn("[vetta-sandbox] sandbox unavailable, running without OS-level containment");
			return [];
		}
		const platform = hostInfo?.platform ?? "unknown";
		throw new SandboxUnavailableError({
			kind: "platform-unsupported",
			message:
				"OS sandbox is not available on this platform or environment; refusing to fall back to a partial toolset.",
			platform,
			remediation: formatSandboxRemediation("platform-unsupported", platform),
		});
	}
	return createSandboxToolRegistrations({
		cwd: options.cwd,
		authorization: options.authorization,
		getSessionId: options.getSessionId,
		toolSet,
	});
}
