// Copyright The Open Forge contributors.
/**
 * ac-fence 会话门（session gate）——PreToolUse/SubagentStart 的完整判定流，纯模块。
 *
 * 为什么存在：宿主事件不填充 subagent 字段（内核 EcosystemHookRuntimeHost.baseEvent 从不
 * 赋值，desktop 桥只透传），插件无法从事件体区分主/子会话。本模块用 sessionId 双查在
 * 插件侧重建会话身份，事实依据（内核代码，2026-10 核对）：
 *
 *   1. runtime-subagents/subagent-run.ts attachHandle：`snapshot.id = handle.sessionId`——
 *      SubagentStart 事件的 agentId **恒等于子会话 sessionId**，且注册（beforeStart）先于
 *      子代理第一次工具调用（runPrompt）。→ 「登记表按 sessionId 命中 = AC 子会话」。
 *   2. 主会话没有对等身份事件——用「认养」标记：spawn_agent 通过 AC 契约校验的会话
 *      标记为 AC 治理会话（SubagentStart 命中 pending 时补标父会话，双保险）。
 *   3. 两者都不命中 = 与流水线无关的会话（普通对话、其他 agent）→ 围栏完全静默。
 *      这同时修复了旧行为「isMainSession 恒真」导致的全 app 误伤：任何会话的 git 写
 *      被拦、任何会话的 spawn 被 AC 契约校验、fence-log 写进无关项目。
 *
 * 认养模型的取舍（有意为之，非疏漏）：
 * - 未识别会话里「校验失败的 spawn」静默放行——无法区分「主控契约拼错」与「无关 agent
 *   的普通 spawn（本就不带 task.scope）」，fail-open 不误伤后者；此类 spawn 的子会话
 *   不入登记表（未识别 → 静默），越权写入由事后 ac-audit 双链审计兜底（ac-pipeline §0.7）。
 * - dispatch_workflows 派生的子代理不经本门（非 spawn_agent 工具）——AC 流水线全程
 *   spawn_agent 派发，不受影响。
 * - 已知限制：SubagentStart 事件无 task_name/toolUseId 可与 spawn 对齐，bindAgentId 按
 *   agentType + FIFO 消费 pending——同型（如两个 general）并行 spawn 时 agentId 可能回填
 *   到错误契约（写域判定张冠李戴：一个子代理拿到另一个的 scope）。缓解：AC 流水线按依赖
 *   拓扑序串行派发为主；后续可由主控在任务书约定「同型 spawn 串行」消除窗口。
 *
 * I/O 纪律：判定路径纯内存（Map 查询 + glob）；fence-log 追加经注入的 io 回调
 * fire-and-forget。本模块不 import plugin-sdk（§8 备选约束，可被 CLI/测试直接复用）。
 */

import type { FenceLogEntry } from "./audit-log";
import { inputDigest } from "./audit-log";
import type { ContractStore } from "./contract-store";
import { judge, roleFromTaskName, type ToolCallShape } from "./judge";

/** PreToolUse 事件的最小生产形态（刻意不含 subagent 字段——生产事件就没有它）。 */
export interface PreToolUseEventShape {
	sessionId: string;
	cwd: string;
	toolUseId: string;
	tool: { hostName: string; kind: string };
	toolInput: unknown;
}

/**
 * 认养判据：spawn 是否为 AC 流水线派发。
 *
 * 仅 judgeMainSpawn 通过**不够**——内核 v1 契约对所有 spawn_agent 调用强制 scope 非空，
 * 而自然语言 scope（内核定义 scope 为 "modules, files, data, or questions"，叙述性描述
 * 是正常形态）也能通过非空 + 项目内检查；agent_type "general" 又是默认值。只看契约
 * 合法性会把几乎所有用了子代理功能的普通会话认养成 AC 主控（其 git 被拦、其子代理
 * 的自然语言 scope 匹配不到任何真实路径而全被拦）。
 *
 * 加一道 AC 侧标记：task_name 必须带角色前缀（ac-pipeline §0.2 规则 6 强制全前缀
 * 派发：req_/arch_/plan_/dev_/review_/wb_/bb_/dep_/fin_/help_/git_）——这是 AC 自己
 * 的纪律，普通用户的 api_trace 之类天然不带，两类会话区分度极高。
 */
function isAcPipelineSpawn(input: unknown): boolean {
	if (typeof input !== "object" || input === null) return false;
	const taskName = (input as Record<string, unknown>).task_name;
	if (typeof taskName !== "string" || taskName.trim() === "") return false;
	return roleFromTaskName(taskName.trim()) !== "unknown";
}

/** SubagentStart 事件的最小生产形态（在父会话的 hook runtime 上触发，sessionId = 父）。 */
export interface SubagentStartEventShape {
	sessionId: string;
	cwd: string;
	agentId: string;
	agentType: string;
}

export interface SessionGateIo {
	appendLog(project: string, entry: Omit<FenceLogEntry, "ts" | "project">): void;
}

export type HookAction = { action: "continue" } | { action: "block"; reason: string };

/** PreToolUse 完整判定流（fence.ts 的 handler 只是本函数的薄适配层）。 */
export function handlePreToolUse(store: ContractStore, io: SessionGateIo, event: PreToolUseEventShape): HookAction {
	const call: ToolCallShape = { toolKind: event.tool.kind, hostName: event.tool.hostName, input: event.toolInput };

	// ── 会话分类（sessionId 双查，不依赖事件体 subagent 字段）──
	const contract = store.lookupByAgentId(event.sessionId);
	const isSubagentSession = contract !== null;
	const isMainSession = !isSubagentSession && store.isGovernedSession(event.sessionId);

	// 无关会话：只做认养观察——带 AC 前缀且契约合法的 spawn 把本会话收编为治理会话，其余静默放行
	if (!isMainSession && !isSubagentSession) {
		if (call.hostName === "spawn_agent" && call.toolKind === "agent") {
			if (isAcPipelineSpawn(call.input) && judge(null, call, true).allow) {
				store.markGovernedSession(event.sessionId);
				store.registerSpawn(event.toolUseId, call.input);
			}
		}
		return { action: "continue" };
	}

	// 治理会话的 spawn：强校验（此时已确认是 AC 主控，契约不达标即 block）。
	// 先判后登记：被 block 的 spawn 不入表。
	if (isMainSession && call.hostName === "spawn_agent" && call.toolKind === "agent") {
		const verdict = judge(null, call, true);
		if (!verdict.allow) {
			io.appendLog(event.cwd, {
				sessionId: event.sessionId,
				tool: event.tool.hostName,
				inputDigest: inputDigest(call.toolKind, call.hostName, call.input),
				reason: verdict.reason ?? "(no reason)",
			});
			return { action: "block", reason: verdict.reason ?? "ac-fence: spawn rejected" };
		}
		store.registerSpawn(event.toolUseId, call.input);
		return { action: "continue" };
	}

	// 通用判定：子会话按契约（sessionId 即 agentId）；治理会话 contract 恒为 null
	const verdict = judge(isSubagentSession ? contract : null, call, isMainSession);
	if (verdict.allow) return { action: "continue" };

	io.appendLog(event.cwd, {
		sessionId: event.sessionId,
		// 子会话的 sessionId 就是 agentId（attachHandle 事实），落日志保持字段语义
		agentId: isSubagentSession ? event.sessionId : undefined,
		taskName: contract?.taskName,
		tool: event.tool.hostName,
		inputDigest: inputDigest(call.toolKind, call.hostName, call.input),
		reason: verdict.reason ?? "(no reason)",
	});
	return { action: "block", reason: verdict.reason ?? "ac-fence: blocked" };
}

/** SubagentStart 完整判定流：回填 agentId + 命中 pending 时补标父会话为治理会话。 */
export function handleSubagentStart(store: ContractStore, event: SubagentStartEventShape): void {
	const contract = store.bindAgentId(event.agentId, event.agentType);
	if (contract !== null) {
		// pending 命中说明该子代理来自一次通过校验的 AC spawn——其父会话即 AC 主控
		store.markGovernedSession(event.sessionId);
	}
	// state.md 兜底同步（fire-and-forget：子代理首个工具调用前通常有秒级窗口）
	store.scheduleStateSync(event.cwd);
}
