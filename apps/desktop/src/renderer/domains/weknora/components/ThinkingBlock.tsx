// Copyright The Open Forge contributors.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ThinkingBlockProps {
	/** 思考原文（纯文本；流式期间持续增长）。 */
	readonly text: string;
	/** 默认是否展开：流式中为 `true`，结束后自动收拢（AC-25）。 */
	readonly defaultOpen: boolean;
	/**
	 * 是否正处于「本次生成」的流式态（AC-4/AC-6）：只有它才给新到达的字符挂逐字入场动画。
	 * 历史载入与终态消息恒 `false` —— 否则每次进页面都会把全文重播一遍。
	 */
	readonly streaming: boolean;
}

/**
 * 逐字入场的参数（AC-4）。
 *
 * 为什么是「尾部窗口」而不是整段 span、也不是只挂本轮新增：
 * - 整段 span：长回答下 span 数随文本线性增长，每次 delta 都要 diff 上千个节点（R1 卡顿）。
 * - 只挂本轮新增：下一次 delta 到来时上一批 span 会被换成纯文本节点，420ms 的入场在小分片高频
 *   到达时被腰斩成「瞬间出现」—— 而这恰恰是最常见的流式节奏。
 * - 尾部窗口：只给末尾 W 个字符挂 span，窗口外的旧字符是纯文本。字符以**绝对下标**为 key，
 *   只要还在窗口内，React 就复用同一 DOM 节点、样式不变 → 动画不重播；掉出窗口时动画早已播完
 *   （窗口按到达速率留了覆盖 420ms 的余量），换成纯文本无视觉变化。span 数上界 = W。
 */
const STREAM_CHAR_WINDOW = 64;
/** 同一批新字符的错峰步长与总量上限（毫秒）：大批量到达时不至于让末尾字符等太久。 */
const STREAM_CHAR_STAGGER_MS = 22;
const STREAM_CHAR_STAGGER_MAX_MS = 200;

function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * 流式文本的逐字入场（AC-4）。
 *
 * 结构说明：可见层是逐字符 span（`aria-hidden`），另有一份**视觉隐藏的整串文本**给辅助技术与文本
 * 查询 —— 逐字 span 把段落文本拆成单字后，屏幕阅读器与按整串文本查找的调用都拿不到连续串，
 * 保留一份连续文本是「装饰性分段文字」的通行做法（span 层对 AT aria-hidden，避免读两遍）。
 */
function StreamingText({ text }: { readonly text: string }): JSX.Element {
	// 上次渲染的文本长度（UTF-16），用来判定哪些字符是本轮新增。
	const prevLengthRef = useRef(0);
	// 下标 → animation-delay。延迟一经分配不再变，复用节点的样式才稳定（不会重播动画）。
	const delaysRef = useRef(new Map<number, number>());

	const length = text.length;
	// 文本变短 = 换了内容（新消息 / 重挂）：清掉增量记忆，重新从头算。
	if (length < prevLengthRef.current) {
		delaysRef.current.clear();
		prevLengthRef.current = 0;
	}
	const prevLength = prevLengthRef.current;
	let windowStart = Math.max(0, length - STREAM_CHAR_WINDOW);
	// 窗口边界不能落在代理对中间，否则会切出孤立代理项（emoji 显示成方块）。
	if (windowStart > 0 && isLowSurrogate(text.charCodeAt(windowStart))) windowStart -= 1;

	// 给本轮新增（下标 >= prevLength）且在窗口内的字符分配错峰延迟。渲染期改 ref 是刻意的：
	// 分配是幂等的（同一下标只算一次，值只取决于它首次出现时的 prevLength），StrictMode 双渲染安全。
	for (let index = Math.max(windowStart, prevLength); index < length; index += 1) {
		const delay = Math.min((index - prevLength) * STREAM_CHAR_STAGGER_MS, STREAM_CHAR_STAGGER_MAX_MS);
		delaysRef.current.set(index, delay);
	}
	// 掉出窗口的下标随手清掉：Map 只留当前窗口的延迟，大小有界。
	for (const index of delaysRef.current.keys()) {
		if (index < windowStart) delaysRef.current.delete(index);
	}
	prevLengthRef.current = length;

	// 多字符文本被拆成单字 span 后，屏幕阅读器与按整串文本查找的调用都拿不到连续串 —— 另放一份
	// 视觉隐藏的连续文本（可见层对 AT aria-hidden，避免读两遍）。单字符文本没有「拆开」这件事，
	// 逐字 span 本身就是整串，不再放锚点，否则同一串会在 DOM 里出现两次。
	const withAnchor = length > 1;

	const characters: JSX.Element[] = [];
	let offset = windowStart;
	for (const character of text.slice(windowStart)) {
		characters.push(
			<span
				className="weknora-stream-char"
				key={offset}
				style={{ animationDelay: `${delaysRef.current.get(offset) ?? 0}ms` }}
			>
				{character}
			</span>,
		);
		offset += character.length;
	}

	return (
		<>
			{withAnchor ? <span className="sr-only select-none">{text}</span> : null}
			<span aria-hidden={withAnchor ? "true" : undefined}>
				{text.slice(0, windowStart)}
				{characters}
			</span>
		</>
	);
}

/**
 * 思考过程折叠块（AC-25）。
 *
 * 与「正式回答」可见地区分：默认态 = 流式中展开、结束后收拢；可手动展开 / 收拢。
 * 自持开合状态，**不 import** open-forge 原版会话域的 ThinkingBlock —— 跨 domain 依赖会触发架构守卫。
 *
 * T02（AC-4~6）：流式期间的新到达字符做逐字入场动画；终态与历史载入走纯文本分支，不挂动画。
 */
export function ThinkingBlock({ text, defaultOpen, streaming }: ThinkingBlockProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [open, setOpen] = useState(defaultOpen);

	// 流式结束（defaultOpen 由 true → false）时自动收拢；用户手动开合不会被反复覆盖。
	useEffect(() => {
		setOpen(defaultOpen);
	}, [defaultOpen]);

	return (
		<div className="mb-2 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
			<button
				type="button"
				aria-expanded={open}
				className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
				onClick={() => setOpen((value) => !value)}
			>
				<span
					aria-hidden="true"
					className={`icon-[solar--alt-arrow-down-linear] transition-transform ${open ? "" : "-rotate-90"}`}
				/>
				<span>{t("message.thinking")}</span>
				<span className="ml-auto">{open ? t("message.thinkingHide") : t("message.thinkingShow")}</span>
			</button>
			{open ? (
				<p className="whitespace-pre-wrap break-words border-border/30 border-t px-2.5 py-2 text-[13px] text-muted-foreground">
					{streaming ? <StreamingText text={text} /> : text}
				</p>
			) : null}
		</div>
	);
}
