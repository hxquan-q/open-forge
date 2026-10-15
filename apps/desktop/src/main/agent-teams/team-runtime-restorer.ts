// Modified by The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";
import type { SessionConfig } from "@vetta/runtime-core";

export interface TeamRuntimeResumeHost {
	getSessionPath(sessionId: string): string | undefined;
	createSession(config: SessionConfig): Promise<{ sessionId: string }>;
	disposeSession(sessionId: string): Promise<void>;
}

export interface TeamRuntimeRestoreLogger {
	info(message: string, context: Record<string, unknown>): void;
	error(message: string, context: Record<string, unknown>): void;
}

export interface TeamRuntimeResumeConfig<TRuntimeTool> {
	readonly memberId: string;
	readonly cwd: string;
	readonly sessionPath: string;
	readonly runtimeTools: readonly TRuntimeTool[];
}

export interface TeamRuntimeResolvedConfig {
	readonly config: SessionConfig;
	readonly agentProfileId: string;
	readonly agentProfileRevision: number;
	readonly assignmentFingerprint?: string;
	readonly rosterFingerprint?: string;
}

export async function restoreTeamMemberRuntimes<TRuntimeTool>(input: {
	readonly session: TeamSessionDocument;
	readonly runtime: TeamRuntimeResumeHost;
	readonly createRuntimeTools: () => readonly TRuntimeTool[];
	readonly resolveConfig: (config: TeamRuntimeResumeConfig<TRuntimeTool>) => Promise<TeamRuntimeResolvedConfig>;
	readonly persist: (session: TeamSessionDocument) => Promise<void>;
	readonly now?: () => number;
	readonly logger: TeamRuntimeRestoreLogger;
}): Promise<TeamSessionDocument> {
	const restoredRuntime = { ...input.session.memberRuntime };
	let changed = false;
	// 成员级失败隔离（BUG-0093）：任一成员恢复失败（典型为跨实例会话文件锁
	// 竞争超时）不再整体回滚——成功成员保留，失败成员保留旧 memberRuntime
	// 条目（与重启未恢复同语义，下次冷加载自动重试），会话照常加载。
	const results = await Promise.allSettled(
		Object.entries(input.session.memberRuntime).map(async ([memberId, runtimeState]) => {
			const activePath = input.runtime.getSessionPath(runtimeState.sessionId);
			if (activePath) {
				if (activePath !== runtimeState.sessionPath) {
					throw new Error(`Runtime session id is already bound to another path: ${runtimeState.sessionId}`);
				}
				return { memberId, runtimeState, changed: false };
			}

			const resolved = await input.resolveConfig({
				memberId,
				cwd: input.session.cwd,
				sessionPath: runtimeState.sessionPath,
				runtimeTools: input.createRuntimeTools(),
			});
			const created = await input.runtime.createSession(resolved.config);
			try {
				const sessionPath = input.runtime.getSessionPath(created.sessionId);
				if (sessionPath !== runtimeState.sessionPath) {
					throw new Error(`Restored team member session path changed: ${memberId}`);
				}
				input.logger.info("team member runtime restored", {
					teamSessionId: input.session.id,
					memberId,
					runtimeSessionId: created.sessionId,
				});
				return {
					memberId,
					runtimeState: {
						...runtimeState,
						sessionId: created.sessionId,
						sessionPath,
						agentProfileId: resolved.agentProfileId,
						agentProfileRevision: resolved.agentProfileRevision,
						assignmentFingerprint: resolved.assignmentFingerprint,
						rosterFingerprint: resolved.rosterFingerprint,
					},
					changed:
						created.sessionId !== runtimeState.sessionId ||
						runtimeState.agentProfileId !== resolved.agentProfileId ||
						runtimeState.agentProfileRevision !== resolved.agentProfileRevision ||
						runtimeState.assignmentFingerprint !== resolved.assignmentFingerprint ||
						runtimeState.rosterFingerprint !== resolved.rosterFingerprint,
				};
			} catch (error) {
				// 该成员自己创建的半成品 runtime 由本分支回收（替代旧的全局回滚）。
				await input.runtime.disposeSession(created.sessionId).catch(() => undefined);
				throw error;
			}
		}),
	);
	for (const [index, result] of results.entries()) {
		const memberId = Object.keys(input.session.memberRuntime)[index] ?? "unknown";
		if (result.status === "rejected") {
			input.logger.error("team member runtime restore failed", {
				teamSessionId: input.session.id,
				memberId,
				error: errorMessage(result.reason),
			});
			continue;
		}
		restoredRuntime[result.value.memberId] = result.value.runtimeState;
		changed ||= result.value.changed;
	}

	if (!changed) return input.session;
	const restored: TeamSessionDocument = {
		...input.session,
		revision: input.session.revision + 1,
		updatedAt: (input.now ?? Date.now)(),
		memberRuntime: restoredRuntime,
	};
	await input.persist(restored);
	return restored;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
