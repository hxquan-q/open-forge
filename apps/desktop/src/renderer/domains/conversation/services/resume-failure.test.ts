// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { classifyResumeFailure } from "./resume-failure";

describe("classifyResumeFailure", () => {
	it.each([
		// 内核 sessionBusyError() 文案（IPC 包装后的形态）。
		["Error invoking remote method 'vetta:session:retry': KernelError: Session already has an active turn", "busy"],
		["Session already has an active turn", "busy"],
		["session_busy", "busy"],
		["SESSION_BUSY", "busy"],
		// 内核 turnPersistenceError() 文案（recovery_required）。
		[
			"Turn terminal state could not be persisted; session recovery is required. Cause: disk full",
			"recovery_required",
		],
		["recovery_required", "recovery_required"],
		["turn_persistence", "recovery_required"],
		// 未归类 → 通用文案。
		["Error invoking remote method 'vetta:session:retry': Error: SESSION_NOT_FOUND", "unknown"],
		["network down", "unknown"],
	])("把 %s 归类为 %s", (text, expected) => {
		expect(classifyResumeFailure(new Error(text))).toBe(expected);
	});

	it("接受字符串与带 message 的对象形态，缺失文本时降级为 unknown", () => {
		expect(classifyResumeFailure("Session already has an active turn")).toBe("busy");
		expect(classifyResumeFailure({ message: "Session already has an active turn" })).toBe("busy");
		expect(classifyResumeFailure(undefined)).toBe("unknown");
		expect(classifyResumeFailure({})).toBe("unknown");
	});
});
