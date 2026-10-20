// Copyright The Open Forge contributors.

import { extendMarkdown, MarkdownProvider, useMarkdownDefinition } from "@vetta-org/theme-ui/markdown";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { rehypeCitationTags } from "../services/citationMarkdown";

/**
 * 智能客服消息区的 Markdown 扩展注入点(T03;02-plan §2-3,决策 D2 **继承式**)。
 *
 * 用 `extendMarkdown(上游定义, 本域扩展)` 在父级定义之后追加插件,而不是给
 * `MarkdownProvider` 塞一份全新定义(那是**替换**语义,见 definition.tsx 的注释)——
 * 生产树此前没有 Provider 用点,这里按继承式写,未来上游若在更外层挂定义也不会被顶掉。
 *
 * 包在消息区外层一次即可(见 MessageList),消息内所有 MarkdownContent 自动生效;
 * 正文与历史回看共用同一条管道(AC-6)。
 */
export function WeKnoraMarkdownProvider({ children }: { readonly children: ReactNode }): JSX.Element {
	const inherited = useMarkdownDefinition();
	const definition = useMemo(
		() => extendMarkdown(inherited, { rehypePlugins: [rehypeCitationTags] }),
		[inherited],
	);
	return <MarkdownProvider definition={definition}>{children}</MarkdownProvider>;
}
