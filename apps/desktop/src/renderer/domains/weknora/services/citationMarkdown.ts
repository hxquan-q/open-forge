// Copyright The Open Forge contributors.

/**
 * WeKnora 引用标签的 Markdown 渲染插件(T03;02-plan §2-2 模块 2,决策 D3/D5)。
 *
 * 节点形态(实测 react-markdown 10 源码 + research/client-answer-pipeline.md):
 * 管线未启用 rehype-raw,CommonMark 把 `<kb …/>`/`<web …/>` 识别为原始 HTML,经
 * remark-rehype(`allowDangerousHtml: true`)进入 hast 后是 **raw 节点**;react-markdown
 * 要等 rehype 插件全部跑完,才在收尾阶段把残余 raw 节点逐个转成文本节点(转义明文,
 * 即现状"乱码"的来源)。因此本插件处理两类宿主:
 * - **raw 节点**:完整标签的主要宿主。CommonMark 的 HTML 块会把后续行吞进同一个
 *   raw 节点,所以按段序列展开,而不是对整节点做一次整串判定;
 * - **text 节点**:流式中断留下的尾部残缺标签(`<kb doc="x` 不构成合法 HTML,只会
 *   留在文本节点)以及个别能被官方正则命中、却不合法的写法(如未加引号的属性)。
 *
 * 变换规则:
 * - web 标签 → **标准 `<a>` link 节点**(children = 域名文本)。后续渲染、URL 打开
 *   通道与安全策略全部复用 theme-ui 既有 `a` 组件与 urlTransform,不自制外链组件;
 * - kb 标签 → 本票维持现状:按原文区间回放为文本,逐字符与现状一致(角标化在 T04,
 *   与本插件共用同一套段序列地基);
 * - 尾部残缺段与无 url 的 web 标签 → 剥除(fail-open,永不显示 raw,AC-7);
 * - code/pre/a 内文本不处理(与 rehypeInlineTokens 同仓先例同一口径)。
 */

import type { CitationSpan } from "./citationTag";
import { parseCitationSpans } from "./citationTag";

/**
 * 插件所需的最小 hast 结构面(theme-ui markdown/nodes.ts 同款自持口径;不跨包深链
 * 其内部模块,红线 C3)。raw 是 react-markdown 管线对原始 HTML 的中间表示,见文件头。
 */
interface CitationHastText {
	type: "text";
	value: string;
}
interface CitationHastRaw {
	type: "raw";
	value: string;
}
interface CitationHastElement {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children: CitationHastChild[];
}
type CitationHastChild = CitationHastText | CitationHastRaw | CitationHastElement;
interface CitationHastRoot {
	type: "root";
	children: CitationHastChild[];
}
type CitationHastParent = CitationHastRoot | CitationHastElement;

/** web 外链的显示名:URL 的 host(去 userinfo 与端口);取不出 host 时回退整串。 */
function hostLabelOf(url: string): string {
	const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)?.[1] ?? /^\/\/([^/?#]+)/.exec(url)?.[1] ?? null;
	if (!authority) return url;
	return authority
		.replace(/^[^/@]+@/, "")
		.replace(/:\d+$/, "")
		.replace(/^\[(.+)\]$/, "$1");
}

/** web 标签 → 标准 link 节点:href/url 打开通道/安全策略交给既有 `a` 渲染(urlTransform 照跑)。 */
function webLinkNode(url: string, title: string | undefined): CitationHastElement {
	return {
		type: "element",
		tagName: "a",
		properties: { href: url, ...(title === undefined ? {} : { title }) },
		children: [{ type: "text", value: hostLabelOf(url) }],
	};
}

/** 把一个段投影为 hast 子节点;返回 null 表示该段不产生可见内容(残缺/造不出链接的 web)。 */
function citationSpanNode(source: string, span: CitationSpan): CitationHastChild | null {
	if (span.segment.type === "text") {
		return { type: "text", value: span.segment.text };
	}
	if (span.segment.type === "incomplete") {
		return null;
	}
	const tag = span.segment.tag;
	if (tag.kind === "kb") {
		// 本票维持现状:按原文区间回放(逐字符一致),不做任何加工;T04 在同一点换成角标。
		return { type: "text", value: source.slice(span.start, span.end) };
	}
	if (tag.url === undefined) {
		return null;
	}
	return webLinkNode(tag.url, tag.title);
}

/**
 * 段序列里全是普通文本时直接原样保留节点(连对象都不重建),保证无标签文本的渲染
 * 逐字符不变(AC-4),也让非引用类 raw 节点继续走 react-markdown 既有的 raw→文本收尾。
 */
function isPlainTextNode(spans: readonly CitationSpan[]): boolean {
	return spans.every((span) => span.segment.type === "text");
}

/** rehype 插件:web 标签转标准 link、kb 标签维持现状文本、残缺尾部剥除。 */
export function rehypeCitationTags() {
	return (tree: CitationHastRoot): void => {
		function visit(node: CitationHastParent, inLiteral: boolean): void {
			const newChildren: CitationHastChild[] = [];
			for (const child of node.children) {
				if (!inLiteral && (child.type === "text" || child.type === "raw")) {
					const spans = parseCitationSpans(child.value);
					if (isPlainTextNode(spans)) {
						newChildren.push(child);
						continue;
					}
					for (const span of spans) {
						const piece = citationSpanNode(child.value, span);
						if (piece !== null) newChildren.push(piece);
					}
					continue;
				}
				newChildren.push(child);
				if (child.type === "element") {
					visit(child, inLiteral || child.tagName === "code" || child.tagName === "pre" || child.tagName === "a");
				}
			}
			node.children = newChildren;
		}

		visit(tree, false);
	};
}
