// Copyright The Open Forge contributors.

/**
 * WeKnora 引用标签解析(T01;02-plan §2-1 模块 1,纯函数,store 数据零改动 D1)。
 *
 * 服务端把模型私有句柄 <ref id="cN"/> 展开成 <kb doc chunk_id kb_id/> / <web url title/>
 * 内联标签,属性值经 Go html.EscapeString 转义(上游 internal/modelcontext/citations.go
 * 的 ExpandText)。识别/属性正则与尾部残缺判定照抄官方前端契约
 * frontend/src/utils/citationMarkdown.ts(v0.8.2),不另发明口径——将来上游改标签形态时,
 * 两端行为可以逐条对表。
 */

/** 官方 KB_WEB_TAG_RE:自闭合或未闭合的 <kb/>/<web/> 标签。大小写敏感,与上游一致(<KB> 不识别)。 */
const KB_WEB_TAG_RE = /<(?:kb|web)\b[^>]*?\s*\/?>/g;
/** 官方 ATTRIBUTE_REGEX:属性一律 name="value" 双引号形态;值域 [^"]* 天然兼容全角引号文档名。 */
const ATTRIBUTE_RE = /([\w-]+)\s*=\s*"([^"]*)"/g;

/**
 * 上游 escapeAttr(Go html.EscapeString)只可能产出这五种实体,外加 quot/apos 双保险。
 * 单遍解码:`&amp;lt;` 解到 `&lt;` 为止,不会被二次解开成 `<`。
 */
const ESCAPED_ENTITY_RE = /&(amp|lt|gt|quot|apos|#34|#39|#38|#60|#62);/g;
const ENTITY_BY_NAME: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	"#34": '"',
	"#39": "'",
	"#38": "&",
	"#60": "<",
	"#62": ">",
};

/** 尾部残缺判定用前缀(上游 stripIncompleteCitationTag 同款,含 /i):`<`、`<k`、`<kb`、`<kb …`。 */
const INCOMPLETE_KB_PREFIX_RE = /^<k(?:b(?:\s[\s\S]*)?)?$/i;
const INCOMPLETE_WEB_PREFIX_RE = /^<w(?:e(?:b(?:\s[\s\S]*)?)?)?$/i;

export interface KbCitationTag {
	readonly kind: "kb";
	readonly doc?: string;
	readonly chunkId?: string;
	readonly kbId?: string;
}

export interface WebCitationTag {
	readonly kind: "web";
	readonly url?: string;
	readonly title?: string;
}

/** 结构化标签属性(AC-13:UI 只消费所需字段,属性缺失/多余均容忍)。 */
export type CitationTag = KbCitationTag | WebCitationTag;

export type CitationSegment =
	| { readonly type: "text"; readonly text: string }
	| { readonly type: "tag"; readonly tag: CitationTag }
	/** 仅出现在序列末尾:流式截断的半截标签前缀(AC-7),展示侧一律剥除、不当正文渲染。 */
	| { readonly type: "incomplete"; readonly raw: string };

function unescapeAttrValue(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	return value.replace(ESCAPED_ENTITY_RE, (entity) => ENTITY_BY_NAME[entity.slice(1, -1)] ?? entity);
}

function parseTag(raw: string): CitationTag {
	const attrs = new Map<string, string>();
	for (const match of raw.matchAll(ATTRIBUTE_RE)) attrs.set(match[1], match[2]);
	if (!raw.startsWith("<kb")) {
		return {
			kind: "web",
			url: unescapeAttrValue(attrs.get("url")),
			title: unescapeAttrValue(attrs.get("title")),
		};
	}
	return {
		kind: "kb",
		doc: unescapeAttrValue(attrs.get("doc")),
		chunkId: unescapeAttrValue(attrs.get("chunk_id")),
		kbId: unescapeAttrValue(attrs.get("kb_id")),
	};
}

/**
 * 尾部残缺判定:只看最后一个 "<" 之后的尾巴——已含 ">" 说明是完整结构;否则仅当尾巴是
 * <kb/<web 的前缀(含孤悬 "<")才算残缺。正文中间的 "<k"、"x < 5" 这类字面量因此不会被
 * 误伤(fail-open:解析不了的当普通文本)。
 */
function incompleteCitationPrefixStart(text: string): number {
	const start = text.lastIndexOf("<");
	if (start < 0) return -1;
	const tail = text.slice(start);
	if (tail.includes(">")) return -1;
	const isCitationPrefix = tail === "<" || INCOMPLETE_KB_PREFIX_RE.test(tail) || INCOMPLETE_WEB_PREFIX_RE.test(tail);
	return isCitationPrefix ? start : -1;
}

/** 段 + 它在原文中的区间(半开区间 [start, end))。 */
export interface CitationSpan {
	readonly start: number;
	readonly end: number;
	readonly segment: CitationSegment;
}

/**
 * 带原文区间的切段实现(T03 渲染管道的地基):段的先后顺序与 {@link parseCitationTags}
 * 完全一致,另给出每段的原文下标——渲染层需要按原文回放某一段(如 kb 标签维持现状文本)
 * 时,直接 `text.slice(span.start, span.end)` 即可,不必从解析后的属性反序列化。
 */
export function parseCitationSpans(text: string): readonly CitationSpan[] {
	if (text === "") return [];
	const incompleteStart = incompleteCitationPrefixStart(text);
	const body = incompleteStart < 0 ? text : text.slice(0, incompleteStart);
	const spans: CitationSpan[] = [];
	let cursor = 0;
	for (const match of body.matchAll(KB_WEB_TAG_RE)) {
		// matchAll 的类型标注把 index 标成可选;按规范每次迭代必带,兜底 0 不改变行为。
		const start = match.index ?? 0;
		if (start > cursor) {
			spans.push({ start: cursor, end: start, segment: { type: "text", text: body.slice(cursor, start) } });
		}
		const end = start + match[0].length;
		spans.push({ start, end, segment: { type: "tag", tag: parseTag(match[0]) } });
		cursor = end;
	}
	if (cursor < body.length) {
		spans.push({ start: cursor, end: body.length, segment: { type: "text", text: body.slice(cursor) } });
	}
	if (incompleteStart >= 0) {
		spans.push({
			start: incompleteStart,
			end: text.length,
			segment: { type: "incomplete", raw: text.slice(incompleteStart) },
		});
	}
	return spans;
}

/**
 * 把文本切成 text/tag/incomplete 段序列。完整标签(含缺属性的)都是 tag 段,由 UI 决定
 * 降级形态;解析永不抛错、永不丢正文。
 */
export function parseCitationTags(text: string): readonly CitationSegment[] {
	return parseCitationSpans(text).map((span) => span.segment);
}

/** 剥除全部标签段与尾部残缺段,只保留普通文本(思考区/流式期间共用,AC-5/AC-7)。 */
export function stripCitationTags(text: string): string {
	let stripped = "";
	for (const segment of parseCitationTags(text)) {
		if (segment.type === "text") stripped += segment.text;
	}
	return stripped;
}
