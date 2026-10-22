// Modified by The Open Forge contributors.
export interface StableMarkdownSplit {
	readonly committed: readonly string[];
	readonly tail: string;
}

interface FenceMarker {
	readonly char: "`" | "~";
	readonly len: number;
	readonly markerEnd: number;
	readonly indent: number;
}

function stripLineEnding(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function readFenceMarker(line: string): FenceMarker | null {
	let index = 0;
	while (index < 3 && line[index] === " ") index += 1;
	const char = line[index];
	if (char !== "`" && char !== "~") return null;
	let len = 0;
	while (line[index + len] === char) len += 1;
	if (len < 3) return null;
	return { char, len, indent: index, markerEnd: index + len };
}

function isFenceOpeningLine(line: string): FenceMarker | null {
	const fence = readFenceMarker(line);
	if (!fence) return null;
	// CommonMark：只有反引号围栏的 info string 不能含反引号，波浪线围栏的 info string 可以含 `~`。
	if (fence.char === "`" && line.includes("`", fence.markerEnd)) return null;
	return fence;
}

function isFenceClosingLine(line: string, fenceChar: FenceMarker["char"], fenceLen: number): boolean {
	const fence = readFenceMarker(line);
	if (!fence || fence.char !== fenceChar || fence.len < fenceLen) return false;
	for (let index = fence.markerEnd; index < line.length; index += 1) {
		const char = line[index];
		if (char !== " " && char !== "\t") return false;
	}
	return true;
}

/** 空行：只有空白字符。 */
function isBlankLine(line: string): boolean {
	return line.trim().length === 0;
}

/** 列表标记行（含 ≤3 空格缩进）。 */
function isListItemLine(line: string): boolean {
	return /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:\s|$)/.test(line);
}

/** 引用行（含 ≤3 空格缩进）。 */
function isBlockquoteLine(line: string): boolean {
	return /^ {0,3}>/.test(line);
}

/** 行首是否有缩进（缩进块、列表续行都从缩进开始，保守不冻结）。 */
function startsIndented(line: string): boolean {
	const char = line[0];
	return char === " " || char === "\t";
}

/** 裸方括号构造（`[label]` / `[label][ref]` / `![ref]` / `[^fn]`），可能被后文的
 * 引用定义或脚注定义追溯解析成链接；后接 `(` 的行内链接/图片自含，不受影响。 */
const UNRESOLVED_REFERENCE = /\[[^\]\n]*\](?!\()/;

type BlockClass = "list" | "quote" | "plain";

function classifyBlockStart(line: string): BlockClass {
	if (isListItemLine(line)) return "list";
	if (isBlockquoteLine(line)) return "quote";
	return "plain";
}

/** 该行是否延续当前块（空行之后仍能续上同一构造）。 */
function continuesBlock(kind: BlockClass, line: string): boolean {
	if (kind === "list") return isListItemLine(line) || startsIndented(line);
	if (kind === "quote") return isBlockquoteLine(line) || startsIndented(line);
	return false;
}

/** 扫描器的可恢复状态。所有偏移都是全文绝对偏移；literalEnd 以引用共享（只读）。 */
interface ScanState {
	/** 已提交内容之后的位置（tail 起点）。 */
	start: number;
	/** 下一个要处理的偏移。 */
	index: number;
	inFence: boolean;
	fenceChar: FenceMarker["char"];
	fenceLen: number;
	commitOnClose: boolean;
	literalEnd: RegExp | null;
	// 当前候选块（自上一次提交/字面量区结束后的第一个非空行开始）的状态。
	candidateClass: BlockClass | null;
	/** 候选块最后一个非空行（含换行）的结束偏移。 */
	candidateEnd: number;
	candidateStart: number;
	/** 候选块内是否出现过空行（块完成判定的必要条件）。 */
	candidateHadBlank: boolean;
	/** 候选块内是否干净：没有围栏与字面量区内容，也没有以 `<` 开头或缩进的行。 */
	candidateClean: boolean;
	candidateHasBracket: boolean;
	candidateHasPipe: boolean;
}

function initialScanState(): ScanState {
	return {
		start: 0,
		index: 0,
		inFence: false,
		fenceChar: "`",
		fenceLen: 0,
		commitOnClose: false,
		literalEnd: null,
		candidateClass: null,
		candidateEnd: -1,
		candidateStart: -1,
		candidateHadBlank: false,
		candidateClean: true,
		candidateHasBracket: false,
		candidateHasPipe: false,
	};
}

/** 逐字段复制状态（免分配，用于边界快照与恢复）。 */
function copyScanState(from: ScanState, to: ScanState): void {
	to.start = from.start;
	to.index = from.index;
	to.inFence = from.inFence;
	to.fenceChar = from.fenceChar;
	to.fenceLen = from.fenceLen;
	to.commitOnClose = from.commitOnClose;
	to.literalEnd = from.literalEnd;
	to.candidateClass = from.candidateClass;
	to.candidateEnd = from.candidateEnd;
	to.candidateStart = from.candidateStart;
	to.candidateHadBlank = from.candidateHadBlank;
	to.candidateClean = from.candidateClean;
	to.candidateHasBracket = from.candidateHasBracket;
	to.candidateHasPipe = from.candidateHasPipe;
}

/** 已提交块数组的写时复制容器：无新增提交时保持数组引用稳定，
 * 让上层 memo（CommittedDocuments）能在 reveal tick 间整体跳过。 */
interface CommittedStore {
	readonly array: readonly string[];
	push(block: string): void;
}

function createCommittedStore(base?: readonly string[]): CommittedStore {
	let current: readonly string[] = base ?? [];
	let cloned = base === undefined;
	return {
		get array(): readonly string[] {
			return current;
		},
		push(block: string): void {
			if (!cloned) {
				current = [...current];
				cloned = true;
			}
			(current as string[]).push(block);
		},
	};
}

/**
 * Split append-only markdown so completed top-level blocks can be frozen.
 *
 * 顶层已闭合代码围栏（后随正文）仍然整块提交。此外，满足全部守卫的顶层块也提交：
 *
 * - 块从第 0 列开始，内部没有围栏、字面量区（`$$`/原始 HTML）或以 `<` 开头的行；
 * - 不含裸方括号构造——后文才到达的链接引用/脚注定义无法再追溯改变它；
 * - 后继块已开始，且其首行不能续上当前块（列表不被新列表项延长、引用不被 `>` 延长、
 *   表格不被新行延长），避免把一个构造拆成两份语义不同的文档；
 * - 后继块首行必须是完整行（带换行）：未写完的行还可能长成列表标记或管道行
 *   （`1` → `1.`），在其上做出的判定会被后续追加翻转，破坏前缀性；
 * - 候选块必须是未提交内容的开头，保证「前缀的已提交块是任意追加后已提交块的前缀」。
 *
 * 不满足守卫的块留在 tail：行为退回整篇重解析，而不是拆出会改变渲染结果的文档。
 *
 * `boundary`（可选）在每个完整行处理完后快照状态：恢复时从该行重扫部分行，
 * 冻结判定只发生在完整行上，因此快照不含未定判定，可安全恢复。
 */
function runScan(
	text: string,
	state: ScanState,
	committed: CommittedStore,
	boundary?: { state: ScanState; committed: readonly string[]; valid: boolean },
): void {
	const resetCandidate = (): void => {
		state.candidateClass = null;
		state.candidateStart = -1;
		state.candidateEnd = -1;
		state.candidateHadBlank = false;
		state.candidateClean = true;
		state.candidateHasBracket = false;
		state.candidateHasPipe = false;
	};

	const commitThrough = (end: number): void => {
		if (end <= state.start || end > text.length) {
			resetCandidate();
			return;
		}
		const block = text.slice(state.start, end);
		if (block.trim().length === 0) {
			state.start = end;
			resetCandidate();
			return;
		}
		committed.push(block);
		state.start = end;
		resetCandidate();
	};

	const tryFreezeCandidate = (nextLine: string): void => {
		if (state.candidateClass === null || !state.candidateHadBlank || state.candidateEnd <= 0) return;
		// 只有未提交内容开头的块能冻结（候选前的纯空白段随首块一起提交，不丢字符）；
		// 已提交块必须是严格前缀，失败过的块之后不再提交。
		if (state.candidateStart !== state.start && text.slice(state.start, state.candidateStart).trim().length > 0) return;
		if (!state.candidateClean || state.candidateHasBracket) return;
		// 后继块首行不能续上当前块，也不能开启会回溯改写前块的结构。
		if (continuesBlock(state.candidateClass, nextLine)) return;
		if (startsIndented(nextLine)) return;
		if (state.candidateClass === "list" && isListItemLine(nextLine)) return;
		if (state.candidateClass === "quote" && isBlockquoteLine(nextLine)) return;
		// 表格（或任何含管道符的块）：后继行仍含 `|` 时可能还是同一张表（或把前一行
		// 变成表头），保守不冻结。
		if (state.candidateHasPipe && nextLine.includes("|")) return;
		// 普通段落后跟分隔行也不会被回溯成表头：表头与分隔行必须逐行相邻，而这里
		// 候选块与后继块之间必有空行。
		commitThrough(state.candidateEnd);
	};

	while (state.index < text.length) {
		const lineStart = state.index;
		const newline = text.indexOf("\n", state.index);
		const lineEnd = newline === -1 ? text.length : newline + 1;
		const line = stripLineEnding(text.slice(lineStart, newline === -1 ? text.length : newline));
		/** 该行是否已完整（带换行）：只有完整行上的内容不再变化，冻结判定才可恢复。 */
		const lineComplete = newline !== -1;

		// 围栏闭合行恰好是全文最后一个完整行时推迟处理：是否随文提交取决于其后是否
		// 还有正文，这一决策随文本增长才稳定；不处理也不快照，增量扫描器下次从上一
		// 行边界重扫这一行。纯函数的结果不受影响（此时两种路径都不提交）。
		if (
			state.inFence &&
			lineComplete &&
			lineEnd === text.length &&
			isFenceClosingLine(line, state.fenceChar, state.fenceLen)
		) {
			break;
		}
		const outsideLiteral = !state.inFence && !state.literalEnd;
		const math = outsideLiteral ? /^ {0,3}(\${2,})\s*$/.exec(line) : null;
		const html = outsideLiteral && !math ? /^ {0,3}<(svg|html|script|style|div|section|article|table|body|head)(?:\s|>)/i.exec(line) : null;
		const doctype = outsideLiteral && !math && !html ? /^ {0,3}<!doctype\s+html/i.test(line) : false;
		const opening = outsideLiteral && !math && !html && !doctype ? isFenceOpeningLine(line) : null;

		if (state.inFence) {
			if (isFenceClosingLine(line, state.fenceChar, state.fenceLen)) {
				state.inFence = false;
				if (state.commitOnClose && lineEnd < text.length) commitThrough(lineEnd);
				state.commitOnClose = false;
			}
			state.candidateClean = false;
		} else if (state.literalEnd) {
			// Do not freeze fence-looking text inside raw documents or display formulas.
			// Track this while scanning so previously committed prefixes remain stable.
			if (state.literalEnd.test(line)) state.literalEnd = null;
			state.candidateClean = false;
		} else if (math || html || doctype) {
			state.literalEnd = math
				? new RegExp(`^ {0,3}\\${"$"}{${math[1].length},}\\s*$`)
				: new RegExp(`</${html?.[1] ?? "html"}\\s*>`, "i");
			if (!math && state.literalEnd.test(line)) state.literalEnd = null;
			state.candidateClean = false;
		} else if (opening) {
			state.inFence = true;
			state.fenceChar = opening.char;
			state.fenceLen = opening.len;
			state.commitOnClose = opening.indent === 0;
			state.candidateClean = false;
		} else if (isBlankLine(line)) {
			if (state.candidateClass !== null) state.candidateHadBlank = true;
		} else if (state.candidateClass === null) {
			state.candidateClass = classifyBlockStart(line);
			state.candidateStart = lineStart;
			state.candidateEnd = lineEnd;
			state.candidateHadBlank = false;
			state.candidateClean = !startsIndented(line) && !line.startsWith("<");
			state.candidateHasBracket = UNRESOLVED_REFERENCE.test(line);
			state.candidateHasPipe = line.includes("|");
		} else if (state.candidateHadBlank && !continuesBlock(state.candidateClass, line)) {
			// 空行之后出现了不能续上当前块的完整行：候选块已完成，尝试冻结。
			// 部分行（流式尾部还在增长）不触发判定——其内容仍可能翻转守卫。
			if (lineComplete) tryFreezeCandidate(line);
			// 无论是否冻结成功，新候选从这一行开始（若冻结成功，start 已推进到
			// candidateEnd，否则它只是下一个候选）。
			state.candidateClass = classifyBlockStart(line);
			state.candidateStart = lineStart;
			state.candidateEnd = lineEnd;
			state.candidateHadBlank = false;
			state.candidateClean = !startsIndented(line) && !line.startsWith("<");
			state.candidateHasBracket = UNRESOLVED_REFERENCE.test(line);
			state.candidateHasPipe = line.includes("|");
		} else {
			// 块仍在继续（无空行的连续行，或列表/引用跨空行续行）。
			state.candidateHadBlank = false;
			state.candidateEnd = lineEnd;
			if (UNRESOLVED_REFERENCE.test(line)) state.candidateHasBracket = true;
			if (line.includes("|")) state.candidateHasPipe = true;
			if (startsIndented(line) || line.startsWith("<")) state.candidateClean = false;
		}

		state.index = lineEnd;
		if (boundary && lineComplete) {
			copyScanState(state, boundary.state);
			boundary.committed = committed.array;
			boundary.valid = true;
		}
	}
}

export function splitStableMarkdownBlocks(text: string): StableMarkdownSplit {
	if (text.length === 0) return { committed: [], tail: "" };
	const state = initialScanState();
	const committed = createCommittedStore();
	runScan(text, state, committed);
	return { committed: committed.array, tail: text.slice(state.start) };
}

/**
 * Append-only 流式的增量扫描器：只扫描上次之后新增的完整行，流式期间把每次
 * reveal tick 的 O(全文) 扫描降为 O(新增行)。
 *
 * - `scan` 要求新文本以旧文本为前缀（流式追加）；文本被改写时自动整体重扫；
 * - 从「最后一个完整行」的边界状态恢复，部分行下次重扫（一次一行）；
 * - 无新增提交时返回同一个数组引用，上层 memo 可据此整体跳过已冻结子树。
 */
export interface StableMarkdownScanner {
	scan(text: string): StableMarkdownSplit;
}

export function createStableMarkdownScanner(): StableMarkdownScanner {
	let lastText = "";
	let lastResult: StableMarkdownSplit = { committed: [], tail: "" };
	const boundaryState = initialScanState();
	const boundary = { state: boundaryState, committed: [] as readonly string[], valid: false };
	return {
		scan(text: string): StableMarkdownSplit {
			if (text === lastText) return lastResult;
			const state = boundary.valid && text.startsWith(lastText) ? copyOfBoundary() : initialScanState();
			const committed = createStableMarkdownStore();
			runScan(text, state, committed, boundary);
			lastText = text;
			lastResult = { committed: committed.array, tail: text.slice(state.start) };
			return lastResult;

			function copyOfBoundary(): ScanState {
				const copy = initialScanState();
				copyScanState(boundaryState, copy);
				return copy;
			}

			function createStableMarkdownStore(): CommittedStore {
				return createCommittedStore(boundary.valid && text.startsWith(lastText) ? boundary.committed : undefined);
			}
		},
	};
}
