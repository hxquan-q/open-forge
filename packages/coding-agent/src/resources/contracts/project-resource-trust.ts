// Modified by The Open Forge contributors.

/**
 * 工作区信任门禁（GHSA-mqxh-6gq7-558m，对齐上游 pi 0.79 project trust）。
 *
 * 项目级资源（`<cwd>/.vetta` 下的 packages/extensions/skills/prompts/themes）
 * 会执行代码；未经信任确认前不得加载。域层只认这个窄端口，交互策略
 * （桌面对话框）与非交互策略（默认拒绝 + 显式开关）由各组合根注入。
 */

/**
 * 项目资源加载的信任授权名（对齐工具审批 `tool:<name>` 的命名空间先例）。
 * 持久化载体是 `.vetta-local/trust.json`（NodeProjectTrustStore）。
 */
export const PROJECT_RESOURCE_TRUST_CAPABILITY = "resources:project-load";

export interface ProjectResourceTrustDecision {
	readonly trusted: boolean;
	/** 结构化原因，用于诊断与日志（trusted / no-port / env-override / non-interactive-untrusted / user-denied / trust-once / …）。 */
	readonly reason: string;
}

export interface ProjectResourceTrustPort {
	/**
	 * 判定是否允许加载 `cwd` 下 `<cwd>/.vetta` 的项目级资源。
	 * 实现必须快速返回且不得抛出（异常语义：调用方按拒绝处理并记录诊断）。
	 */
	decideProjectResourceTrust(cwd: string): Promise<ProjectResourceTrustDecision>;
}
