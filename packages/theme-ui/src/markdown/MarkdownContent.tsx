// Modified by The Open Forge contributors.
import { MarkdownHostProvider } from "./host";
import type { MarkdownHost } from "./host";
import { MarkdownImage } from "./MarkdownImage";
import { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import ReactMarkdown from "react-markdown";
import type { Components, Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BuiltinCodeBlock, Formula } from "./builtin-renderers";
import { richRemarkPlugins } from "./rich-syntax";
import { SvgPreview } from "./SvgPreview";
import { defaultRichContentLabels } from "./rich-labels";
import type { MarkdownLabels } from "./rich-labels";
export type { MarkdownLabels } from "./rich-labels";
import {
	MarkdownTable,
	MarkdownTableBody,
	MarkdownTableCell,
	MarkdownTableHead,
	MarkdownTableHeaderCell,
	MarkdownTableRow,
} from "../shared/MarkdownTable";
import { SkillTypeIcon } from "../skills/skill-icon";
import { InlineTokenChip } from "./InlineTokenChip";
import { WebsiteIcon } from "./WebsiteIcon";
import { useRenderSnapshot } from "./use-render-snapshot";
import { chatUrlTransform, classifyMarkdownLink, normalizeLocalFileLinksInMarkdown } from "./markdown-link";
import { useStreamingDisplayText, rehypeStreamingChunks } from "./streaming";
import {
	INLINE_TOKEN_TAG,
	rehypeInlineTokens,
	remarkInlineTokenAnnotations,
	projectAnnotationsToNormalizedMarkdown,
} from "./inline-tokens";
import type { InlineTokenSupport } from "./inline-tokens";
import type { HastElement } from "./nodes";
import { useMarkdownDefinition } from "./definition";
import type { MarkdownDefinition } from "./definition";
import { splitStableMarkdownBlocks } from "./stable-blocks";

/** 文件 / 链接 badge 的公共样式：半透明主题色底 + 主题色描边与文字。 */
const LINK_BADGE_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[13px] font-medium text-primary no-underline transition-colors hover:bg-primary/20";

const remarkPlugins = [remarkGfm, ...richRemarkPlugins];

const MarkdownCodeLiveContext = createContext(false);

function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}

export interface MarkdownContentProps {
	host?: MarkdownHost;
	definition?: MarkdownDefinition;
	text: string;
	isStreamingTail?: boolean;
	className?: string;
	theme: "light" | "dark";
	labels: MarkdownLabels;
	getFileIconClass: (fileName: string) => string;
	onOpenFile: (path: string) => void;
	onOpenUrl: (url: string) => void;
	/** 传入即启用行内 token 渲染；仅用户消息需要，助手 markdown 不受影响。 */
	inlineTokens?: InlineTokenSupport;
}

/** 绝对路径形式的链接文字（POSIX、Windows 盘符、UNC、~/）。相对路径保留原样，用于同名文件的区分。 */
const ABSOLUTE_PATH_LABEL = /^(?:\/|[A-Za-z]:[\\/]|\\\\|~\/)/;

/** 尾块快照的自适应节奏：一次解析的成本按占空比折算目标间隔（解析耗时 × 10，
 * 即解析开销不超过快照节奏的 ~10%），高于基础节奏时立即放慢，变便宜后逐步恢复。
 * 只作用于仍在增长的尾块，小尾块维持原有节奏。 */
const TAIL_PARSE_DUTY_DIVISOR = 10;
const TAIL_MAX_INTERVAL_MS = 800;

export function nextTailInterval(baseInterval: number, previousInterval: number, parseDurationMs: number): number {
	if (baseInterval <= 0) return 0;
	const target = Math.min(
		TAIL_MAX_INTERVAL_MS,
		Math.max(baseInterval, Math.round(parseDurationMs * TAIL_PARSE_DUTY_DIVISOR)),
	);
	if (target > previousInterval) return target;
	// 解析目标间隔不到当前一半时逐步恢复，避免抖动。
	if (parseDurationMs * TAIL_PARSE_DUTY_DIVISOR * 2 <= previousInterval) {
		return Math.max(target, Math.round(previousInterval / 2));
	}
	return previousInterval;
}

function basename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, "");
	const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
	return idx === -1 ? normalized : normalized.slice(idx + 1);
}

interface MarkdownDocumentProps {
	animateChunks: boolean;
	components: Components;
	definition: MarkdownDefinition;
	inlineTokens?: InlineTokenSupport;
	live: boolean;
	onRenderDuration?: (durationMs: number) => void;
	text: string;
}

/**
 * 一块已经冻结或仍在增长的 markdown。独立 memo：流式时只有 tail 的 `text` 变，
 * 已提交块不会跟着整篇重跑 remark；流式结束后分块结构保持不变，已提交块不会重挂。
 */
const MarkdownDocument = memo(function MarkdownDocument({
	animateChunks,
	components,
	definition,
	inlineTokens,
	live,
	onRenderDuration,
	text,
}: MarkdownDocumentProps): JSX.Element {
	const hasStructuredAnnotations = inlineTokens?.annotations !== undefined;
	const rehypePlugins = useMemo(() => {
		const plugins: NonNullable<Options["rehypePlugins"]> = [...(definition.rehypePlugins ?? [])];
		if (animateChunks) plugins.push(rehypeStreamingChunks);
		if (inlineTokens && !hasStructuredAnnotations) plugins.push(() => rehypeInlineTokens(inlineTokens.parse));
		return plugins.length > 0 ? plugins : undefined;
	}, [animateChunks, hasStructuredAnnotations, inlineTokens, definition]);
	const markdownSource = useMemo(() => normalizeLocalFileLinksInMarkdown(text), [text]);
	const normalizedAnnotations = useMemo(
		() =>
			inlineTokens?.annotations
				? projectAnnotationsToNormalizedMarkdown(text, markdownSource, inlineTokens.annotations)
				: undefined,
		[text, inlineTokens?.annotations, markdownSource],
	);
	const activeRemarkPlugins = useMemo(
		() =>
			normalizedAnnotations?.length
				? [
						...remarkPlugins,
						...(definition.remarkPlugins ?? []),
						() => remarkInlineTokenAnnotations(normalizedAnnotations),
					]
				: [...remarkPlugins, ...(definition.remarkPlugins ?? [])],
		[normalizedAnnotations, definition],
	);
	const resolvedComponents = useMemo(
		() => ({ ...components, ...definition.components, ...definition.elements }),
		[components, definition],
	);
	// 成本只在正文变化的那次渲染里测量（memo 拦下未变化的重渲染）。真正的解析发生在
	// React 渲染 Markdown 子树期间（创建 element 只是把组件函数排队），因此以组件函数
	// 开始到布局效果的时间差为准：包含 processor 构建、解析、hast→元素转换与该子树的
	// 协调；布局效果在整棵树渲染完成后同步触发，提交后上报避免渲染阶段副作用。
	const renderPassStartRef = useRef(0);
	renderPassStartRef.current = performance.now();
	useLayoutEffect(() => {
		onRenderDuration?.(performance.now() - renderPassStartRef.current);
	}, [onRenderDuration, markdownSource]);
	return (
		<MarkdownCodeLiveContext.Provider value={live}>
			<ReactMarkdown
				remarkPlugins={activeRemarkPlugins}
				rehypePlugins={rehypePlugins}
				components={resolvedComponents}
				urlTransform={chatUrlTransform}
			>
				{markdownSource}
			</ReactMarkdown>
		</MarkdownCodeLiveContext.Provider>
	);
});

/** 已冻结块的整体再包一层 memo：reveal tick 触发的重渲染里，只要块数组引用不变
 * （见下方 append-only 复用），整棵已提交子树直接 bail，不重建 memo 子元素。 */
const CommittedDocuments = memo(function CommittedDocuments({
	blocks,
	components,
	definition,
}: {
	blocks: readonly string[];
	components: Components;
	definition: MarkdownDefinition;
}): JSX.Element {
	return (
		<>
			{blocks.map((block, index) => (
				<MarkdownDocument
					key={`committed-${index}`}
					animateChunks={false}
					components={components}
					definition={definition}
					live={false}
					text={block}
				/>
			))}
		</>
	);
});

/**
 * Memo'd markdown renderer for chat text blocks. Host injects file/url handlers and theme.
 *
 * `components` 映射的函数引用必须在 streaming 期间保持稳定：React 把 components.p 等
 * 当成元素类型；引用一变就会整树 remount，`.streaming-chunk` 的 CSS 入场动画对已有
 * 文本整段重播，表现为 text block 高频闪烁。labels / 回调通过 ref 读取，不进 deps。
 */
export const MarkdownContent = memo(function MarkdownContent({
	text,
	isStreamingTail = false,
	className,
	theme,
	labels,
	getFileIconClass,
	onOpenFile,
	onOpenUrl,
	inlineTokens,
	definition: definitionOverride,
	host,
}: MarkdownContentProps): JSX.Element {
	const inheritedDefinition = useMarkdownDefinition();
	const definition = definitionOverride ?? inheritedDefinition;
	const definitionRef = useRef(definition);
	definitionRef.current = definition;
	const { displayText, animateChunks } = useStreamingDisplayText(text, isStreamingTail);
	const chunkedRef = useRef(false);
	if (animateChunks) chunkedRef.current = true;
	const frozenBlocksRef = useRef(false);
	if (isStreamingTail && !inlineTokens) frozenBlocksRef.current = true;
	const splitDocuments = frozenBlocksRef.current && !inlineTokens;
	const candidateSplit = useMemo(
		() => splitDocuments ? splitStableMarkdownBlocks(displayText) : null,
		[displayText, splitDocuments],
	);
	// Keep small replies responsive; bound full parsing of long tails without splitting
	// paragraphs/lists/reference definitions into semantically different documents.
	const tailLength = (candidateSplit?.tail ?? displayText).length;
	const baseRenderInterval = tailLength >= 50000 ? 400 : tailLength >= 12000 ? 200 : 0;
	const [tailInterval, setTailInterval] = useState(baseRenderInterval);
	const reportTailParseDuration = useCallback(
		(parseDurationMs: number) => {
			setTailInterval((current) =>
				nextTailInterval(baseRenderInterval, Math.max(current, baseRenderInterval), parseDurationMs),
			);
		},
		[baseRenderInterval],
	);
	const renderInterval = Math.min(TAIL_MAX_INTERVAL_MS, Math.max(baseRenderInterval, tailInterval));
	const previousText = useRef(displayText);
	const replaced = !displayText.startsWith(previousText.current);
	previousText.current = displayText;
	const renderText = useRenderSnapshot(displayText, true, isStreamingTail && renderInterval > 0 && !replaced, renderInterval);

	const labelsRef = useRef(labels);
	const getFileIconClassRef = useRef(getFileIconClass);
	const onOpenFileRef = useRef(onOpenFile);
	const onOpenUrlRef = useRef(onOpenUrl);
	const inlineTokensRef = useRef(inlineTokens);
	labelsRef.current = labels;
	getFileIconClassRef.current = getFileIconClass;
	onOpenFileRef.current = onOpenFile;
	onOpenUrlRef.current = onOpenUrl;
	inlineTokensRef.current = inlineTokens;

	const components = useMemo<Components>(
		() => ({
			h1: ({ children }) => (
				<h1 className="mb-3 mt-4 text-[20px] font-bold leading-tight text-foreground">{children}</h1>
			),
			h2: ({ children }) => (
				<h2 className="mb-2 mt-3.5 text-[17px] font-bold leading-tight text-foreground">{children}</h2>
			),
			h3: ({ children }) => (
				<h3 className="mb-2 mt-3 text-[15px] font-semibold leading-tight text-foreground">{children}</h3>
			),
			h4: ({ children }) => <h4 className="mb-1.5 mt-2.5 text-[14px] font-semibold text-foreground">{children}</h4>,
			p: ({ children }) => <p className="my-1.5 text-[14px] leading-[1.6] text-foreground">{children}</p>,
			ul: ({ children }) => (
				<ul className="md-bullet-list my-1.5 text-[14px] leading-[1.6] text-foreground">{children}</ul>
			),
			ol: ({ children }) => (
				<ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[14px] leading-[1.6] text-foreground marker:text-primary">
					{children}
				</ol>
			),
			li: ({ children }) => <li>{children}</li>,
			img: ({ src, alt, title }) => <MarkdownImage src={src} alt={alt} title={title} labels={labelsRef.current} />,
			code: function MarkdownCode({ className: codeClassName, children }) {
				const live = useContext(MarkdownCodeLiveContext);
				const raw = String(children);
				if (codeClassName?.includes("math-inline") || codeClassName?.includes("math-display")) {
					return <Formula source={raw.replace(/\n$/, "")} display={codeClassName.includes("math-display")} live={live} labels={labelsRef.current} />;
				}
				const isBlock = (codeClassName?.startsWith("language-") ?? false) || raw.includes("\n");
				if (isBlock) {
					const lang = codeClassName?.replace("language-", "") ?? "";
					const code = raw.replace(/\n$/, "");
					const CodeBlock = definitionRef.current.codeBlock ?? BuiltinCodeBlock;
					return <CodeBlock lang={lang} code={code} theme={theme} labels={labelsRef.current} live={live} />;
				}
				return <code className="rounded bg-muted px-1 py-0.5 text-[13px] text-foreground">{children}</code>;
			},
			pre: ({ children }) => <>{children}</>,
			blockquote: ({ children }) => (
				<blockquote className="my-2 border-l-2 border-primary/10 pl-3 text-[14px] italic text-muted-foreground">
					{children}
				</blockquote>
			),
			table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
			thead: ({ children }) => <MarkdownTableHead>{children}</MarkdownTableHead>,
			tbody: ({ children }) => <MarkdownTableBody>{children}</MarkdownTableBody>,
			tr: ({ children }) => <MarkdownTableRow>{children}</MarkdownTableRow>,
			// style 透传：remark-gfm 把 GFM 的列对齐（`|---:|`）写在这里。
			th: ({ children, style }) => <MarkdownTableHeaderCell style={style}>{children}</MarkdownTableHeaderCell>,
			td: ({ children, style }) => <MarkdownTableCell style={style}>{children}</MarkdownTableCell>,
			hr: () => <hr className="my-3 border-border" />,
			a: ({ href, children }) => {
				const kind = classifyMarkdownLink(href);
				if (kind.type === "file") {
					const fileName = basename(kind.path);
					// 模型偶尔把整条绝对路径写成 label，徽标里只留文件名，完整路径仍在 title 里。
					const label =
						typeof children === "string" && ABSOLUTE_PATH_LABEL.test(children.trim()) ? basename(children.trim()) : children;
					return (
						<button
							type="button"
							title={kind.path}
							className={cn(LINK_BADGE_CLASS, "cursor-pointer")}
							onClick={() => onOpenFileRef.current(kind.path)}
						>
							<span className={cn(getFileIconClassRef.current(fileName), "h-3.5 w-3.5 shrink-0")} />
							<span className="truncate">{label}</span>
						</button>
					);
				}
				if (kind.type === "url") {
					return (
						<a
							href={kind.url}
							title={kind.url}
							className={LINK_BADGE_CLASS}
							onClick={(e) => {
								e.preventDefault();
								onOpenUrlRef.current(kind.url);
							}}
						>
							<WebsiteIcon href={kind.url} />
							<span className="truncate">{children}</span>
						</a>
					);
				}
				// mailto / fragment / unknown: never target=_blank — that opens the OS browser
				// for misclassified local paths. Keep visible but non-navigating.
				return (
					<span className="text-chart-2 underline decoration-chart-2/30" title={kind.href || undefined}>
						{children}
					</span>
				);
			},
			strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
			"vetta-svg": ({ node }: { node?: HastElement }) => {
				const source = node?.properties?.source;
				const rich = labelsRef.current.rich ?? defaultRichContentLabels;
				return typeof source === "string" ? <SvgPreview source={source} label={rich.svg} failed={rich.failed} live /> : null;
			},
			em: ({ children }) => <em className="italic">{children}</em>,
			// 行内 token：与输入框里的胶囊同款（半透明主题色底 + 描边，align-middle 对齐正文）。
			[INLINE_TOKEN_TAG]: ({ node }: { node?: HastElement }) => {
				const properties = node?.properties ?? {};
				const kind = String(properties["data-token-kind"] ?? "");
				const value = String(properties["data-token-value"] ?? "");
				if (!kind || !value) return null;
				if (kind === "image") {
					return (
						<InlineTokenChip
							icon="icon-[solar--gallery-linear]"
							label={inlineTokensRef.current?.getImageLabel(value) ?? basename(value)}
							title={basename(value)}
						/>
					);
				}
				if (kind === "skill" || kind === "scene") {
					const ability =
						kind === "scene"
							? inlineTokensRef.current?.getScene?.(value)
							: inlineTokensRef.current?.getSkill?.(value);
					return (
						<InlineTokenChip
							iconNode={<SkillTypeIcon type={kind} icon={ability?.icon} className="h-3 w-3" />}
							label={ability?.label ?? value}
							title={value}
						/>
					);
				}
				if (kind === "connector") {
					const connector = inlineTokensRef.current?.getConnector?.(value);
					return (
						<InlineTokenChip
							icon="icon-[solar--plug-circle-linear]"
							iconUrl={connector?.iconUrl}
							label={connector?.label ?? value}
							title={value}
						/>
					);
				}
				if (kind === "member") {
					const member = inlineTokensRef.current?.getMember?.(value);
					const handle = String(properties["data-token-handle"] ?? value);
					if (!member) return <>{`@${handle}`}</>;
					return (
						<InlineTokenChip
							iconNode={
								member.avatar ? (
									<img
										src={member.avatar}
										alt=""
										draggable={false}
										className="h-3 w-3 rounded-full object-cover"
									/>
								) : undefined
							}
							label={`@${member.label || handle}`}
							title={member.meta ? `${member.label || handle} · ${member.meta}` : handle}
							tone="member"
						/>
					);
				}
				const isDirectory = properties["data-token-directory"] === "true";
				const fileName = basename(value);
				return (
					<InlineTokenChip
						asButton
						icon={isDirectory ? "icon-[solar--folder-linear]" : getFileIconClassRef.current(fileName)}
						label={fileName}
						title={value}
						onClick={() => onOpenFileRef.current(value)}
					/>
				);
			},
		}),
		// theme 进 deps：代码块高亮主题变化时需要换组件树。其余 host 注入值走 ref。
		[theme],
	);

	// 分段 span 一旦挂上就保留到实例卸载：结束时若把 rehype 插件撤掉，整个尾块会重建 DOM，
	// 表现为回复结尾「卡一下」。「最新短语略暗」只挂在包裹类上，撤掉包裹类就恢复全亮，DOM 不动。
	// 切块一旦启用就保持到实例卸载：流式结束时 `animateChunks` 要等 settle 才关，若此刻把
	// 已冻结块并回单一文档，已上屏的节点会整段重挂并再包成 `.streaming-chunk` 重放淡入。
	// 稳定块只按已闭合的顶层围栏切分，分块与整篇渲染结果一致，因此结束后不需要再合并。
	const split = useMemo(
		() => renderText === displayText ? candidateSplit : splitDocuments ? splitStableMarkdownBlocks(renderText) : null,
		[renderText, displayText, candidateSplit, splitDocuments],
	);
	// append-only 流式期间，已提交块只可能追加（单调前缀性）：块数未变即内容未变，
	// 复用上一次的数组引用，让 CommittedDocuments 的 memo 生效；内容被改写（replaced）
	// 或块数变化时换新引用。
	const committedBlocks = split?.committed ?? [];
	const committedRef = useRef<readonly string[]>([]);
	const committed = replaced || committedRef.current.length !== committedBlocks.length ? committedBlocks : committedRef.current;
	committedRef.current = committed;
	const tail = split ? split.tail : renderText;
	const showTail = !split || tail.length > 0 || committed.length === 0;

	return (
		<MarkdownHostProvider host={host}><div className={cn("markdown-body break-words", animateChunks && "markdown-streaming-tail", className)}>
			<CommittedDocuments blocks={committed} components={components} definition={definition} />
			{showTail ? (
				<MarkdownDocument
					key="tail"
					animateChunks={chunkedRef.current}
					components={components}
					definition={definition}
					inlineTokens={inlineTokens}
					live={isStreamingTail}
					onRenderDuration={isStreamingTail ? reportTailParseDuration : undefined}
					text={tail}
				/>
			) : null}
		</div></MarkdownHostProvider>
	);
});
