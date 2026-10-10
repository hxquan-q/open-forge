// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { ContractStore } from "../src/fence/contract-store";
import type { FenceLogEntry } from "../src/fence/audit-log";
import { handlePreToolUse, handleSubagentStart } from "../src/fence/session-gate";

/**
 * session-gate 生产形态测试——事件刻意不带 subagent 字段。
 *
 * 背景（外部审查 P0-1/P0-2 复核确认）：宿主 EcosystemHookRuntimeHost.baseEvent 从不填充
 * subagent 字段，生产 PreToolUse 事件里它恒为 undefined；旧 fence 按 `event.subagent ===
 * undefined` 判主会话导致所有子会话被误判。本组测试按**真实事件形态**（只有 sessionId）
 * 驱动完整判定流（handlePreToolUse/handleSubagentStart + 真实 ContractStore），覆盖：
 *   - 三类会话分类（AC 子会话 / AC 主控会话 / 无关会话）
 *   - 认养模型（首个合法 AC spawn 把会话收编为治理会话）
 *   - v0.5 环节级存档通道（git 子代理豁免）在生产事件形态下存活——P0-2 死锁的回归测试
 *   - 无关会话零误伤（git/spawn/写文件全放行）
 */

const MAIN = "session-main";
const CHILD = "session-child-dev-t1";
const GIT_CHILD = "session-child-git-1";
const STRANGER = "session-stranger";

const SHELL = { hostName: "bash", kind: "shell" } as const;
const EDIT = { hostName: "edit", kind: "file-edit" } as const;
const SPAWN = { hostName: "spawn_agent", kind: "agent" } as const;

function devT1SpawnInput(scope = "src/dto/**") {
	return {
		task_name: "dev_t1",
		agent_type: "general",
		task: { scope },
	};
}

function gitSpawnInput() {
	return {
		task_name: "git_archive_1",
		agent_type: "general",
		allow_git_write: true,
		task: { scope: "docs/ac/state.md" },
	};
}

interface Harness {
	store: ContractStore;
	logs: Array<Omit<FenceLogEntry, "ts" | "project">>;
	pre(sessionId: string, tool: { hostName: string; kind: string }, toolInput: unknown): {
		action: string;
		reason?: string;
	};
}

/** 完整生命周期装配：主控 spawn → SubagentStart → 子会话工具调用。 */
function harness(): Harness {
	const store = new ContractStore();
	const logs: Array<Omit<FenceLogEntry, "ts" | "project">> = [];
	const io = {
		appendLog: (_project: string, entry: Omit<FenceLogEntry, "ts" | "project">) => {
			logs.push(entry);
		},
	};
	const pre = (sessionId: string, tool: { hostName: string; kind: string }, toolInput: unknown) =>
		handlePreToolUse(store, io, { sessionId, cwd: "C:/proj", toolUseId: "tu-1", tool, toolInput });
	return { store, logs, pre };
}

/** 走完认养：未识别会话发一个合法 spawn → 成为治理会话。 */
function adoptMain(h: Harness, sessionId = MAIN) {
	const verdict = h.pre(sessionId, SPAWN, devT1SpawnInput());
	expect(verdict.action).toBe("continue");
	expect(h.store.isGovernedSession(sessionId)).toBe(true);
	return h;
}

/** 完整链：主控 spawn dev_t1 → SubagentStart（agentId = 子会话 sessionId）→ 返回子会话 harness。 */
function spawnChild(h: Harness, input: ReturnType<typeof devT1SpawnInput>, childSessionId: string): Harness {
	h.pre(MAIN, SPAWN, input);
	handleSubagentStart(h.store, {
		sessionId: MAIN,
		cwd: "C:/proj",
		agentId: childSessionId,
		agentType: "general",
	});
	return h;
}

describe("session classification (production event shapes, no subagent field)", () => {
	it("stranger sessions are fully silent — git write, spawn and file-edit all pass", () => {
		const h = harness();
		// git 写命令（旧实现里 isMainSession 恒真会被误拦——全 app 误伤回归）
		expect(h.pre(STRANGER, SHELL, { command: "git commit -m x" }).action).toBe("continue");
		// 内核 v1 契约的完整 spawn（真实生产形态：scope 非空、自然语言描述、无 AC 前缀）
		const kernelSpawn = {
			task_name: "api_trace",
			agent_type: "general",
			history: "分析用户鉴权流程",
			current_state: "会话中",
			objective: "梳理 auth 调用链",
			scope: "用户登录与鉴权相关的模块和数据",
			constraints: "只读分析",
			relevant_context: "无",
			deliverables: "调用链报告",
			validation: "覆盖主要入口",
			task: { scope: "用户登录与鉴权相关的模块和数据" },
		};
		const spawnVerdict = h.pre(STRANGER, SPAWN, kernelSpawn);
		expect(spawnVerdict.action).toBe("continue");
		// 认养判据（P1 修复回归）：契约合法但无 AC 角色前缀 → 不认养
		expect(h.store.isGovernedSession(STRANGER)).toBe(false);
		// 其子代理同样静默（自然语言 scope 若被认养会匹配不到任何路径而全拦——误伤源）
		handleSubagentStart(h.store, {
			sessionId: STRANGER,
			cwd: "C:/proj",
			agentId: "stranger-child",
			agentType: "general",
		});
		expect(h.pre("stranger-child", EDIT, { path: "src/auth/user.ts" }).action).toBe("continue");
		// 任意路径写文件
		expect(h.pre(STRANGER, EDIT, { path: "docs/ac/state.md" }).action).toBe("continue");
		expect(h.logs).toHaveLength(0);
	});

	it("adopts a session only when the spawn carries an AC role prefix", () => {
		const h = harness();
		// 无前缀 + 合法契约：不认养（上一用例已覆盖完整形态，这里锁最小判据）
		h.pre(STRANGER, SPAWN, { task_name: "api_trace", agent_type: "general", task: { scope: "src/**" } });
		expect(h.store.isGovernedSession(STRANGER)).toBe(false);
		// 有 AC 前缀 + 合法契约：认养
		h.pre(MAIN, SPAWN, devT1SpawnInput());
		expect(h.store.isGovernedSession(MAIN)).toBe(true);
	});

	it("adopts a session as governed on the first contract-valid AC spawn", () => {
		const h = harness();
		expect(h.pre(MAIN, SHELL, { command: "git commit -m x" }).action).toBe("continue"); // 认养前静默
		adoptMain(h);
		// 认养后：主会话规则生效——git 写被拦（打点权收口）
		const blocked = h.pre(MAIN, SHELL, { command: "git commit -m x" });
		expect(blocked.action).toBe("block");
	});

	it("invalid contract spawn from a governed session is blocked with reason", () => {
		const h = adoptMain(harness());
		const blocked = h.pre(MAIN, SPAWN, { task_name: "dev_t2", agent_type: "general", task: {} });
		expect(blocked.action).toBe("block");
		expect(blocked.reason).toContain("task.scope 为空");
		expect(h.logs).toHaveLength(1);
		expect(h.logs[0]?.tool).toBe("spawn_agent");
	});
});

describe("subagent enforcement via sessionId (the P0-1 fix)", () => {
	it("enforces contract scope on subagent file-edit — in-scope passes, out-of-scope blocks", () => {
		const h = spawnChild(adoptMain(harness()), devT1SpawnInput(), CHILD);
		expect(h.pre(CHILD, EDIT, { path: "src/dto/user.ts" }).action).toBe("continue");
		const blocked = h.pre(CHILD, EDIT, { path: "docs/ac/state.md" });
		expect(blocked.action).toBe("block");
		expect(blocked.reason).toContain("ac-fence：越权写");
		expect(h.logs.at(-1)?.taskName).toBe("dev_t1");
		expect(h.logs.at(-1)?.agentId).toBe(CHILD);
	});

	it("blocks subagent git write — commit history belongs to the conductor", () => {
		const h = spawnChild(adoptMain(harness()), devT1SpawnInput(), CHILD);
		const blocked = h.pre(CHILD, SHELL, { command: "git commit -m x" });
		expect(blocked.action).toBe("block");
		expect(blocked.reason).toContain("打点权在主控侧");
	});

	it("git subagent with allow_git_write exemption passes git write — P0-2 deadlock regression", () => {
		// 生产形态完整链：主控 spawn git_ 前缀子代理（带豁免）→ SubagentStart → 子会话 commit 放行。
		// 旧实现里豁免判定在不可达的子会话分支，commit 必被 block（v0.5 存档死锁）。
		// 独立 harness：避免与 dev_t1 的 general 型 pending 竞争 bindAgentId 的 FIFO 匹配
		//（SubagentStart 事件无 task_name，同型并行 spawn 的回填歧义是已知限制，见 session-gate 头注）。
		const h = harness();
		h.pre(MAIN, SPAWN, gitSpawnInput());
		handleSubagentStart(h.store, {
			sessionId: MAIN,
			cwd: "C:/proj",
			agentId: GIT_CHILD,
			agentType: "general",
		});
		expect(h.pre(GIT_CHILD, SHELL, { command: "git add -A" }).action).toBe("continue");
		expect(h.pre(GIT_CHILD, SHELL, { command: 'git commit -m "T1: dto 层实现"' }).action).toBe("continue");
		// 豁免只放行 git 写：写文件仍按契约 scope 判
		expect(h.pre(GIT_CHILD, EDIT, { path: "src/app.ts" }).action).toBe("block");
	});

	it("explorer reviewer is mechanically read-only — any file-edit blocks", () => {
		const h = adoptMain(harness());
		h.pre(MAIN, SPAWN, {
			task_name: "review_t1",
			agent_type: "explorer",
			task: { scope: "docs/ac/reviews.md" },
		});
		handleSubagentStart(h.store, {
			sessionId: MAIN,
			cwd: "C:/proj",
			agentId: "session-child-review",
			agentType: "explorer",
		});
		const blocked = h.pre("session-child-review", EDIT, { path: "docs/ac/reviews.md" });
		expect(blocked.action).toBe("block");
		expect(blocked.reason).toContain("explorer");
	});

	it("unregistered subagent-like session stays silent until state.md sync registers it", () => {
		// desktop 重启后：内存表空，子会话先静默（fail-open）；state.md 同步后恢复强制
		const h = harness();
		expect(h.pre(CHILD, EDIT, { path: "docs/ac/state.md" }).action).toBe("continue");
		h.store.markGovernedSession(MAIN);
		h.pre(MAIN, SPAWN, devT1SpawnInput());
		handleSubagentStart(h.store, {
			sessionId: MAIN,
			cwd: "C:/proj",
			agentId: CHILD,
			agentType: "general",
		});
		expect(h.pre(CHILD, EDIT, { path: "docs/ac/state.md" }).action).toBe("block");
	});

	it("SubagentStart back-fills the parent session as governed (second adoption path)", () => {
		// spawn 放行（认养路径 1）与 SubagentStart 补标（路径 2）双保险——即使认养观察被跳过
		const store = new ContractStore();
		store.registerSpawn("tu-9", devT1SpawnInput());
		handleSubagentStart(store, {
			sessionId: MAIN,
			cwd: "C:/proj",
			agentId: CHILD,
			agentType: "general",
		});
		expect(store.isGovernedSession(MAIN)).toBe(true);
		expect(store.lookupByAgentId(CHILD)?.taskName).toBe("dev_t1");
	});
});

describe("fence-log discipline", () => {
	it("never logs for silent stranger sessions, logs once per block elsewhere", () => {
		const h = spawnChild(adoptMain(harness()), devT1SpawnInput(), CHILD);
		h.pre(STRANGER, SHELL, { command: "git push" }); // 静默
		expect(h.logs).toHaveLength(0);
		h.pre(CHILD, SHELL, { command: "git push" }); // block
		expect(h.logs).toHaveLength(1);
		expect(h.logs[0]?.reason).toContain("ac-fence");
	});
});
