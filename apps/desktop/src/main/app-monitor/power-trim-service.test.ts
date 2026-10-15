// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { type PowerEventSource, type PowerTrimLogger, startPowerTrimService } from "./power-trim-service.js";

interface RecordedListener {
	event: string;
	listener: () => void;
}

function createFakeSource() {
	const listeners: RecordedListener[] = [];
	const removed: RecordedListener[] = [];
	const source: PowerEventSource = {
		on(event, listener) {
			listeners.push({ event, listener });
		},
		off(event, listener) {
			removed.push({ event, listener });
		},
	};
	return {
		source,
		listeners,
		removed,
		emit(event: string) {
			for (const entry of listeners.filter((item) => item.event === event)) entry.listener();
		},
	};
}

function createMemoryLogger(): PowerTrimLogger & {
	entries: { level: "info" | "warn" | "debug"; message: string; data?: Record<string, unknown> }[];
} {
	const entries: { level: "info" | "warn" | "debug"; message: string; data?: Record<string, unknown> }[] = [];
	return {
		entries,
		info(message, data) {
			entries.push({ level: "info", message, data });
		},
		warn(message, data) {
			entries.push({ level: "warn", message, data });
		},
		debug(message, data) {
			entries.push({ level: "debug", message, data });
		},
	};
}

function createReader(values: Array<number | undefined>) {
	let index = 0;
	return () => {
		const value = values[Math.min(index, values.length - 1)];
		index += 1;
		return value;
	};
}

describe("power trim service", () => {
	it("suspend 时在 win32 执行一次自身 trim 并记录前后峰谷差", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		startPowerTrimService(source.source, {
			platform: "win32",
			log: logger,
			readMainWorkingSetKb: createReader([200_000, 120_000]),
			trimWorkingSet: () => {
				trims.push("suspend");
			},
		});

		source.emit("suspend");

		expect(trims).toEqual(["suspend"]);
		const entry = logger.entries.find((item) => item.message === "power working-set trim");
		expect(entry?.data).toMatchObject({
			reason: "suspend",
			trimmed: true,
			beforeKb: 200_000,
			afterKb: 120_000,
			deltaKb: -80_000,
		});
	});

	it("lock-screen 同样是认可的 trim 事件点", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		startPowerTrimService(source.source, {
			platform: "win32",
			log: logger,
			readMainWorkingSetKb: createReader([90_000, 90_000]),
			trimWorkingSet: () => {
				trims.push("lock-screen");
			},
		});

		source.emit("lock-screen");

		expect(trims).toEqual(["lock-screen"]);
		expect(logger.entries.some((item) => item.data?.reason === "lock-screen")).toBe(true);
	});

	it("resume/unlock-screen 只观测不 trim，且不做任何同步重建", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		startPowerTrimService(source.source, {
			platform: "win32",
			log: logger,
			readMainWorkingSetKb: createReader([200_000, 120_000, 130_000, 130_000]),
			trimWorkingSet: () => {
				trims.push("trim");
			},
		});

		source.emit("suspend");
		source.emit("resume");
		source.emit("unlock-screen");

		expect(trims).toEqual(["trim"]);
		const observations = logger.entries.filter((item) => item.message === "power event observed");
		expect(observations.map((item) => item.data?.reason)).toEqual(["resume", "unlock-screen"]);
		expect(observations[0]?.data).toMatchObject({ workingSetKb: 130_000 });
	});

	it("非 win32 平台不调用 trim，只记录跳过原因", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		startPowerTrimService(source.source, {
			platform: "darwin",
			log: logger,
			readMainWorkingSetKb: createReader([200_000]),
			trimWorkingSet: () => {
				trims.push("trim");
			},
		});

		source.emit("suspend");

		expect(trims).toEqual([]);
		const entry = logger.entries.find((item) => item.message === "power working-set trim");
		expect(entry?.data).toMatchObject({ reason: "suspend", trimmed: false });
		expect(logger.entries.some((item) => item.level === "debug" && item.data?.reason === "suspend")).toBe(true);
	});

	it("trim 抛错时只告警不中断，后续事件仍被处理", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		const service = startPowerTrimService(source.source, {
			platform: "win32",
			log: logger,
			readMainWorkingSetKb: createReader([200_000, 120_000]),
			trimWorkingSet: () => {
				trims.push("trim");
				throw new Error("EmptyWorkingSet failed");
			},
		});

		expect(() => source.emit("suspend")).not.toThrow();
		expect(trims).toEqual(["trim"]);
		expect(logger.entries.some((item) => item.level === "warn" && item.message.includes("failed"))).toBe(true);

		source.emit("resume");
		expect(logger.entries.some((item) => item.data?.reason === "resume")).toBe(true);
		expect(service.disposed).toBe(false);
		service.dispose();
	});

	it("主进程读数不可用时仍尝试 trim 并保持记录有效", () => {
		const source = createFakeSource();
		const logger = createMemoryLogger();
		const trims: string[] = [];
		startPowerTrimService(source.source, {
			platform: "win32",
			log: logger,
			readMainWorkingSetKb: () => undefined,
			trimWorkingSet: () => {
				trims.push("trim");
			},
		});

		source.emit("suspend");

		expect(trims).toEqual(["trim"]);
		const entry = logger.entries.find((item) => item.message === "power working-set trim");
		expect(entry?.data).toMatchObject({ reason: "suspend", trimmed: true });
		expect(entry?.data).not.toHaveProperty("beforeKb");
		expect(entry?.data).not.toHaveProperty("afterKb");
	});

	it("重复 start 只挂一轮监听，dispose 后全部摘除", () => {
		const source = createFakeSource();
		const first = startPowerTrimService(source.source, {
			platform: "win32",
			log: createMemoryLogger(),
			readMainWorkingSetKb: () => undefined,
			trimWorkingSet: () => undefined,
		});
		startPowerTrimService(source.source, {
			platform: "win32",
			log: createMemoryLogger(),
			readMainWorkingSetKb: () => undefined,
			trimWorkingSet: () => undefined,
		});

		expect(source.listeners).toHaveLength(4);

		first.dispose();
		expect(source.removed).toHaveLength(4);
		expect(new Set(source.removed.map((item) => item.event))).toEqual(
			new Set(["suspend", "lock-screen", "resume", "unlock-screen"]),
		);
	});
});
