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

/**
 * Split append-only markdown so completed top-level blocks can be frozen.
 *
 * 顶层已闭合代码围栏（后随正文）仍然整块提交。此外，满足全部守卫的顶层块也提交：
 *
 * - 块从第 0 列开始，内部没有围栏、字面量区（`$$`/原始 HTML）或以 `<` 开头的行；
 * - 不含裸方括号构造——后文才到达的链接引用/脚注定义无法再追溯改变它；
 * - 后继块已开始，且其首行不能续上当前块（列表不被新列表项延长、引用不被 `>` 延长、
 *   表格不被新行延长），避免把一个构造拆成两份语义不同的文档；
 * - 候选块必须是未提交内容的开头，保证「前缀的已提交块是任意追加后已提交块的前缀」。
 *
 * 不满足守卫的块留在 tail：行为退回整篇重解析，而不是拆出会改变渲染结果的文档。
 * 空行不是普通段落的终结判定条件本身；段落以「空行 + 后继块首行」共同判定完成。
 */
export function splitStableMarkdownBlocks(text: string): StableMarkdownSplit {
	if (text.length === 0) return { committed: [], tail: "" };

	const committed: string[] = [];
	let start = 0;
	let index = 0;
	let inFence = false;
	let fenceChar: FenceMarker["char"] = "`";
	let fenceLen = 0;
	let commitOnClose = false;
	let literalEnd: RegExp | null = null;

	// 当前候选块（自上一次提交/字面量区结束后的第一个非空行开始）的状态。
	let candidateClass: BlockClass | null = null;
	let candidateStart = -1;
	/** 候选块最后一个非空行（含换行）的结束偏移。 */
	let candidateEnd = -1;
	/** 候选块内是否出现过空行（块完成判定的必要条件）。 */
	let candidateHadBlank = false;
	/** 候选块内是否干净：没有围栏与字面量区内容，也没有以 `<` 开头的行。 */
	let candidateClean = true;
	let candidateHasBracket = false;
	let candidateHasPipe = false;

	const resetCandidate = (): void => {
		candidateClass = null;
		candidateStart = -1;
		candidateEnd = -1;
		candidateHadBlank = false;
		candidateClean = true;
		candidateHasBracket = false;
		candidateHasPipe = false;
	};

	const commitThrough = (end: number): void => {
		if (end <= start || end > text.length) {
			resetCandidate();
			return;
		}
		const block = text.slice(start, end);
		if (block.trim().length === 0) {
			start = end;
			resetCandidate();
			return;
		}
		committed.push(block);
		start = end;
		resetCandidate();
	};

	const tryFreezeCandidate = (nextLine: string): void => {
		if (candidateClass === null || !candidateHadBlank || candidateEnd <= 0) return;
		// 只有未提交内容开头的块能冻结（候选前的纯空白段随首块一起提交，不丢字符）；
		// 已提交块必须是严格前缀，失败过的块之后不再提交。
		if (candidateStart !== start && text.slice(start, candidateStart).trim().length > 0) return;
		if (!candidateClean || candidateHasBracket) return;
		// 后继块首行不能续上当前块，也不能开启会回溯改写前块的结构。
		if (continuesBlock(candidateClass, nextLine)) return;
		if (startsIndented(nextLine)) return;
		if (candidateClass === "list" && isListItemLine(nextLine)) return;
		if (candidateClass === "quote" && isBlockquoteLine(nextLine)) return;
		// 表格（或任何含管道符的块）：后继行仍含 `|` 时可能还是同一张表（或把前一行
		// 变成表头），保守不冻结。
		if (candidateHasPipe && nextLine.includes("|")) return;
		// 普通段落后跟分隔行也不会被回溯成表头：表头与分隔行必须逐行相邻，而这里
		// 候选块与后继块之间必有空行。
		commitThrough(candidateEnd);
	};

	while (index < text.length) {
		const lineStart = index;
		const newline = text.indexOf("\n", index);
		const lineEnd = newline === -1 ? text.length : newline + 1;
		const line = stripLineEnding(text.slice(lineStart, newline === -1 ? text.length : newline));

		if (inFence) {
			if (isFenceClosingLine(line, fenceChar, fenceLen)) {
				inFence = false;
				if (commitOnClose && lineEnd < text.length) commitThrough(lineEnd);
				commitOnClose = false;
			}
			candidateClean = false;
			index = lineEnd;
			continue;
		}

		// Do not freeze fence-looking text inside raw documents or display formulas.
		// Track this while scanning so previously committed prefixes remain stable.
		if (literalEnd) {
			if (literalEnd.test(line)) literalEnd = null;
			candidateClean = false;
			index = lineEnd;
			continue;
		}
		const math = /^ {0,3}(\${2,})\s*$/.exec(line);
		const html = /^ {0,3}<(svg|html|script|style|div|section|article|table|body|head)(?:\s|>)/i.exec(line);
		if (math || html || /^ {0,3}<!doctype\s+html/i.test(line)) {
			literalEnd = math
				? new RegExp(`^ {0,3}\\${"$"}{${math[1].length},}\\s*$`)
				: new RegExp(`</${html?.[1] ?? "html"}\\s*>`, "i");
			if (!math && literalEnd.test(line)) literalEnd = null;
			candidateClean = false;
			index = lineEnd;
			continue;
		}
		const opening = isFenceOpeningLine(line);
		if (opening) {
			inFence = true;
			fenceChar = opening.char;
			fenceLen = opening.len;
			commitOnClose = opening.indent === 0;
			candidateClean = false;
			index = lineEnd;
			continue;
		}

		if (isBlankLine(line)) {
			if (candidateClass !== null) candidateHadBlank = true;
			index = lineEnd;
			continue;
		}

		if (candidateClass === null) {
			// 候选块从这里开始；之前的空行仍归 tail（或上一个未提交块）。
			candidateClass = classifyBlockStart(line);
			candidateStart = lineStart;
			candidateEnd = lineEnd;
			candidateHadBlank = false;
			candidateClean = !startsIndented(line) && !line.startsWith("<");
			candidateHasBracket = UNRESOLVED_REFERENCE.test(line);
			candidateHasPipe = line.includes("|");
			index = lineEnd;
			continue;
		}

		if (candidateHadBlank && !continuesBlock(candidateClass, line)) {
			// 空行之后出现了不能续上当前块的行：候选块已完成，尝试冻结。
			tryFreezeCandidate(line);
			// 无论是否冻结成功，新候选从这一行开始（若冻结成功，start 已推进到
			// candidateEnd，新候选成为未提交内容的开头；否则它只是下一个候选）。
			candidateClass = classifyBlockStart(line);
			candidateStart = lineStart;
			candidateEnd = lineEnd;
			candidateHadBlank = false;
			candidateClean = !startsIndented(line) && !line.startsWith("<");
			candidateHasBracket = UNRESOLVED_REFERENCE.test(line);
			candidateHasPipe = line.includes("|");
			index = lineEnd;
			continue;
		}

		// 块仍在继续（无空行的连续行，或列表/引用跨空行续行）。
		candidateHadBlank = false;
		candidateEnd = lineEnd;
		if (line.includes("[")) candidateHasBracket = true;
		if (line.includes("|")) candidateHasPipe = true;
		if (startsIndented(line) || line.startsWith("<")) candidateClean = false;
		index = lineEnd;
	}

	return { committed, tail: text.slice(start) };
}
