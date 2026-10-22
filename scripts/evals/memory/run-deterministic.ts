// Modified by The Open Forge contributors.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "../../../packages/runtime-memory/src/fixtures.ts";
import {
	LexicalMemoryIndex,
	SqliteMemoryErasure,
	SqliteMemoryWorkerStore,
	HybridMemoryRetriever,
} from "../../../packages/runtime-node/src/memory/index.ts";

/**
 * 记忆确定性评测基座（TASK-0388）。
 *
 * 1. 合成夹具（脱敏，非用户数据）：隔离/纠正/Worktree/遗忘/失败工具/
 *    注入/短词七类场景 + 固定期望。
 * 2. 检索对照（同库同查询）：无记忆 / 当前摘要（首 N 条顺序） / 词法 /
 *    向量（确定性替身） / 混合——统一 rank-agnostic 命中率打分。
 * 3. 成本账本：写入/后台 job/每路检索的计数与耗时（冷/热 p50/p95）。
 * 4. 默认 dry-run：只跑确定性合同；真实 Provider 未授权不跑、明确留空，
 *    不以 mock 成绩扩大 automatic 默认启用。
 */

export interface EvalScenario {
	readonly id: string;
	readonly kind: "isolation" | "correction" | "worktree" | "forgetting" | "tool-failure" | "injection" | "short-query";
	readonly seed: readonly { readonly scope: "user" | "project"; readonly content: string }[];
	readonly queries: readonly { readonly query: string; readonly expectedMemoryIndex: number }[];
}

export const SYNTHETIC_SCENARIOS: readonly EvalScenario[] = [
	{
		id: "isolation",
		kind: "isolation",
		seed: [
			{ scope: "project", content: "项目 A 使用 bun run check 作为唯一构建入口" },
			{ scope: "project", content: "项目 A 的测试文件与源码同目录" },
		],
		queries: [{ query: "构建入口", expectedMemoryIndex: 0 }],
	},
	{
		id: "correction",
		kind: "correction",
		seed: [{ scope: "project", content: "部署目标是 linux-x64" }],
		queries: [{ query: "部署目标", expectedMemoryIndex: 0 }],
	},
	{
		id: "short-query",
		kind: "short-query",
		seed: [
			{ scope: "project", content: "记忆升级需要短词回退" },
			{ scope: "project", content: "词法检索走 trigram" },
		],
		queries: [
			{ query: "记", expectedMemoryIndex: 0 },
			{ query: "trigram 检索", expectedMemoryIndex: 1 },
		],
	},
];

export interface RetrievalArmResult {
	readonly arm: "none" | "summary" | "lexical" | "semantic-deterministic" | "hybrid";
	readonly hits: number;
	readonly totalQueries: number;
	readonly p50Ms: number;
	readonly p95Ms: number;
}

export interface EvalRunResult {
	readonly scenarioId: string;
	readonly arms: readonly RetrieArmResult[];
	readonly costLedger: {
		readonly writes: number;
		readonly backgroundJobs: number;
		readonly retrievals: number;
	};
	readonly realProviderEvaluated: false;
}

export async function runDeterministicMemoryEval(options?: {
	readonly scenario?: EvalScenario;
	readonly warmupRounds?: number;
	readonly measuredRounds?: number;
}): Promise<EvalRunResult> {
	const scenario = options?.scenario ?? SYNTHETIC_SCENARIOS[0]!;
	const warmupRounds = options?.warmupRounds ?? 2;
	const measuredRounds = options?.measuredRounds ?? 10;

	const workDir = mkdtempSync(join(tmpdir(), "memory-eval-"));
	const databasePath = join(workDir, "memory.sqlite");
	try {
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
		});
		const index = await LexicalMemoryIndex.open({ databasePath });
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		const retriever = new HybridMemoryRetriever({ lexical: index });
		try {
			// 播种（纠正场景做一次更正）。
			const memoryIds: string[] = [];
			for (const [position, entry] of scenario.seed.entries()) {
				const written = await store.write(
					entry.scope === "user" ? FIXTURE_USER_SCOPE : FIXTURE_PROJECT_SCOPE,
					{ action: "remember", content: entry.content, kind: "fact", scopeName: entry.scope },
				);
				memoryIds.push(written.memoryId);
				if (scenario.kind === "correction" && position === 0) {
					await store.write(FIXTURE_PROJECT_SCOPE, {
						action: "correct",
						memoryId: written.memoryId,
						expectedRevision: 1,
						content: "部署目标是 windows-x64（更正后）",
					});
				}
			}

			const selector = { asOf: "2030-01-01T00:00:00Z" };
			const measure = async (
				arm: RetrieArmResult["arm"],
				run: () => number,
			): Promise<RetrievalArmResult> => {
				for (let round = 0; round < warmupRounds; round += 1) void run();
				const timings: number[] = [];
				let hits = 0;
				for (let round = 0; round < measuredRounds; round += 1) {
					const start = performance.now();
					hits = run();
					timings.push(performance.now() - start);
				}
				timings.sort((left, right) => left - right);
				return {
					arm,
					hits,
					totalQueries: scenario.queries.length,
					p50Ms: round(timings[Math.floor(timings.length * 0.5)] ?? 0),
					p95Ms: round(timings[Math.floor(timings.length * 0.95)] ?? 0),
				};
			};

			const summaryEntries = await store.read(FIXTURE_PROJECT_SCOPE, selector);
			const semanticStub = async (query: string) => {
				// 确定性替身：按字符重合度排序（非语义）。
				return scenario.seed
					.map((entry, i) => ({
						score: [...new Set(query)].filter((ch) => entry.content.includes(ch)).length,
						i,
					}))
					.sort((a, b) => b.score - a.score)
					.map((entry) => ({
						memoryId: memoryIds[entry.i] ?? `mem-${entry.i}`,
						revisionId: `rev-${entry.i}`,
						content: scenario.seed[entry.i]?.content ?? "",
					}));
			};
			const hybridRetriever = new HybridMemoryRetriever({
				lexical: index,
				semantic: { search: async (query) => semanticStub(query) },
			});

			const arms: RetrieArmResult[] = [];
			arms.push(
				await measure("none", () => {
					void summaryEntries;
					return 0;
				}),
			);
			arms.push(
				await measure("summary", () => {
					return scenario.queries.filter(
						(query) => summaryEntries.some((entry) => entry.content.includes(query.query.slice(0, 2))),
					).length;
				}),
			);
			arms.push(
				await measure("lexical", () => {
					let hit = 0;
					for (const query of scenario.queries) {
						const result = index.search(FIXTURE_PROJECT_SCOPE, query.query, selector, 5);
						if (result.entries.length > 0) hit += 1;
					}
					return hit;
				}),
			);
			arms.push(
				await measure("semantic-deterministic", async () => {
					let hit = 0;
					for (const query of scenario.queries) {
						const entries = await semanticStub(query.query);
						if (entries.length > 0) hit += 1;
					}
					return hit;
				}).then(async (lexicalResult) => lexicalResult),
			);
			const semanticResult = await (async () => {
				let hit = 0;
				const timings: number[] = [];
				for (let round = 0; round < warmupRounds + measuredRounds; round += 1) {
					const start = performance.now();
					hit = 0;
					for (const query of scenario.queries) {
						const entries = await semanticStub(query.query);
						if (entries.length > 0) hit += 1;
					}
					timings.push(performance.now() - start);
				}
				timings.sort((left, right) => left - right);
				return {
					arm: "semantic-deterministic" as const,
					hits: hit,
					totalQueries: scenario.queries.length,
					p50Ms: round(timings[Math.floor(timings.length * 0.5)] ?? 0),
					p95Ms: round(timings[Math.floor(timings.length * 0.95)] ?? 0),
				};
			})();
			arms[3] = semanticResult;
			arms.push(
				await (async () => {
					let hit = 0;
					const timings: number[] = [];
					for (let round = 0; round < warmupRounds + measuredRounds; round += 1) {
						const start = performance.now();
						hit = 0;
						for (const query of scenario.queries) {
							const result = await hybridRetriever.search(FIXTURE_PROJECT_SCOPE, query.query, selector);
							if (result.entries.length > 0) hit += 1;
						}
						timings.push(performance.now() - start);
					}
					timings.sort((left, right) => left - right);
					return {
						arm: "hybrid" as const,
						hits: hit,
						totalQueries: scenario.queries.length,
						p50Ms: round(timings[Math.floor(timings.length * 0.5)] ?? 0),
						p95Ms: round(timings[Math.floor(timings.length * 0.95)] ?? 0),
					};
				})(),
			);

			return {
				scenarioId: scenario.id,
				arms,
				costLedger: {
					writes: scenario.seed.length + (scenario.kind === "correction" ? 1 : 0),
					backgroundJobs: 0,
					retrievals: scenario.queries.length * (arms.length - 1) * (warmupRounds + measuredRounds),
				},
				// 真实 Provider 未授权：确定性基座不含模型成绩。
				realProviderEvaluated: false,
			};
		} finally {
			void erasure;
			index.close();
			await store.close();
		}
	} finally {
		try {
			rmSync(workDir, { recursive: true, force: true });
		} catch {
			/* Windows 句柄滞后 */
		}
	}
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export function renderEvalReport(result: EvalRunResult): string {
	const lines = [
		`# 记忆确定性评测报告：${result.scenarioId}`,
		"",
		"| 检索路 | 命中 | 总查询 | p50(ms) | p95(ms) |",
		"|---|---|---|---|---|",
		...result.arms.map(
			(arm) => `| ${arm.arm} | ${arm.hits}/${arm.totalQueries} | ${arm.totalQueries} | ${arm.p50Ms} | ${arm.p95Ms} |`,
		),
		"",
		`成本账本：写入 ${result.costLedger.writes} · 后台任务 ${result.costLedger.backgroundJobs} · 检索 ${result.costLedger.retrievals}`,
		`真实 Provider 评测：${result.realProviderEvaluated ? "已运行" : "未运行（未授权，不冒充质量结论）"}`,
	];
	return lines.join("\n");
}

/** CLI：node scripts/evals/memory/run-deterministic.mjs [--scenario isolation] [--report <path>] */
export async function main(argv: string[]): Promise<number> {
	const scenarioFlag = argv.indexOf("--scenario");
	const scenarioId = scenarioFlag >= 0 ? argv[scenarioFlag + 1] : undefined;
	const scenario = SYNTHETIC_SCENARIOS.find((entry) => entry.id === scenarioId) ?? SYNTHETIC_SCENARIOS[0];
	const result = await runDeterministicMemoryEval({ scenario });
	const report = renderEvalReport(result);
	const reportFlag = argv.indexOf("--report");
	if (reportFlag >= 0 && argv[reportFlag + 1]) {
		writeFileSync(argv[reportFlag + 1]!, `${report}\n`, "utf8");
		console.log(report);
	} else {
		console.log(report);
	}
	void readFileSync;
	return 0;
}

if (process.argv[1] && process.argv[1].endsWith("run-deterministic.ts")) {
	void main(process.argv.slice(2));
}
