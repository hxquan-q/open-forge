// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	isChromiumResizeObserverDiagnostic,
	isReactFlushSyncLifecycleDiagnostic,
	shouldPersistRendererConsoleMessage,
} from "./renderer-console-policy.js";

describe("shouldPersistRendererConsoleMessage", () => {
	it("filters low-signal development diagnostics at info level", () => {
		expect(shouldPersistRendererConsoleMessage("info", "[plugin-agent] load start", false)).toBe(false);
		expect(shouldPersistRendererConsoleMessage("info", "[activity-tab-debug] resolved {}", false)).toBe(false);
		expect(shouldPersistRendererConsoleMessage("info", "[skills] loaded {}", false)).toBe(false);
		expect(shouldPersistRendererConsoleMessage("info", "[vite] hot updated: /App.tsx", false)).toBe(false);
		expect(shouldPersistRendererConsoleMessage("info", '[theme-runtime] module load start "dark"', false)).toBe(
			false,
		);
	});

	it("keeps the semantic theme selection chain", () => {
		expect(shouldPersistRendererConsoleMessage("info", '[theme-runtime] selectTheme "dark"', false)).toBe(true);
		expect(
			shouldPersistRendererConsoleMessage("info", '[theme-runtime] theme "dark" ready elapsed=10ms', false),
		).toBe(true);
		expect(shouldPersistRendererConsoleMessage("info", "[activity-tab] opened {}", false)).toBe(true);
	});

	it("keeps warnings and errors even when they use a debug prefix", () => {
		expect(shouldPersistRendererConsoleMessage("warn", "[theme-runtime] fallback", false)).toBe(true);
		expect(shouldPersistRendererConsoleMessage("error", "[plugin-agent] failed", false)).toBe(true);
	});

	it("allows an explicit verbose override", () => {
		expect(shouldPersistRendererConsoleMessage("info", "[plugin-agent] load start", true)).toBe(true);
	});
});

// BUG-0048：packaged 形态 sourceId 为空串，dev 形态是页面 URL；判定不依赖 sourceId，
// 只要消息精确匹配且行号为 0 两种形态都命中过滤。
describe("isChromiumResizeObserverDiagnostic", () => {
	const WARNING = "ResizeObserver loop completed with undelivered notifications.";

	it("filters the deferred-delivery notice at line 0 in any sourceId shape", () => {
		expect(isChromiumResizeObserverDiagnostic(WARNING, 0)).toBe(true);
	});

	it("keeps the same message when a real source line is reported", () => {
		expect(isChromiumResizeObserverDiagnostic(WARNING, 1)).toBe(false);
		expect(isChromiumResizeObserverDiagnostic(WARNING, 138)).toBe(false);
	});

	it("does not swallow other messages at line 0", () => {
		expect(isChromiumResizeObserverDiagnostic("ResizeObserver loop limit exceeded", 0)).toBe(false);
		expect(isChromiumResizeObserverDiagnostic("Uncaught TypeError: x is not a function", 0)).toBe(false);
	});
});

// BUG-0083：这条 React DEV 文案只在依赖自带的 flushSync 于提交期执行时打印，完整且唯一；
// 精确匹配过滤日志噪音，近似文案与真实错误必须照常落盘。
describe("isReactFlushSyncLifecycleDiagnostic", () => {
	const WARNING =
		"flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task.";

	it("filters the verbatim React DEV advisory", () => {
		expect(isReactFlushSyncLifecycleDiagnostic(WARNING)).toBe(true);
	});

	it("keeps truncated or extended lookalikes", () => {
		expect(isReactFlushSyncLifecycleDiagnostic("flushSync was called from inside a lifecycle method.")).toBe(false);
		expect(isReactFlushSyncLifecycleDiagnostic(`${WARNING} extra`)).toBe(false);
		expect(isReactFlushSyncLifecycleDiagnostic(` ${WARNING}`)).toBe(false);
	});

	it("keeps real errors that mention flushSync", () => {
		expect(isReactFlushSyncLifecycleDiagnostic("Uncaught Error: flushSync failed")).toBe(false);
		expect(isReactFlushSyncLifecycleDiagnostic("flushSync was called from inside a lifecycle method")).toBe(false);
	});
});
