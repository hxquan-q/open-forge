/**
 * ADR-0133 §2 fail-closed:沙箱不可用时要落到哪一种问题,便于按 kind 分流诊断。
 * 只保留 createToolSet 装配阶段实际可达的两种;tool 执行期的 spawn/授权失败
 * 属于各自工具的错误路径,不在这里冒充「沙箱不可用」。
 */
export type SandboxFailureKind = "platform-unsupported" | "asset-missing";

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
		// message 自带修复指引:宿主只要展示 error.message 用户就能看到下一步,
		// 不必依赖按类型分流;remediation 字段保留给需要程序化处理的调用方。
		super(
			[options.message, options.remediation].filter((part) => part !== undefined).join("\n"),
			options.cause === undefined ? undefined : { cause: options.cause },
		);
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
				`Sandbox backend failed to assemble. Install bwrap (Linux) or sandbox-exec (macOS), ` +
				`or set VETTA_WINDOWS_SANDBOX_HOST_PATH to codex-windows-sandbox-host.exe (Windows); ` +
				`see the original error above for what exactly failed to resolve.`
			);
	}
}
