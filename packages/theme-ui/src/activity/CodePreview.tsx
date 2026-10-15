import { useEffect, useState, type JSX } from "react";
import { codeToHtml } from "shiki";
import { getTextEditorLanguageId } from "../file-preview/text-editor-language";
import { latchLargeObjectDegradation, type LargeObjectKind } from "../shared/large-object-limits";

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
			latchLargeObjectDegradation({ kind: degradationKind, bytes: content.length, lines: countLines(content) })
				.current().degraded,
	);

	useEffect(() => {
		if (degraded) return;
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
	}, [content, degraded, extension, theme]);

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
