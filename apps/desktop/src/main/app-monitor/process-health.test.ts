import { describe, expect, it } from "vitest";
import { ProcessHealthBook } from "./process-health.js";

const CONTRACT = {
	role: "session-search",
	kind: "worker" as const,
	restartBudget: { maxRestarts: 3, windowMs: 300_000 },
};

describe("process health book", () => {
	it("registers a role contract once and reports a zeroed baseline", () => {
		const book = new ProcessHealthBook();
		book.register(CONTRACT);
		book.register({ ...CONTRACT, restartBudget: undefined });

		const [health] = book.snapshot();
		expect(health).toEqual({
			role: "session-search",
			kind: "worker",
			crashes: 0,
			restarts: 0,
			restartBudgetExhausted: false,
		});
	});

	it("counts crashes and restarts per role and clears pid attribution on crash", () => {
		const book = new ProcessHealthBook(() => 1_000);
		book.register({ role: "im-sidecar", kind: "sidecar" });
		book.register(CONTRACT);
		book.attributePid("im-sidecar", 4242);

		book.recordCrash("im-sidecar");
		book.recordRestart("im-sidecar");
		book.recordCrash("session-search");

		const [sidecar, search] = book.snapshot();
		expect(sidecar).toMatchObject({ role: "im-sidecar", crashes: 1, restarts: 1, lastCrashAt: 1_000 });
		expect(sidecar.pid).toBeUndefined();
		expect(search).toMatchObject({ crashes: 1, restarts: 0 });
	});

	it("attributes memory by pid and hands the role back for metric enrichment", () => {
		const book = new ProcessHealthBook();
		book.register({ role: "im-sidecar", kind: "sidecar" });
		book.attributePid("im-sidecar", 100);
		expect(book.roleForPid(100)).toBe("im-sidecar");

		book.attributePid("im-sidecar", 200);
		expect(book.roleForPid(100)).toBeUndefined();
		expect(book.roleForPid(200)).toBe("im-sidecar");
	});

	it("allows restarts within the window budget and blocks once exhausted", () => {
		let now = 0;
		const book = new ProcessHealthBook(() => now);
		book.register({ role: "w", kind: "worker", restartBudget: { maxRestarts: 2, windowMs: 60_000 } });

		expect(book.mayRestart("w")).toBe(true);
		book.recordRestart("w");
		expect(book.mayRestart("w")).toBe(true);
		book.recordRestart("w");
		expect(book.mayRestart("w")).toBe(false);
		expect(book.snapshot()[0]?.restartBudgetExhausted).toBe(true);

		now = 61_000;
		expect(book.mayRestart("w")).toBe(true);
		expect(book.snapshot()[0]?.restartBudgetExhausted).toBe(false);
	});

	it("always permits restart for roles without a budget (accounting only)", () => {
		const book = new ProcessHealthBook();
		book.register({ role: "uiohook", kind: "worker" });
		for (let i = 0; i < 10; i += 1) book.recordRestart("uiohook");
		expect(book.mayRestart("uiohook")).toBe(true);
	});

	it("ignores health events for unregistered roles instead of throwing", () => {
		const book = new ProcessHealthBook();
		expect(() => {
			book.recordCrash("ghost");
			book.recordRestart("ghost");
			book.attributePid("ghost", 1);
		}).not.toThrow();
		expect(book.snapshot()).toEqual([]);
		expect(book.mayRestart("ghost")).toBe(true);
	});
});
