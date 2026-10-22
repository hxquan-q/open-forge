// Modified by The Open Forge contributors.
import { memo, useLayoutEffect, useRef } from "react";
import type { JSX } from "react";
import { BuiltinCodeBlock } from "./builtin-renderers";
import type { MarkdownDefinition } from "./definition";
import type { MarkdownLabels } from "./rich-labels";

/** 触发未闭合围栏直渲染的最小尾块长度：小围栏解析便宜，走常规路径保持一致性。 */
export const TAIL_FENCE_MIN_LENGTH = 12000;

export interface GrowingFenceShape {
	/** info string 首词（语言），与 remark-rehype 生成的 `language-` 类一致。 */
	readonly lang: string;
	/** 围栏内容（开行之后到尾块末尾）。 */
	readonly content: string;
}

/**
 * 识别「整段尾块就是一个未闭合的顶层围栏」：首行是 0 缩进开围栏，其后没有闭合行。
 * 未闭合围栏在 EOF 前的内容全部是字面代码——解析结果完全确定，可直接交给代码块
 * 组件渲染而无需 markdown 解析。闭合行出现、CRLF 或缩进开栏都回退常规路径。
 */
export function detectGrowingFence(tail: string): GrowingFenceShape | null {
	if (tail.length < TAIL_FENCE_MIN_LENGTH) return null;
	const firstNewline = tail.indexOf("\n");
	if (firstNewline === -1) return null;
	const openLine = tail.slice(0, firstNewline).replace(/\r$/, "");
	if (openLine.length === 0 || openLine[0] !== "`" && openLine[0] !== "~") return null;
	const fenceChar = openLine[0];
	let fenceLen = 0;
	while (openLine[fenceLen] === fenceChar) fenceLen += 1;
	if (fenceLen < 3) return null;
	const info = openLine.slice(fenceLen);
	// CommonMark：反引号围栏的 info string 不能含反引号；波浪线围栏可以含波浪线。
	if (fenceChar === "`" && info.includes("`")) return null;

	let index = firstNewline + 1;
	while (index < tail.length) {
		const newline = tail.indexOf("\n", index);
		const end = newline === -1 ? tail.length : newline;
		const raw = tail.slice(index, end);
		// CRLF 内容与解析路径的换行归一差异不承担，直接回退常规路径。
		if (raw.includes("\r")) return null;
		const line = raw;
		// 闭合行：同字符、长度不小于开栏，且其余部分只有空白。
		let closeLen = 0;
		while (line[closeLen] === fenceChar) closeLen += 1;
		if (closeLen >= fenceLen && line.slice(closeLen).trim().length === 0) return null;
		index = newline === -1 ? tail.length : newline + 1;
	}
	return { lang: info.trim().split(/\s+/)[0] ?? "", content: tail.slice(firstNewline + 1) };
}

interface TailFenceProps {
	definition: MarkdownDefinition;
	labelsRef: { current: MarkdownLabels };
	lang: string;
	content: string;
	live: boolean;
	onRenderDuration?: (durationMs: number) => void;
	theme: "light" | "dark";
}

/**
 * 未闭合围栏尾块的直渲染：与常规解析路径输出完全一致——components.code 对
 * `language-` 块走 definition.codeBlock（默认 BuiltinCodeBlock），code 为去掉单个
 * 尾换行的围栏内容，live 由渲染上下文提供。零 markdown 解析。
 */
export const TailFenceDocument = memo(function TailFenceDocument({
	definition,
	labelsRef,
	lang,
	content,
	live,
	onRenderDuration,
	theme,
}: TailFenceProps): JSX.Element {
	const renderStartRef = useRef(0);
	renderStartRef.current = performance.now();
	const CodeBlock = definition.codeBlock ?? BuiltinCodeBlock;
	const markdown = (
		<CodeBlock
			lang={lang}
			code={content.replace(/\n$/, "")}
			theme={theme}
			labels={labelsRef.current}
			live={live}
		/>
	);
	const durationRef = useRef(0);
	durationRef.current = performance.now() - renderStartRef.current;
	useLayoutEffect(() => {
		onRenderDuration?.(durationRef.current);
	}, [onRenderDuration, content, lang]);
	return markdown;
});
