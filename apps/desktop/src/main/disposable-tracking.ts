// Modified by The Open Forge contributors.
/**
 * 开发期 Disposable 泄漏追踪的主进程接线。
 *
 * 只在 `!app.isPackaged && VETTA_DISPOSABLE_TRACKER=1` 时打开：追踪器记录「谁创建了
 * 资源」，对象被 GC 掉却从未 `dispose()` 时会出现在退出时的诊断日志里（见
 * apps/desktop/AGENTS.md 的 Disposable 契约）。生产构建不启用，也没有常驻开销。
 */

import { enableDisposableLeakTracking, readDisposableLeakReport } from "@vetta/toolkit";
import { app } from "electron";
import { getAppLogger } from "./logger.js";

const log = getAppLogger("disposables");

export const DISPOSABLE_TRACKER_ENV = "VETTA_DISPOSABLE_TRACKER";

export function initializeDisposableTracking(): boolean {
	if (app.isPackaged || process.env[DISPOSABLE_TRACKER_ENV] !== "1") return false;
	const enabled = enableDisposableLeakTracking();
	if (enabled) log.info("disposable leak tracking enabled");
	return enabled;
}

/** 退出前把泄漏报告写进诊断日志；未启用或没有泄漏时不输出。 */
export function reportDisposableLeaks(): void {
	const report = readDisposableLeakReport();
	if (!report.enabled) return;
	if (report.leaked.length === 0) {
		log.info("disposable leak report: clean", { tracked: report.tracked, disposed: report.disposed });
		return;
	}
	log.warn("disposable leak report: 有资源被 GC 但从未 dispose", {
		tracked: report.tracked,
		disposed: report.disposed,
		leaked: report.leaked.length,
	});
	for (const leak of report.leaked) {
		log.warn(`leaked ${leak.name} created at ${leak.collectedAt}`, { createdStack: leak.createdStack });
	}
}
