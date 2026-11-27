// Modified by The Open Forge contributors.
import { useEffect, useState, type JSX } from "react";
import { codeToHtml } from "shiki";
import type { ReadonlyCodeView } from "../file-preview/ReadonlyCodeView";
import { loadReadonlyCodeView } from "../file-preview/readonly-code-view-loader";
import { getTextEditorLanguageId } from "../file-preview/text-editor-language-id";
import { latchLargeObjectDegradation, type LargeObjectKind } from "../shared/large-object-limits";

/**
 * Shiki tokenizes the whole source on the renderer thread (about 1.4 ms per KB) and the
 * result is one unvirtualized DOM tree; past this size the preview switches to CodeMirror,
 * which lays out and highlights only the visible lines.
 */
export const CODE_PREVIEW_HIGHLIGHT_LIMIT = 100_000;

export interface CodePreviewProps {
	content: string;
	extension: string;
	theme: "light" | "dark";
	/** 降级按哪一类阈值判定：artifact 预览按字节，文件预览另有行数闸。 */
	degradationKind?: Extract<LargeObjectKind, "artifact" | "textFile">;
	/** 降级时的提示文案（宿主 i18n catalog 提供，组件不硬编码）。 */
	degradationNotice?: string;
}

function countLines(content: string): number {
	let lines = 1;
	for (let index = content.indexOf("\n"); index !== -1; index = content.indexOf("\n", index + 1)) lines += 1;
	return lines;
}

export function CodePreview({
	content,
	extension,
	theme,
	degradationKind = "artifact",
	degradationNotice,
}: CodePreviewProps): JSX.Element {
	const [html, setHtml] = useState<string | null>(null);
	// 打开预览时一次性判定：超阈值的大对象直接走纯文本，不再跑语法高亮/索引。
	const [degraded] = useState(
		() =>
			latchLargeObjectDegradation({
				kind: degradationKind,
				bytes: content.length,
				lines: countLines(content),
			}).current().degraded,
	);
	// 未命中硬闸但超过高亮阈值的内容改走只读 CodeMirror（虚拟化到可视行）。
	// 语法包不进主依赖图，懒加载失败时退回不高亮的纯文本。
	const virtualize = !degraded && content.length > CODE_PREVIEW_HIGHLIGHT_LIMIT;

	useEffect(() => {
		if (degraded || virtualize) return;
		let cancelled = false;
		const lang = getTextEditorLanguageId(extension);

		codeToHtml(content, {
			lang,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				if (!cancelled) setHtml("");
			});

		return () => {
			cancelled = true;
		};
	}, [content, degraded, virtualize, extension, theme]);

	if (degraded) {
		return (
			<div data-degraded="true">
				<pre className="text-preview-content whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[1.6] text-foreground">
					{content}
				</pre>
				{degradationNotice ? (
					<p className="px-4 pb-2 text-[11px] text-muted-foreground">{degradationNotice}</p>
				) : null}
			</div>
		);
	}

	if (virtualize) {
		return <LazyReadonlyCodeView content={content} extension={extension} />;
	}

	if (html === null) {
		return (
			<div className="flex items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
			</div>
		);
	}

	if (html === "") {
		return (
			<pre className="text-preview-content whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[1.6] text-foreground">
				{content}
			</pre>
		);
	}

	return (
		<div
			className="code-preview overflow-x-auto p-4 text-[12px] leading-[1.6] [&_pre]:!bg-transparent [&_code]:!bg-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function LazyReadonlyCodeView({ content, extension }: { content: string; extension: string }): JSX.Element {
	const [View, setView] = useState<typeof ReadonlyCodeView | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let active = true;
		loadReadonlyCodeView()
			.then((LoadedView) => {
				if (active) setView(() => LoadedView);
			})
			.catch(() => {
				if (active) setFailed(true);
			});
		return () => {
			active = false;
		};
	}, []);

	if (View) return <View content={content} extension={extension} />;
	if (failed) {
		// 懒加载失败不代表内容不可读；退回纯文本仍比空白可用。
		return (
			<pre className="text-preview-content whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[1.6] text-foreground">
				{content}
			</pre>
		);
	}
	return (
		<div className="flex items-center justify-center p-8">
			<span className="icon-[mdi--loading] animate-spin text-[24px] text-muted-foreground/50" />
		</div>
	);
}
