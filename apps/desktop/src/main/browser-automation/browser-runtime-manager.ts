// Modified by The Open Forge contributors.
import type { BrowserRuntimeInstallInput, BrowserRuntimeStatus } from "@vetta-org/capability-sdk";
import { describeError } from "../logger/describe-error.js";
import type { BrowserProcessRunner } from "./browser-process-runner.js";
import type { BrowserAutomationLogger, BrowserRuntimeStatusQuery } from "./contracts.js";

export const AGENT_BROWSER_VERSION = "0.34.0";

/** 可判定结果的缓存窗口：版本已查清，短时间内重复查询没有新信息。 */
export const RUNTIME_STATUS_SUCCESS_TTL_MS = 60_000;
/** 失败或不可判定结果的缓存窗口：外部安装可能随时完成，缩短到几秒。 */
export const RUNTIME_STATUS_FAILURE_TTL_MS = 4_000;

export interface BrowserRuntimeManagerOptions {
	/** 可注入时钟，测试用来推进 TTL。 */
	now?: () => number;
	successTtlMs?: number;
	failureTtlMs?: number;
}

interface RuntimeStatusCacheEntry {
	status: BrowserRuntimeStatus;
	expiresAt: number;
}

interface InFlightProbe {
	generation: number;
	promise: Promise<BrowserRuntimeStatus>;
}

function parseVersion(output: string): string | undefined {
	return /(?:agent-browser\s+)?(\d+\.\d+\.\d+)/i.exec(output)?.[1];
}

function compareVersion(left: string, right: string): number {
	const leftParts = left.split(".").map(Number);
	const rightParts = right.split(".").map(Number);
	for (let index = 0; index < 3; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

/** 能给出明确结论的 phase 走长缓存；missing/error 只是当前一次失败，不值得记太久。 */
function isDeterminate(status: BrowserRuntimeStatus): boolean {
	return status.phase === "ready" || status.phase === "browser-missing" || status.phase === "outdated";
}

/**
 * 调用方取消只结束自己的等待，不取消共享探测：探测本身是全局资源，
 * 被一个退出面板的调用方打断会让其他等待者重新付一次子进程成本。
 */
function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

export class BrowserRuntimeManager {
	private installPromise?: Promise<BrowserRuntimeStatus>;
	private browserAvailable?: boolean;
	private readonly now: () => number;
	private readonly successTtlMs: number;
	private readonly failureTtlMs: number;
	private cache?: RuntimeStatusCacheEntry;
	private probing?: InFlightProbe;
	/** 安装或失效会推进代次，旧探测即使晚到也不得写回缓存。 */
	private generation = 0;

	constructor(
		private readonly processRunner: BrowserProcessRunner,
		private readonly logger: BrowserAutomationLogger,
		options: BrowserRuntimeManagerOptions = {},
	) {
		this.now = options.now ?? Date.now;
		this.successTtlMs = options.successTtlMs ?? RUNTIME_STATUS_SUCCESS_TTL_MS;
		this.failureTtlMs = options.failureTtlMs ?? RUNTIME_STATUS_FAILURE_TTL_MS;
	}

	async status(signal?: AbortSignal, query?: BrowserRuntimeStatusQuery): Promise<BrowserRuntimeStatus> {
		signal?.throwIfAborted();
		if (query?.fresh !== true) {
			const cached = this.cachedStatus();
			if (cached) return cached;
		}
		const probe = this.sharedProbe();
		return signal ? waitWithAbort(probe, signal) : probe;
	}

	/** 让缓存失效：下一次查询重新探测。会话启动失败或运行时可能已被替换时调用。 */
	invalidate(): void {
		this.generation += 1;
		this.cache = undefined;
		this.probing = undefined;
	}

	install(input: BrowserRuntimeInstallInput, signal?: AbortSignal): Promise<BrowserRuntimeStatus> {
		if (this.installPromise) return this.installPromise;
		// 安装会改变磁盘上的运行时，安装开始即作废旧结论与在途探测。
		this.invalidate();
		this.installPromise = this.runInstall(input, signal).finally(() => {
			this.installPromise = undefined;
		});
		return this.installPromise;
	}

	private cachedStatus(): BrowserRuntimeStatus | undefined {
		const entry = this.cache;
		if (!entry) return undefined;
		if (this.now() < entry.expiresAt) return entry.status;
		this.cache = undefined;
		return undefined;
	}

	private sharedProbe(): Promise<BrowserRuntimeStatus> {
		const existing = this.probing;
		if (existing && existing.generation === this.generation) return existing.promise;
		const generation = this.generation;
		const entry = { generation, promise: undefined as unknown as Promise<BrowserRuntimeStatus> };
		const promise = this.runProbe().then((status) => {
			if (this.generation === generation) {
				const ttl = isDeterminate(status) ? this.successTtlMs : this.failureTtlMs;
				this.cache = { status, expiresAt: this.now() + ttl };
			}
			if (this.probing === entry) this.probing = undefined;
			return status;
		});
		entry.promise = promise;
		this.probing = entry;
		return promise;
	}

	private async runProbe(): Promise<BrowserRuntimeStatus> {
		try {
			const result = await this.processRunner.run("agent-browser", ["--version"], {
				timeoutMs: 10_000,
				maxOutputChars: 8_000,
			});
			if (result.exitCode !== 0) return { phase: "missing" };
			const version = parseVersion(`${result.stdout}\n${result.stderr}`);
			if (!version) return { phase: "error", message: "Unable to read browser runtime version" };
			if (compareVersion(version, AGENT_BROWSER_VERSION) < 0) return { phase: "outdated", version };
			return this.browserAvailable === false ? { phase: "browser-missing", version } : { phase: "ready", version };
		} catch (error) {
			this.logger.warn("browser runtime check failed", {
				errorKind: describeError(error),
			});
			return { phase: "missing" };
		}
	}

	private async runInstall(input: BrowserRuntimeInstallInput, signal?: AbortSignal): Promise<BrowserRuntimeStatus> {
		const startedAt = Date.now();
		this.logger.info("browser runtime install started", { namespace: input.namespace, step: input.step });
		const file = input.step === "runtime" ? "npm" : "agent-browser";
		const args =
			input.step === "runtime"
				? ["install", "--global", `agent-browser@${AGENT_BROWSER_VERSION}`, "--engine-strict=false"]
				: ["install"];
		try {
			const result = await this.processRunner.run(file, args, {
				timeoutMs: 15 * 60_000,
				maxOutputChars: 64_000,
				signal,
			});
			if (result.exitCode !== 0) {
				// 安装期间可能已有别的调用方探测过半装状态，失败后同样不能沿用。
				this.invalidate();
				this.logger.error("browser runtime install failed", {
					namespace: input.namespace,
					step: input.step,
					exitCode: result.exitCode,
					durationMs: Date.now() - startedAt,
				});
				return {
					phase: "error",
					message: `Browser ${input.step} installation failed`,
					recentOutput: result.stderr || result.stdout,
				};
			}
			if (input.step === "runtime") {
				this.browserAvailable = detectBrowserAvailability(`${result.stdout}\n${result.stderr}`);
			} else {
				this.browserAvailable = true;
			}
			// 安装期间可能已有别的调用方探测过半装状态；作废后强制一次真实探测。
			this.invalidate();
			const status = await this.status(signal);
			this.logger.info("browser runtime install completed", {
				namespace: input.namespace,
				step: input.step,
				durationMs: Date.now() - startedAt,
				phase: status.phase,
			});
			return { ...status, recentOutput: result.stdout || undefined };
		} catch (error) {
			if (signal?.aborted) {
				this.invalidate();
				this.logger.info("browser runtime install cancelled", {
					namespace: input.namespace,
					step: input.step,
					durationMs: Date.now() - startedAt,
				});
				throw error;
			}
			this.invalidate();
			this.logger.error("browser runtime install failed", {
				namespace: input.namespace,
				step: input.step,
				durationMs: Date.now() - startedAt,
				errorKind: describeError(error),
			});
			return { phase: "error", message: `Browser ${input.step} installation failed` };
		}
	}
}

function detectBrowserAvailability(output: string): boolean | undefined {
	if (/System Chrome found:/i.test(output)) return true;
	if (/No Chrome installation detected/i.test(output)) return false;
	return undefined;
}
