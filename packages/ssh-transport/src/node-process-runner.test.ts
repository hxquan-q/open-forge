// Modified by The Open Forge contributors.
import { describe, expect, it, onTestFinished } from "vitest";
import { createNodeSshProcessRunner } from "./node-process-runner.js";

// 用当前 Node 顶替 ssh：被测的是子进程的输出、超时与中止处理，与对端是不是 ssh 无关。
const runner = createNodeSshProcessRunner({ sshBinary: process.execPath });
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("ssh 子进程执行器", () => {
	it("不流式消费时，完整输出在结果里", async () => {
		const result = await runner.run({
			argv: ["-e", 'process.stdout.write("abc"); process.stderr.write("oops"); process.exitCode = 3;'],
		});
		expect(decode(result.stdout)).toBe("abc");
		expect(result.stderr).toBe("oops");
		expect(result.exitCode).toBe(3);
	});

	it("流式消费时不再另存一份——长驻任务的日志会让内存随运行时间无限增长", async () => {
		const chunks: string[] = [];
		const result = await runner.run({
			argv: ["-e", 'process.stdout.write("abc")'],
			onStdout: (chunk) => chunks.push(decode(chunk)),
		});
		expect(chunks.join("")).toBe("abc");
		expect(result.stdout.byteLength).toBe(0);
	});

	it("流式消费的 stderr 只留尾部，够做错误分类即可", async () => {
		const result = await runner.run({
			argv: [
				"-e",
				'let i = 0; const write = () => { if (i++ < 400) { process.stderr.write("0".repeat(100)); setImmediate(write); } else process.stderr.write("TAIL"); }; write();',
			],
			onStderr: () => {},
		});
		expect(result.stderr.endsWith("TAIL")).toBe(true);
		expect(result.stderr.length).toBeLessThan(40_000);
	});

	it("超时与主动取消分得开", async () => {
		const timedOut = await runner.run({ argv: ["-e", "setTimeout(() => {}, 30_000)"], timeoutMs: 50 });
		expect(timedOut).toMatchObject({ aborted: true, timedOut: true });

		const controller = new AbortController();
		const pending = runner.run({ argv: ["-e", "setTimeout(() => {}, 30_000)"], signal: controller.signal });
		controller.abort();
		await expect(pending).resolves.toMatchObject({ aborted: true, timedOut: false });
	});
});

it("长驻通道双向字节流保持完整，end 后正常退出", async () => {
	if (!runner.open) throw new Error("channel port missing");
	const output: Uint8Array[] = [];
	const channel = runner.open({
		argv: ["-e", "process.stdin.pipe(process.stdout)"],
		onStdout: (chunk) => output.push(chunk),
	});
	const input = new Uint8Array([0, 10, 128, 255]);
	channel.write(input);
	channel.end();
	await expect(channel.exited).resolves.toEqual({ exitCode: 0, stderr: "" });
	expect(Buffer.concat(output)).toEqual(Buffer.from(input));
});

it.runIf(process.platform !== "win32")("真实 POSIX 子孙忽略 TERM 时，取消仍在升级后关闭管道", async () => {
	const controller = new AbortController();
	let reportPid: (pid: number) => void = () => {};
	const ready = new Promise<number>((resolve) => {
		reportPid = resolve;
	});
	const descendant =
		'process.on("SIGTERM", () => {}); process.stdout.write(process.pid + "\\n"); setTimeout(() => {}, 30000)';
	const parent = `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: ["ignore", "inherit", "inherit"] }); setTimeout(() => {}, 30000)`;
	let output = "";
	const pending = runner.run({
		argv: ["-e", parent],
		signal: controller.signal,
		onStdout: (chunk) => {
			output += decode(chunk);
			if (output.includes("\n")) reportPid(Number.parseInt(output, 10));
		},
	});
	let pid: number | undefined;
	onTestFinished(async () => {
		controller.abort();
		if (pid !== undefined && Number.isSafeInteger(pid) && pid > 0) {
			try {
				process.kill(pid, "SIGKILL");
			} catch (error) {
				if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
			}
		}
		await pending;
	});
	pid = await ready;
	expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
	controller.abort();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			pending,
			new Promise<"deadline">((resolve) => {
				timer = setTimeout(() => resolve("deadline"), 3500);
			}),
		]);
		expect(result).toMatchObject({ aborted: true, timedOut: false });
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
});
