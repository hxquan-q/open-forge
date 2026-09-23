import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { isPackaged: false } }));

import { DEV_AUTO_DEVTOOLS_ENV_FLAG, shouldAutoOpenDevTools } from "./devtools-policy";

describe("主窗口加载后是否自动打开 DevTools", () => {
	it.each([
		{ scenario: "开发运行默认自动打开", isPackaged: false, env: {}, expected: true },
		{
			scenario: "开发者用 VETTA_DEV_AUTO_DEVTOOLS=0 关掉自动打开",
			isPackaged: false,
			env: { [DEV_AUTO_DEVTOOLS_ENV_FLAG]: "0" },
			expected: false,
		},
		{ scenario: "其它取值不改变默认", isPackaged: false, env: { [DEV_AUTO_DEVTOOLS_ENV_FLAG]: "1" }, expected: true },
		{ scenario: "E2E 运行不弹出抢焦点的窗口", isPackaged: false, env: { VETTA_E2E: "1" }, expected: false },
		{ scenario: "打包版从不自动打开", isPackaged: true, env: {}, expected: false },
		{
			scenario: "打包版即使放开 DevTools 逃生口也不自动打开",
			isPackaged: true,
			env: { VETTA_DEVTOOLS: "1" },
			expected: false,
		},
	])("$scenario", ({ isPackaged, env, expected }) => {
		expect(shouldAutoOpenDevTools({ isPackaged, env })).toBe(expected);
	});
});
