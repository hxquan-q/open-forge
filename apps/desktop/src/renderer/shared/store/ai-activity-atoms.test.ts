// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { aiEditTargetFromToolCall } from "./ai-activity-atoms";

describe("aiEditTargetFromToolCall", () => {
	it("写类工具 + 路径参数 → 目标；相对路径按 cwd 补全，绝对路径原样；来源 cwd 随目标携带", () => {
		expect(aiEditTargetFromToolCall("edit", { file_path: "src/b.ts" }, "/proj/x", 1)).toEqual({
			path: "/proj/x/src/b.ts",
			at: 1,
			cwd: "/proj/x",
		});
		expect(aiEditTargetFromToolCall("write", { path: "C:/abs/d.ts" }, "/proj/x", 2)).toEqual({
			path: "C:/abs/d.ts",
			at: 2,
			cwd: "/proj/x",
		});
		expect(aiEditTargetFromToolCall("apply_patch", { target_file: "a\\b.ts" }, "D:\\w", 3)?.path).toBe("D:/w/a/b.ts");
		expect(aiEditTargetFromToolCall("edit", { file_path: "a.ts" }, null, 1)).toBeNull();
	});

	it("非写类工具、缺路径、相对路径无 cwd 一律 null", () => {
		expect(aiEditTargetFromToolCall("read", { path: "a.ts" }, "/proj/x", 1)).toBeNull();
		expect(aiEditTargetFromToolCall("edit", {}, "/proj/x", 1)).toBeNull();
		expect(aiEditTargetFromToolCall("edit", { file_path: "a.ts" }, null, 1)).toBeNull();
		expect(aiEditTargetFromToolCall(undefined, { file_path: "a.ts" }, "/proj/x", 1)).toBeNull();
	});
});
