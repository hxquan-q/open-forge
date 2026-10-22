// Modified by The Open Forge contributors.
import { cloneElement, memo, useLayoutEffect, useMemo, useRef } from "react";
import type { JSX, ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { richRemarkPlugins } from "./rich-syntax";
import type { MarkdownDefinition } from "./definition";
import { rehypeStreamingChunks } from "./streaming";
import { chatUrlTransform, normalizeLocalFileLinksInMarkdown } from "./markdown-link";

export const TAIL_LIST_MIN_LENGTH = 2500;
export const TAIL_LIST_MAX_ITEMS = 4000;

const remarkPlugins = [remarkGfm, ...richRemarkPlugins];
const LIST_ITEM_START = /^ {0,3}([-+*]|\d{1,9}[.)])(?:\s|$)/;

export interface GrowingListShape {
	readonly firstItemLine: string;
	readonly itemStarts: readonly number[];
	readonly itemLines: readonly string[];
	readonly itemsStart: number;
	readonly endsWithNewline: boolean;
	readonly isLoose: boolean;
}

export function detectGrowingList(tail: string): GrowingListShape | null {
	if (tail.length < TAIL_LIST_MIN_LENGTH) return null;
	const firstNewline = tail.indexOf("\n");
	if (firstNewline === -1) return null;
	const firstLine = tail.slice(0, firstNewline).replace(/\r$/, "");
	const marker = LIST_ITEM_START.exec(firstLine);
	if (!marker) return null;
	const markerRe = new RegExp(`^ {0,3}${marker[1].replace(/[+*]/g, "\\$&").replace(/\d/g, "\\d")}(?:\\s|$)`);
	const itemStarts: number[] = [0];
	const itemLines: string[] = [firstLine];
	let index = firstNewline + 1;
	let blankPending = false;
	let isLoose = false;
	while (index < tail.length) {
		const newline = tail.indexOf("\n", index);
		const end = newline === -1 ? tail.length : newline;
		const stripped = tail.slice(index, end).replace(/\r$/, "");
		if (stripped.length === 0) {
			blankPending = true;
		} else if (LIST_ITEM_START.test(stripped)) {
			if (!markerRe.test(stripped)) return null;
			if (blankPending) isLoose = true;
			itemStarts.push(index);
			itemLines.push(stripped);
			blankPending = false;
		} else if (stripped[0] === " " || stripped[0] === "\t") {
			blankPending = false;
		} else {
			return null;
		}
		index = newline === -1 ? tail.length : newline + 1;
	}
	if (itemStarts.length < 3) return null;
	if (itemStarts.length > TAIL_LIST_MAX_ITEMS) return null;
	return {
		firstItemLine: `${firstLine}\n`,
		itemStarts,
		itemLines,
		itemsStart: firstNewline + 1,
		endsWithNewline: tail.endsWith("\n"),
		isLoose,
	};
}

interface TailListProps {
	animateChunks: boolean;
	components: Components;
	definition: MarkdownDefinition;
	onRenderDuration?: (durationMs: number) => void;
	promotedRef: { current: number };
	itemCache: Map<string, ReactElement>;
	prependCache: Map<string, ReactElement>;
	shape: GrowingListShape;
	text: string;
}

export const TailListDocument = memo(function TailListDocument({
	animateChunks,
	components,
	definition,
	onRenderDuration,
	promotedRef,
	itemCache,
	prependCache,
	shape,
	text,
}: TailListProps): JSX.Element {
	const promoted = Math.min(promotedRef.current, shape.itemStarts.length - 1);
	const stableLines = useMemo(() => shape.itemLines.slice(1, promoted + 1), [shape, promoted]);
	const changedBlock = useMemo(() => {
		const from = shape.itemStarts[Math.min(promoted + 1, shape.itemStarts.length - 1)];
		return text.slice(from);
	}, [shape, promoted, text]);
	const miniText = useMemo(() => {
		const changedLines = changedBlock.split("\n");
		// 前缀按行数组拼接：firstItemLine 自带尾换行，再 join 会多出空行——
		// 空行使全部 li 行号偏移一格，stash 键整体错位。loose 补空行元素。
		const firstNoNl = shape.firstItemLine.replace(/\n$/, "");
		const prefixLines = shape.isLoose ? [firstNoNl, ""] : [firstNoNl];
		const normalized: string[] = prefixLines.map((line) =>
			line.length === 0 ? line : normalizeLocalFileLinksInMarkdown(line),
		);
		for (const line of changedLines) {
			normalized.push(line.length === 0 ? line : normalizeLocalFileLinksInMarkdown(line));
		}
		return normalized.join("\n");
	}, [shape, changedBlock]);

	const dynamicRef = useRef({ stableLines, itemCache, prependCache, miniText, itemLines: shape.itemLines, promoted });
	dynamicRef.current = { stableLines, itemCache, prependCache, miniText, itemLines: shape.itemLines, promoted };

	const renderStartRef = useRef(0);
	renderStartRef.current = performance.now();

	const resolved = useMemo(() => {
		const base: Components = { ...components, ...definition.components, ...definition.elements };
		const BaseItem = base.li ?? "li";
		const itemCacheRef = itemCache;
		const prependCacheRef = prependCache;
		const makeListInjector =
			(baseTag: "ul" | "ol") =>
			({ children }: { children?: React.ReactNode }): React.ReactElement | null => {
				const { stableLines: lines } = dynamicRef.current;
				const rows: ReactElement[] = [];
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					let clone = prependCacheRef.get(line);
					if (clone === undefined) {
						const cached = itemCacheRef.get(line);
						if (!cached) return null;
						clone = cloneElement(cached, { key: `stable-${index}` });
						prependCacheRef.set(line, clone);
					}
					rows.push(clone);
				}
				const BaseListComponent = base[baseTag] as React.ComponentType<{ children?: React.ReactNode }>;
				const kids = Array.isArray(children) ? children : children !== undefined && children !== null ? [children] : [];
				return (
					<BaseListComponent>
						{kids[0]}
						{rows}
						{kids.slice(1)}
					</BaseListComponent>
				);
			};
		const wrapped: Components = {
			...base,
			ul: makeListInjector("ul") as Components["ul"],
			ol: makeListInjector("ol") as Components["ol"],
			li: (function TailListItem({ children, node }: { children?: React.ReactNode; node?: { position?: { start?: { offset?: number } } } }) {
				const { itemCache: cache, miniText: mini, itemLines, promoted } = dynamicRef.current;
				const BaseItemComponent = BaseItem as React.ComponentType<{ children?: React.ReactNode }>;
				const element = <BaseItemComponent>{children}</BaseItemComponent>;
				const offset = node?.position?.start?.offset;
				if (typeof offset === "number") {
					const lineStart = mini.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
					const lineEnd = mini.indexOf("\n", offset);
					const lineText = mini.slice(lineStart, lineEnd === -1 ? mini.length : lineEnd);
					if (LIST_ITEM_START.test(lineText)) {
						const miniLineIndex = countLineStartsBefore(mini, offset);
						if (miniLineIndex >= 1) {
							const rawLine = itemLines[promoted + miniLineIndex];
							if (rawLine !== undefined) cache.set(rawLine, element);
						}
					}
				}
				return element;
			}) as Components["li"],
		};
		return wrapped;
	}, [components, definition, itemCache, prependCache]);

	const rehypePlugins = useMemo(() => {
		const plugins: NonNullable<Parameters<typeof ReactMarkdown>[0]["rehypePlugins"]> = [...(definition.rehypePlugins ?? [])];
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
		const completeItems = shape.itemStarts.length - 1;
		promotedRef.current = Math.max(promotedRef.current, Math.min(completeItems, shape.itemStarts.length));
	}, [onRenderDuration, shape]);

	return markdown;
});

function countLineStartsBefore(text: string, offset: number): number {
	let count = 0;
	for (let index = 0; index < offset && index < text.length; index += 1) {
		if (text[index] === "\n") count += 1;
	}
	return count;
}
