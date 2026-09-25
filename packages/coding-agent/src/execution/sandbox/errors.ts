/** ADR-0133 §2 fail-closed:沙箱不可用时要落到哪一种问题,便于按 kind 分流诊断。 */
export type SandboxFailureKind =
	| "platform-unsupported"
	| "asset-missing"
	| "spawn-wrap-failed"
	| "iam-unavailable"
	| "grant-conflict";

export interface SandboxUnavailableErrorOptions {
	readonly kind: SandboxFailureKind;
	readonly message: string;
	readonly platform: string;
	readonly remediation?: string;
	/** 触发映射的原始错误(如 binary 解析失败),保留给诊断链路。 */
	readonly cause?: unknown;
}

export class SandboxUnavailableError extends Error {
	readonly kind: SandboxFailureKind;
	readonly platform: string;
	readonly remediation?: string;

	constructor(options: SandboxUnavailableErrorOptions) {
		super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "SandboxUnavailableError";
		this.kind = options.kind;
		this.platform = options.platform;
		this.remediation = options.remediation;
	}
}

/** 用户/开发者读到的修复说明。集中在这一处,保证 UI/CLI 文案一致。 */
export function formatSandboxRemediation(kind: SandboxFailureKind, platform: string): string {
	switch (kind) {
		case "platform-unsupported":
			return (
				`Sandbox mode is not supported on ${platform}. ` +
				`Switch to full-access, or run on macOS/Linux/Windows. ` +
				`Reference: docs/adr/0133-sandbox-threat-model-fail-closed-and-als-boundaries.md.`
			);
		case "asset-missing":
			return (
				`Sandbox binary not found. Install bwrap (Linux), sandbox-exec (macOS), ` +
				`or set VETTA_WINDOWS_SANDBOX_HOST_PATH to codex-windows-sandbox-host.exe.`
			);
		case "spawn-wrap-failed":
			return "The OS sandbox accepted the launch request but failed to start the sandboxed child.";
		case "iam-unavailable":
			return "Sandbox authorization port is not registered in this session's extension composition.";
		case "grant-conflict":
			return "The requested grant conflicts with a denied path (deny path always wins over session grants).";
	}
}
