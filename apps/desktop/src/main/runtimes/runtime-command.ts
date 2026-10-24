// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";

export interface RuntimeCommandResult {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
}

export interface RuntimeCommandOptions {
	timeout: number;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

/** Owns only the direct subprocesses used to inspect and prepare desktop runtimes. */
export class RuntimeCommandRunner {
	private readonly shutdownController = new AbortController();
	private readonly pending = new Set<Promise<RuntimeCommandResult>>();

	get signal(): AbortSignal {
		return this.shutdownController.signal;
	}

	run(command: string, args: readonly string[], options: RuntimeCommandOptions): Promise<RuntimeCommandResult> {
		const signal = options.signal
			? AbortSignal.any([options.signal, this.shutdownController.signal])
			: this.shutdownController.signal;
		const operation = new Promise<RuntimeCommandResult>((resolve) => {
			try {
				signal.throwIfAborted();
				let result: RuntimeCommandResult | undefined;
				let abortError: Error | undefined;
				const child = execFile(
					command,
					args,
					{
						encoding: "utf8",
						env: options.env,
						timeout: options.timeout,
						maxBuffer: 1024 * 1024,
						windowsHide: true,
						shell: false,
						killSignal: "SIGKILL",
					},
					(error, stdout, stderr) => {
						result = {
							status: error ? (typeof error.code === "number" ? error.code : null) : 0,
							stdout,
							stderr,
							...(error ? { error } : {}),
						};
					},
				);
				const abort = () => {
					abortError = new Error("Runtime command aborted", { cause: signal.reason });
					abortError.name = "AbortError";
					// execFile's signal path does not forward killSignal to spawn. Own
					// cancellation so an ignored SIGTERM cannot leave shutdown pending.
					child.kill("SIGKILL");
					// Descendants can retain these pipes after the direct child exits.
					// Closing our ends does not require waiting for their lifetime.
					child.stdin?.destroy();
					child.stdout?.destroy();
					child.stderr?.destroy();
				};
				signal.addEventListener("abort", abort, { once: true });
				// close follows the direct process exit, even after destroying pipes.
				child.once("close", () => {
					signal.removeEventListener("abort", abort);
					resolve(
						abortError
							? {
									status: null,
									stdout: result?.stdout ?? "",
									stderr: result?.stderr ?? "",
									error: abortError,
								}
							: (result ?? {
									status: null,
									stdout: "",
									stderr: "",
									error: new Error("Runtime command closed without a result"),
								}),
					);
				});
				if (signal.aborted) abort();
			} catch (error) {
				resolve({
					status: null,
					stdout: "",
					stderr: "",
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		});
		this.pending.add(operation);
		void operation.finally(() => this.pending.delete(operation));
		return operation;
	}

	async shutdown(): Promise<void> {
		this.shutdownController.abort();
		await Promise.all(this.pending);
	}
}

const runtimeCommands = new RuntimeCommandRunner();

export function runRuntimeCommand(
	command: string,
	args: readonly string[],
	options: RuntimeCommandOptions,
): Promise<RuntimeCommandResult> {
	return runtimeCommands.run(command, args, options);
}

export function shutdownRuntimeCommands(): Promise<void> {
	return runtimeCommands.shutdown();
}

/** Preparation stages use the same lifetime so an aborted probe cannot start a repair/download. */
export function getRuntimePreparationSignal(): AbortSignal {
	return runtimeCommands.signal;
}
