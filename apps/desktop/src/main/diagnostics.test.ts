// Copyright The Open Forge contributors.
import { beforeEach, describe, expect, it, vi } from "vitest";

const scopedLogger = {
	error: vi.fn(),
	warn: vi.fn(),
	info: vi.fn(),
	debug: vi.fn(),
};
const disableConsoleLogMirroring = vi.fn(() => true);

// 日志管线是这里的外部边界：熔断断言落在 logger 提供的关停出口与 scoped logger 写面上。
// electron 也按 specifier 拦截——根目录 run-vitest 不带 desktop alias，不能依赖 stub 解析。
vi.mock("./logger.js", () => ({
	configureAppLogging: vi.fn(),
	patchConsoleToAppLogger: vi.fn(),
	getAppLogger: vi.fn(() => scopedLogger),
	getAppLogPath: vi.fn(() => "C:/tmp/vetta-test/main.log"),
	writeAppLog: vi.fn(),
	disableConsoleLogMirroring,
}));

vi.mock("electron", () => ({
	app: { on: vi.fn(), once: vi.fn(), getVersion: () => "0.0.0-test" },
	net: {},
}));

type ProcessErrorHandler = (error: unknown) => void;

interface CapturedHandlers {
	uncaught: ProcessErrorHandler;
	rejection: ProcessErrorHandler;
}

// diagnostics 模块持有熔断状态（一次性），每个用例重置模块注册表拿新实例。
async function installAndCapture(): Promise<CapturedHandlers> {
	vi.resetModules();
	const { installMainDiagnostics } = await import("./diagnostics.js");
	const onSpy = vi.spyOn(process, "on");
	installMainDiagnostics();
	const calls = onSpy.mock.calls;
	onSpy.mockRestore();
	const find = (event: string) => {
		const entry = calls.find(([name]) => name === event);
		if (!entry) throw new Error(`process.on("${event}") not registered`);
		return entry[1] as ProcessErrorHandler;
	};
	return { uncaught: find("uncaughtException"), rejection: find("unhandledRejection") };
}

const epipe = () => Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

beforeEach(() => {
	scopedLogger.error.mockClear();
	scopedLogger.warn.mockClear();
	scopedLogger.info.mockClear();
	scopedLogger.debug.mockClear();
	disableConsoleLogMirroring.mockClear();
});

describe("stdio stream error circuit breaker (BUG-0047)", () => {
	it("trips the console mirror once on the first EPIPE and still records the error to file-level sinks", async () => {
		const { uncaught } = await installAndCapture();
		const error = epipe();

		uncaught(error);

		expect(disableConsoleLogMirroring).toHaveBeenCalledTimes(1);
		// 熔断先于落盘：本条错误不再回灌已断的 stdout。
		expect(disableConsoleLogMirroring.mock.invocationCallOrder[0]).toBeLessThan(
			scopedLogger.error.mock.invocationCallOrder[0]!,
		);
		expect(scopedLogger.error).toHaveBeenCalledWith("uncaughtException", error);
		expect(scopedLogger.warn).toHaveBeenCalledWith(expect.stringContaining("console log mirror disabled"));
	});

	it("suppresses subsequent stdio stream errors and reports a bounded count instead of full stacks", async () => {
		const { uncaught } = await installAndCapture();

		uncaught(epipe());
		for (let i = 0; i < 500; i += 1) uncaught(epipe());

		// 不再逐条写 error；熔断也只发生一次。
		expect(scopedLogger.error).toHaveBeenCalledTimes(1);
		expect(disableConsoleLogMirroring).toHaveBeenCalledTimes(1);
		// 熔断说明 1 条 + 第 500 条抑制汇总 1 条，风暴收敛为常量。
		expect(scopedLogger.warn).toHaveBeenCalledTimes(2);
		expect(scopedLogger.warn).toHaveBeenLastCalledWith(
			expect.stringContaining("suppressed"),
			expect.objectContaining({ count: 500 }),
		);
	});

	it("does not trip on non-stream errors and keeps logging them in full", async () => {
		const { uncaught } = await installAndCapture();

		uncaught(new Error("boom"));
		uncaught(new Error("boom again"));

		expect(disableConsoleLogMirroring).not.toHaveBeenCalled();
		expect(scopedLogger.error).toHaveBeenCalledTimes(2);
		expect(scopedLogger.warn).not.toHaveBeenCalled();
	});

	it("also trips on unhandledRejection carrying a destroyed-stream error", async () => {
		const { rejection } = await installAndCapture();
		const error = Object.assign(new Error("stream destroyed"), { code: "ERR_STREAM_DESTROYED" });

		rejection(error);

		expect(disableConsoleLogMirroring).toHaveBeenCalledTimes(1);
		expect(scopedLogger.error).toHaveBeenCalledWith("unhandledRejection", error);
	});
});
