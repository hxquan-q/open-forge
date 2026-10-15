// Copyright The Open Forge contributors.
/**
 * ac-fence 事中拦截层（ac-fence-spec §6）——插件 hook 路径（主路径）。
 *
 * 主控 spawn 的每个子代理，其工具调用（写文件/跑命令/再 spawn）在执行前按「任务契约 scope」判定，
 * 越权即 block（reason 含 help_protocol 指引）。拦截走 plugin-sdk registerHook + PreToolUse 事件，
 * 不走 .vetta/extensions 扩展事件（desktop GUI 未接线；备选见 spec §8，本期不做）。
 *
 * 接线纪律（§6）：
 * - 单 PreToolUse hook 内分流（spawn 登记 vs 通用判定），减少注册面与事件分发开销。
 * - handler 全程同步（判定纯内存，禁止 await I/O——fail-open + 3s 超时纪律下 I/O 是超时源）；
 *   fence-log 追加与 state.md 兜底读取均 fire-and-forget。
 * - 插件 bundle 运行在宿主 renderer realm：**一切文件 I/O 走 ctx.fs**（宿主中转），不用 node:fs。
 * - 权限缺失自检：registerHook 是 warn+noop（agent.hooks.register/agent.hookHandler.execute 未授权时
 *   静默失效），activate 里打 [ac-fence] 前缀注册成功日志（desktop 日志可见，README 写明排查方法）。
 */

import type { PluginActivationCleanup, PluginContext } from "@vetta-org/plugin-sdk";
import { createFenceLogAppender, type FenceLogIo } from "./fence/audit-log";
import { ContractStore, type StateFileLike } from "./fence/contract-store";
import { handlePreToolUse, handleSubagentStart } from "./fence/session-gate";

const FENCE_LOG_PREFIX = "[ac-fence]";

/** ctx.fs → FenceLogIo（宿主 fs API 没有 appendFile，追加语义由 audit-log 内部实现）。 */
function fenceLogIoFromCtx(ctx: PluginContext): FenceLogIo {
	return {
		readFile: async (path) => {
			const result = await ctx.fs.readFile(path);
			return result.content;
		},
		writeFile: async (path, content) => {
			await ctx.fs.writeFile(path, content);
		},
		createDirectory: async (path) => {
			await ctx.fs.createDirectory(path);
		},
		stat: async (path) => {
			const result = await ctx.fs.stat(path);
			return result === null ? null : { size: result.size };
		},
	};
}

export function activateFence(ctx: PluginContext): PluginActivationCleanup {
	const store = new ContractStore();
	const appendFenceLog = createFenceLogAppender(fenceLogIoFromCtx(ctx));
	const gate = { appendLog: appendFenceLog };

	// state.md 兜底读取器（ctx.fs；JSON parse 失败/文件缺失 → null，静默跳过）
	store.bindStateReader(async (cwd) => {
		const result = await ctx.fs.readFile(`${cwd}/docs/ac/state.md`).catch(() => null);
		if (result === null) return null;
		try {
			return JSON.parse(result.content) as StateFileLike;
		} catch {
			return null;
		}
	});

	// 判定流在 session-gate.ts（纯模块，按生产事件形态可测）；本文件只是 hook 装配层。
	// 会话分类不依赖事件体 subagent 字段（宿主从不填充）——sessionId 双查见 session-gate 头注。
	//
	// toolNames 过滤面（IPC 开销治理，ac-slowdown-diagnosis §4/§8-2）：围栏只对写语义与
	// blackbox 窄读域相关的宿主工具做判定，其余工具（todo/list_agents/browser_tab/读类……）
	// 旧实现恒放行却仍付一次 main→renderer IPC 往返（含完整 toolInput 序列化）——长流水
	// 里按调用量线性收税。SDK 的 toolNames 让宿主在 adapter 层就跳过这些事件的分发。
	const preToolUse = ctx.agent.registerHook({
		id: "ac-fence-pre-tool-use",
		eventName: "PreToolUse",
		// 主控会话与项目会话都拦；只匹配围栏有判定语义的工具（write/edit=bash/shell/spawn_agent
		// + blackbox 读域过滤的 read/grep/glob/ls/dir_tree/find）
		scope_use: ["conversation", "project"],
		toolNames: [
			"write",
			"edit",
			"bash",
			"shell",
			"spawn_agent",
			"read",
			"grep",
			"glob",
			"ls",
			"dir_tree",
			"find",
		],
		timeoutMs: 3000,
		handler({ event }) {
			if (event.eventName !== "PreToolUse") return { action: "continue" };
			return handlePreToolUse(store, gate, {
				sessionId: event.sessionId,
				cwd: event.cwd,
				toolUseId: event.toolUseId,
				tool: { hostName: event.tool.hostName, kind: event.tool.kind },
				toolInput: event.toolInput,
			});
		},
	});

	const subagentStart = ctx.agent.registerHook({
		id: "ac-fence-subagent-start",
		eventName: "SubagentStart",
		scope_use: ["conversation", "project"],
		timeoutMs: 3000,
		handler({ event }) {
			if (event.eventName !== "SubagentStart") return { action: "continue" };
			handleSubagentStart(store, {
				sessionId: event.sessionId,
				cwd: event.cwd,
				agentId: event.agentId,
				agentType: event.agentType,
			});
			return { action: "continue" };
		},
	});

	// 注册痕迹：desktop 日志可查（registerHook 缺权限是 warn+noop 静默失效——
	// 看不到这行 = 围栏没挂上，去插件设置页授权 agent.hooks.register + agent.hookHandler.execute）
	console.info(`${FENCE_LOG_PREFIX} hooks registered (PreToolUse + SubagentStart), fence active.`);

	return () => {
		preToolUse.dispose();
		subagentStart.dispose();
		console.info(`${FENCE_LOG_PREFIX} hooks disposed, fence inactive.`);
	};
}
