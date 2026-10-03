// Modified by The Open Forge contributors.
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { codeToHtml } from "shiki";
import { highlightHtmlCache } from "./syntax-highlight-cache";

export interface SyntaxHighlightedCodeProps {
	code: string;
	lang: string;
	theme: "light" | "dark";
	/** 字号跟随所在正文的排版尺度；不传时用 12px 的紧凑默认值。 */
	fontSizeClass?: string;
	/**
	 * 流式尾块里的代码仍可能在涨。为 true 时只渲染等宽纯文本，不跑 Shiki。
	 * 围栏稳定或尾块结束后由调用方关掉。
	 */
	live?: boolean;
}

/**
 * 高亮结果缓存放 ./syntax-highlight-cache（条数 + 字符预算双上限）。消息列表
 * 跑在虚拟列表上，条目滚出视窗会被卸载、滚回来重新挂载；命中缓存时首帧就是
 * 高亮结果，只有一次布局——往回滚不会先纯文本再换导致高度重测两次。
 */
const VIEWPORT_ROOT_MARGIN = "400px 0px";

function cacheKeyFor(theme: string, language: string, code: string): string {
	return JSON.stringify([theme, language, code]);
}

/** 限制语法工作与生成 span 的规模；超限块退纯文本，源码仍可读可复制（上游 a8029e94f）。 */
function withinHighlightBudget(code: string, lang: string): boolean {
	if (code.length > 30000 || lang.length > 128) return false;
	let lineLength = 0;
	let lines = 1;
	for (const char of code) {
		if (char === "\n") {
			lineLength = 0;
			lines++;
		} else lineLength++;
		if (lineLength > 2000 || lines > 1000) return false;
	}
	return true;
}

function PlainCode({ code, fontSizeClass }: { code: string; fontSizeClass: string }): JSX.Element {
	return (
		<pre className="overflow-x-auto p-3">
			<code className={`${fontSizeClass} leading-[1.6] text-foreground`}>{code}</code>
		</pre>
	);
}

/**
 * Shiki-highlighted code block. Plain text while loading, offscreen, live, or on error.
 */
export function SyntaxHighlightedCode({
	code,
	lang,
	theme,
	fontSizeClass = "text-[12px]",
	live = false,
}: SyntaxHighlightedCodeProps): JSX.Element {
	const language = lang || "text";
	const eligible = useMemo(() => withinHighlightBudget(code, language), [code, language]);
	const cacheKey = useMemo(
		() => (eligible ? cacheKeyFor(theme, language, code) : ""),
		[eligible, theme, language, code],
	);
	const html = highlightHtmlCache.get(cacheKey) ?? null;
	const hostRef = useRef<HTMLDivElement>(null);
	const [inView, setInView] = useState(html !== null);
	const [, forceRender] = useState(0);

	useEffect(() => {
		if (!eligible || live) return;
		if (highlightHtmlCache.has(cacheKey)) {
			setInView(true);
			return;
		}
		const node = hostRef.current;
		if (!node || typeof IntersectionObserver !== "function") {
			setInView(true);
			return;
		}
		let visible = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				visible = true;
				setInView(true);
				observer.disconnect();
			},
			{ rootMargin: VIEWPORT_ROOT_MARGIN },
		);
		observer.observe(node);
		return () => {
			observer.disconnect();
			if (!visible) setInView(false);
		};
	}, [cacheKey, eligible, live]);

	// html 必须进依赖：条目可能被缓存字符预算挤出，仍挂载的块在下一次重渲染读到
	// null 时要经这里走既有未命中路径重新高亮自愈，否则会永久停留在纯文本。
	useEffect(() => {
		if (live || !eligible || !inView || highlightHtmlCache.has(cacheKey)) return;
		let cancelled = false;
		codeToHtml(code, {
			lang: language,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				highlightHtmlCache.put(cacheKey, result);
				if (!cancelled) forceRender((tick) => tick + 1);
			})
			.catch(() => {
				highlightHtmlCache.put(cacheKey, "");
				if (!cancelled) forceRender((tick) => tick + 1);
			});
		return () => {
			cancelled = true;
		};
	}, [cacheKey, code, eligible, html, inView, language, live, theme]);

	const showPlain = live || !eligible || html === null || html === "";
	return (
		<div ref={hostRef}>
			{showPlain ? (
				<PlainCode code={code} fontSizeClass={fontSizeClass} />
			) : (
				<div
					className={`overflow-x-auto ${fontSizeClass} leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!p-3 [&_code]:!bg-transparent`}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			)}
		</div>
	);
}
