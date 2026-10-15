// Modified by The Open Forge contributors.
/**
 * 大尺寸对象 → 功能降级硬闸（对应 VS Code `textModel.ts` 的
 * `LARGE_FILE_SIZE_THRESHOLD` / `_MODEL_SYNC_LIMIT` 一次性判定）。
 *
 * 思路是「宁降级不炸」：对象一超过尺寸阈值就关掉高耗功能（语法高亮、tokenization、
 * 搜索索引、全量 hydration），而不是等它把渲染进程拖死。判定**一次性、不可逆**：
 * 降级只取决于对象初始化时的体量，之后内容缩小也不重开——这样调用方不必维护
 * 「降级 → 恢复 → 再降级」的状态机，也不会出现同一对象在两种渲染路径间来回切换。
 *
 * 阈值口径与既有策略对齐，不另起一套：
 * - 2 MB：文件预览/编辑既有的 `errorTooLarge` 上限（`apps/desktop/src/shared/i18n/locales/` 下的 chat catalog）。
 * - 8 MB transcript / 20k 行：低于 VS Code 编辑器模型的 20MB / 300k 行——VS Code 有
 *   piece tree 缓冲，本仓的预览与投影没有，因此阈值必须更保守。
 *
 * 聊天气泡里的代码块不在这张表里：那条路径已经由高亮缓存预算与流式纯文本兜底
 * （见 theme-ui 的 shared/SyntaxHighlightedCode 与 syntax-highlight-cache），并有测试锁定
 * 「多兆代码块仍要高亮且能自愈」的既有行为。
 */

export type LargeObjectKind = "artifact" | "textFile" | "transcript";

export interface LargeObjectLimits {
	/** artifact 预览（含 Markdown 代码块）的字节上限。 */
	artifactBytes: number;
	/** 文本文件预览的字节上限，与既有 2 MB 编辑上限同一口径。 */
	textFileBytes: number;
	/** 文本文件预览的行数上限。 */
	textFileLines: number;
	/** transcript 全量 hydration 的字节上限：超过即走既有窗口化/占位路径。 */
	transcriptBytes: number;
}

export const LARGE_OBJECT_LIMITS: LargeObjectLimits = Object.freeze({
	artifactBytes: 2 * 1024 * 1024,
	textFileBytes: 2 * 1024 * 1024,
	textFileLines: 20_000,
	transcriptBytes: 8 * 1024 * 1024,
});

export interface LargeObjectMeasure {
	kind: LargeObjectKind;
	/** 内容体量；按 UTF-16 长度近似即可，阈值取整 KB 级时误差不影响判定。 */
	bytes: number;
	/** 行数（文本文件才有意义）。 */
	lines?: number;
}

export interface LargeObjectFeatures {
	/** 语法高亮（Shiki）。 */
	syntaxHighlight: boolean;
	/** 编辑器 tokenization（文件预览的语法层）。 */
	tokenization: boolean;
	/** 搜索索引/全文件扫描。 */
	searchIndex: boolean;
	/** 全量 hydration（transcript 一次性装载全部条目）。 */
	fullHydration: boolean;
}

export interface LargeObjectDegradation {
	kind: LargeObjectKind;
	degraded: boolean;
	/** 命中的阈值说明，直接进日志/测试断言。 */
	reasons: string[];
	features: LargeObjectFeatures;
}

function allFeaturesEnabled(): LargeObjectFeatures {
	return { syntaxHighlight: true, tokenization: true, searchIndex: true, fullHydration: true };
}

/** 纯判定：同一输入永远得到同一结果，调用方在对象初始化时取一次即可。 */
export function evaluateLargeObjectDegradation(measure: LargeObjectMeasure): LargeObjectDegradation {
	const features = allFeaturesEnabled();
	const reasons: string[] = [];
	switch (measure.kind) {
		case "artifact":
			if (measure.bytes > LARGE_OBJECT_LIMITS.artifactBytes) {
				features.syntaxHighlight = false;
				reasons.push(`artifact ${measure.bytes} bytes > ${LARGE_OBJECT_LIMITS.artifactBytes}`);
			}
			break;
		case "textFile":
			if (measure.bytes > LARGE_OBJECT_LIMITS.textFileBytes) {
				features.tokenization = false;
				features.searchIndex = false;
				reasons.push(`text file ${measure.bytes} bytes > ${LARGE_OBJECT_LIMITS.textFileBytes}`);
			}
			if ((measure.lines ?? 0) > LARGE_OBJECT_LIMITS.textFileLines) {
				features.tokenization = false;
				features.searchIndex = false;
				reasons.push(`text file ${measure.lines} lines > ${LARGE_OBJECT_LIMITS.textFileLines}`);
			}
			break;
		case "transcript":
			if (measure.bytes > LARGE_OBJECT_LIMITS.transcriptBytes) {
				features.fullHydration = false;
				reasons.push(`transcript ${measure.bytes} bytes > ${LARGE_OBJECT_LIMITS.transcriptBytes}`);
			}
			break;
	}
	return { kind: measure.kind, degraded: reasons.length > 0, reasons, features };
}

export interface LatchedLargeObjectDegradation {
	/** 判定时刻的快照：后续更小的测量不会把它改回可用。 */
	current(): LargeObjectDegradation;
	/** 再测一次只用于记录更大的体量，已降级的特性不会重开。 */
	observe(measure: LargeObjectMeasure): LargeObjectDegradation;
}

/** 一次性锁定：对象初始化时 `observe` 一次，之后只读 `current()`。 */
export function latchLargeObjectDegradation(measure: LargeObjectMeasure): LatchedLargeObjectDegradation {
	let decision = evaluateLargeObjectDegradation(measure);
	return {
		current: () => decision,
		observe: (next) => {
			const candidate = evaluateLargeObjectDegradation(next);
			if (candidate.degraded && !decision.degraded) decision = candidate;
			return decision;
		},
	};
}

/** 降级提示的 i18n key：文案由宿主 catalog 提供，组件只负责显示。 */
export function largeObjectDegradationNoticeKey(kind: LargeObjectKind): string {
	return `preview.degraded.${kind}`;
}
