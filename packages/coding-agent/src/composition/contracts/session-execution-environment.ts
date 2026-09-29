import type { RuntimeConfigurationSnapshotSource } from "@vetta/runtime-core/configuration";
import type {
	SandboxPermissionRequest,
	SandboxSessionGrantEntry,
	SandboxShellGrant,
} from "@vetta/runtime-core/sandbox";
import type { BackgroundCommandService, CodingToolRegistration } from "@vetta/runtime-tools";
import type { ConversationScenario } from "../../profiles/index.js";

export interface CodingAgentSandboxWorkspacePathAccess {
	readonly allowed: boolean;
	readonly workspaceRoot: string;
	readonly targetPath: string;
	readonly targetBoundary: string;
}

export interface CodingAgentSandboxHostServices {
	resolveWorkspacePathAccess(
		requestedPath: string,
		workspaceCwd: string,
	): Promise<CodingAgentSandboxWorkspacePathAccess>;
	assertPathNotDenied(targetPath: string, toolName: string): void;
	collectShellWritePermissionRequests(command: string, cwd: string): SandboxPermissionRequest[];
	isDeniedPath(targetPath: string): boolean;
	findSessionGrant(sessionId: string, request: SandboxPermissionRequest): SandboxSessionGrantEntry | undefined;
	addSessionGrant(sessionId: string, request: SandboxPermissionRequest): SandboxSessionGrantEntry;
	runWithShellGrant<T>(cwd: string, grant: SandboxShellGrant, callback: () => Promise<T>): Promise<T>;
}

export interface CodingAgentSandboxHostOptions {
	readonly windowsSandboxHostPath?: string;
	readonly linuxBubblewrapPath?: string;
	readonly macosSandboxExecPath?: string;
}

export interface CodingAgentSandboxToolSet {
	readonly read: CodingToolRegistration;
	readonly write: CodingToolRegistration;
	readonly edit: CodingToolRegistration;
	readonly command: CodingToolRegistration;
	readonly hostServices: CodingAgentSandboxHostServices;
}

export interface CodingAgentSandboxEnvironment {
	createToolSet(options: CodingAgentSandboxHostOptions): CodingAgentSandboxToolSet | undefined;
	/**
	 * ADR-0133 §5(TM-07):执行模式切换时清空该会话的 sandbox grant 缓存。
	 * 旧 mode 下批准过的越界授权不得带入新 mode;缺省实现视为无可清缓存(如远程会话)。
	 */
	clearSessionGrants?(sessionId: string): void;
}

export interface CodingAgentSessionExecutionEnvironmentContext {
	readonly sessionId: string;
	readonly cwd: string;
	readonly agentDir?: string;
	readonly scenario: ConversationScenario;
	readonly env?: Readonly<Record<string, string>>;
	readonly configurationSource?: RuntimeConfigurationSnapshotSource;
	/**
	 * 当前会话真实可调用的技能名。会话文件工具的二进制读提示据此决定「能不能点名某个技能」；
	 * 缺省表示宿主无法确认，提示侧一律按「没有可用技能」处理（绝不自造技能名）。
	 */
	readonly availableSkillNames?: () => ReadonlySet<string> | undefined;
}

/** Session 独占的命令 Tool 与后台任务宿主；任务控制 Tool、产品模式和激活策略不属于该环境。 */
export interface CodingAgentSessionExecutionEnvironment {
	readonly registrations: readonly CodingToolRegistration[];
	readonly backgroundService: BackgroundCommandService;
	readonly sandbox: CodingAgentSandboxEnvironment;
	dispose(): void | Promise<void>;
}

export type CodingAgentSessionExecutionEnvironmentFactory = (
	context: CodingAgentSessionExecutionEnvironmentContext,
) => CodingAgentSessionExecutionEnvironment | Promise<CodingAgentSessionExecutionEnvironment>;
