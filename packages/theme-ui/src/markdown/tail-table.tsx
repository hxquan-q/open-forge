// Modified by The Open Forge contributors.
import { cloneElement, memo, useLayoutEffect, useMemo, useRef } from "react";
import type { JSX, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components, Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { richRemarkPlugins } from "./rich-syntax";
import type { MarkdownDefinition } from "./definition";
import { rehypeStreamingChunks } from "./streaming";
import { chatUrlTransform } from "./markdown-link";
/** react-markdown 传入的 hast 节点（位置信息用于行源文本定位）。 */
interface HastNodePosition {
	position?: { start?: { offset?: number } };
}

/** 触发增长表格快路径的最小尾块长度：与解析合并节流的阈值对齐；小表格走常规路径。 */
export const TAIL_TABLE_MIN_LENGTH = 12000;

const remarkPlugins = [remarkGfm, ...richRemarkPlugins];

const DELIMITER_ROW = /^ {0,3}\|?(?:\s*:?-{1,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/;

export interface GrowingTableShape {
	/** 表头行 + 分隔行（含换行），迷你解析的固定前缀。 */
	readonly headerBlock: string;
	/** 数据行文本（去换行），按出现顺序。 */
	readonly rowLines: readonly string[];
	/** 首个数据行在尾块中的偏移。 */
	readonly rowsStart: number;
	/** 尾块是否以换行结束（所有行都已完整）。 */
	readonly endsWithNewline: boolean;
}

/**
 * 识别「整段尾块就是一张仍在增长的 GFM 表格」：首两行是表头 + 分隔行，其后每行都
 * 是含管道符的表格行。任何其他非空行（段落、围栏、空行等）都让检测失败，回退常规
 * 整篇路径——混合结构不承担拆分风险。纯函数：调用方按推进状态决定稳定/变化边界。
 */
export function detectGrowingTable(tail: string): GrowingTableShape | null {
	if (tail.length < TAIL_TABLE_MIN_LENGTH) return null;
	let start = 0;
	while (start < tail.length && (tail[start] === "\n" || tail[start] === "\r")) start += 1;
	const firstNewline = tail.indexOf("\n", start);
	if (firstNewline === -1) return null;
	const headerLine = tail.slice(start, firstNewline).replace(/\r$/, "");
	const secondNewline = tail.indexOf("\n", firstNewline + 1);
	if (secondNewline === -1) return null;
	const delimiterLine = tail.slice(firstNewline + 1, secondNewline).replace(/\r$/, "");
	if (!headerLine.includes("|") || !DELIMITER_ROW.test(delimiterLine)) return null;

	const rowLines: string[] = [];
	let index = secondNewline + 1;
	while (index < tail.length) {
		const newline = tail.indexOf("\n", index);
		const end = newline === -1 ? tail.length : newline;
		const line = tail.slice(index, end).replace(/\r$/, "");
		if (line.length === 0 || !line.includes("|")) return null;
		rowLines.push(line);
		index = newline === -1 ? tail.length : newline + 1;
	}
	if (rowLines.length < 2) return null;
	return {
		headerBlock: tail.slice(start, secondNewline + 1),
		rowLines,
		rowsStart: secondNewline + 1,
		endsWithNewline: tail.endsWith("\n"),
	};
}

/** 行文本 → 行元素缓存；由宿主持有，便于在渲染前校验完备性（缺失即回退常规路径）。 */
export type TableRowCache = Map<string, ReactElement>;

interface TailTableProps {
	animateChunks: boolean;
	components: Components;
	definition: MarkdownDefinition;
	onRenderDuration?: (durationMs: number) => void;
	promotedRef: { current: number };
	rowCache: TableRowCache;
	shape: GrowingTableShape;
	text: string;
}

/**
 * 增长表格尾块的快路径：稳定行复用上一次迷你渲染捕获的行元素（同一引用让 React
 * 整行跳过），每次快照只解析「表头 + 分隔行 + 变化行」。表壳与行/单元格使用与常规
 * 路径完全相同的组件映射；tbody 在 children 之前回放缓存的稳定行元素。
 *
 * 推进协议（滞后一拍）：`promoted` 只记「已被某次迷你渲染渲染过完整内容」的行数；
 * 本次渲染后，除末行（若尾块不以换行结束）外的迷你行都视为已完整渲染，推进
 * `promoted`。由此任何行被回放前都必然存在其完整内容的缓存，缓存 miss 结构性不会
 * 发生；万一发生（异常输入）则整体回退 null 由上层走常规路径。
 *
 * 正确性依赖：行内容 append-only（行完成后不再变化）；行渲染只依赖自身单元格内容、
 * 分隔行对齐与组件映射；表格在 rehype 分段中按字面量处理（无分段 span 交互）。
 */
/** memo 屏障与 MarkdownDocument 对齐：reveal tick（displayText 变化但尾块文本
 * 未变）不重跑迷你解析；shape 随尾块文本变化，身份即失效信号。 */
export const TailTableDocument = memo(function TailTableDocument({
	animateChunks,
	components,
	definition,
	onRenderDuration,
	promotedRef,
	rowCache,
	shape,
	text,
}: TailTableProps): JSX.Element {
	const promoted = Math.min(promotedRef.current, shape.rowLines.length);
	const stableLines = useMemo(() => shape.rowLines.slice(0, promoted), [shape, promoted]);
	const changedBlock = useMemo(() => {
		let offset = shape.rowsStart;
		for (let i = 0; i < promoted; i += 1) {
			const next = text.indexOf("\n", offset);
			if (next === -1) return text.slice(offset);
			offset = next + 1;
		}
		return text.slice(offset);
	}, [shape, promoted, text]);
	const miniText = useMemo(() => shape.headerBlock + changedBlock, [shape, changedBlock]);

	const renderStartRef = useRef(0);
	renderStartRef.current = performance.now();

	// 动态状态经 ref 读取，包装组件每实例只创建一次：组件身份变化会让 React 把整个
	// tbody 子树当新组件类型重挂，稳定行的 DOM 身份保证就失效了。
	const dynamicRef = useRef({ stableLines, rowCache, miniText });
	dynamicRef.current = { stableLines, rowCache, miniText };

	const resolved = useMemo(() => {
		const base: Components = { ...components, ...definition.components, ...definition.elements };
		const BaseTbody = base.tbody ?? "tbody";
		const BaseTr = base.tr ?? "tr";
		const wrapped: Components = {
			...base,
			tbody: (function TailTableBody({ children }: { children?: React.ReactNode }) {
				const { stableLines: lines, rowCache: cache } = dynamicRef.current;
				const rows: ReactElement[] = [];
				for (const line of lines) {
					const cached = cache.get(line);
					if (!cached) return null;
					rows.push(cached);
				}
				const BaseTbodyComponent = BaseTbody as React.ComponentType<{ children?: React.ReactNode }>;
				return (
					<BaseTbodyComponent>
						{rows.map((row, index) => cloneElement(row, { key: `stable-${index}` }))}
						{children}
					</BaseTbodyComponent>
				);
			}) as Components["tbody"],
			tr: (function TailTableRow({ children, node }: { children?: React.ReactNode; node?: HastNodePosition }) {
				const { rowCache: cache, miniText: mini } = dynamicRef.current;
				const BaseTrComponent = BaseTr as React.ComponentType<{ children?: React.ReactNode }>;
				const element = <BaseTrComponent>{children}</BaseTrComponent>;
				const offset = node?.position?.start?.offset;
				if (typeof offset === "number") {
					const line = sourceLineAt(mini, offset);
					if (line !== null && line.includes("|")) cache.set(line, element);
				}
				return element;
			}) as Components["tr"],
		};
		return wrapped;
		// 动态数据经 dynamicRef 读取；components/definition 身份稳定（宿主保证）。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [components, definition]);

	const rehypePlugins = useMemo(() => {
		const plugins: NonNullable<Options["rehypePlugins"]> = [...(definition.rehypePlugins ?? [])];
		if (animateChunks) plugins.push(rehypeStreamingChunks);
		return plugins.length > 0 ? plugins : undefined;
	}, [definition, animateChunks]);
	const remark = useMemo(() => [...remarkPlugins, ...(definition.remarkPlugins ?? [])], [definition]);

	const markdown = ReactMarkdown({
		remarkPlugins: remark,
		rehypePlugins,
		components: resolved,
		urlTransform: chatUrlTransform,
		children: miniText,
	});

	const parseDurationRef = useRef(0);
	parseDurationRef.current = performance.now() - renderStartRef.current;
	useLayoutEffect(() => {
		onRenderDuration?.(parseDurationRef.current);
		// 滞后一拍推进：本次迷你渲染渲染过完整内容的行下一次快照才进入回放列表。
		// 最后一行永远留在迷你渲染里：它是最可能继续增长的一行，也保证迷你表格始终
		// 有数据行（tbody 存在，稳定行才有挂载位置）。
		const completeRows = shape.rowLines.length - 1;
		promotedRef.current = Math.max(promotedRef.current, Math.min(completeRows, shape.rowLines.length));
	}, [onRenderDuration, shape]);

	return markdown;
});

/** 从迷你文本按偏移取行文本（去换行）；越界返回 null。 */
function sourceLineAt(text: string, offset: number): string | null {
	if (offset < 0 || offset >= text.length) return null;
	const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
	const end = text.indexOf("\n", offset);
	return text.slice(start, end === -1 ? text.length : end).replace(/\r$/, "");
}
