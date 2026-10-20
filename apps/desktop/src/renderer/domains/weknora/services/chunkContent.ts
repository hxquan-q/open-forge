// Copyright The Open Forge contributors.

/**
 * chunk 原文的切段与噪声识别(F3 v2,纯函数;07-acceptance-fixes.md)。
 *
 * 弹层展示 WeKnora chunk 原文,正文里可能夹着桌面端渲染不了的长串噪声。切段器把它拆成:
 * - `text` —— 普通正文,按纯文本渲染;
 * - `image` —— Markdown 内联图片语法 `![alt](minio://…)`,ref 交给调用方经鉴权代理取回渲染 `<img>`;
 * - `placeholder` —— 兜底占位:非 minio 的图片语法(取不到)、以及**无 image 语法的裸 `minio://…` 串**。
 *
 * 图片是唯一被提升为元素的语法,其余一律纯文本(AC-15 精神:不执行任意 HTML/markdown)。
 * alt 一律丢弃(07 取简裁定);本模块只做切分,不取数、不渲染。
 *
 * 与 `citationTag`(解析服务端展开的 `<kb/>`/`<web/>` 引用标签)是两个 actor,故独立成文件。
 */

/** Markdown 内联图片语法 `![alt](url "title")`;捕获组 1 = 括号内内容(url + 可选 title)。 */
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)]*)\)/g;
/** 裸 minio 对象地址:吃到一个空白或收尾符为止(不吞 markdown/HTML 的闭合括号与引号)。 */
const MINIO_URI_RE = /minio:\/\/[^\s)\]}>"'`]+/g;
/**
 * minio 串尾部可能粘上的句读(URL 自身不会以这些结尾,`.png` 里的点在串中间不受影响)。
 * 切段时把尾随句读原样留在占位符之后,避免把正文标点一起吃掉。
 */
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？、]+$/;
/** 能经 `/files` 代理取回的对象地址前缀(仅 minio 内部地址;http(s) 外链取不到)。 */
const MINIO_SCHEME = "minio://";

export type ChunkContentSegment =
	| { readonly type: "text"; readonly text: string }
	/** Markdown 图片语法里的 minio 引用,交给调用方取图渲染。 */
	| { readonly type: "image"; readonly ref: string }
	/** 兜底占位(非 minio 图片语法 / 裸 minio 串);文案由调用方经 i18n 渲染。 */
	| { readonly type: "placeholder" };

/**
 * 把 chunk 原文切成 text/image/placeholder 段序列。
 *
 * 永不抛错、永不丢正文:解析不了的图片语法降级为 placeholder,裸 minio 串同样降级,
 * 其余字节原样落在 text 段里(含换行与空格)。
 */
export function parseChunkContent(content: string): readonly ChunkContentSegment[] {
	const segments: ChunkContentSegment[] = [];
	let cursor = 0;
	for (const match of content.matchAll(MARKDOWN_IMAGE_RE)) {
		const start = match.index ?? 0;
		pushTextSegments(segments, content.slice(cursor, start));
		const url = (match[1] ?? "").trim().split(/\s+/)[0] ?? "";
		segments.push(url.startsWith(MINIO_SCHEME) ? { type: "image", ref: url } : { type: "placeholder" });
		cursor = start + match[0].length;
	}
	pushTextSegments(segments, content.slice(cursor));
	return segments;
}

/** 把一段普通文本按裸 minio 串再切出 placeholder 段,其余按原样成为 text 段。 */
function pushTextSegments(segments: ChunkContentSegment[], text: string): void {
	if (text.length === 0) return;
	let cursor = 0;
	for (const match of text.matchAll(MINIO_URI_RE)) {
		const start = match.index ?? 0;
		if (start > cursor) segments.push({ type: "text", text: text.slice(cursor, start) });
		const trimmed = match[0].replace(TRAILING_PUNCTUATION_RE, "");
		segments.push({ type: "placeholder" });
		const trailing = match[0].slice(trimmed.length);
		if (trailing.length > 0) segments.push({ type: "text", text: trailing });
		cursor = start + match[0].length;
	}
	if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
}
