// Copyright The Open Forge contributors.

import type { MarkdownElementProps } from "@vetta-org/theme-ui/markdown";
import { Button } from "@vetta-org/ui";
import { useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { weKnoraCitationAnchorAtom } from "../atoms";
import { CitationPopover } from "./CitationPopover";

/**
 * kb 引用角标(T04;02-plan §2-4 模块 4,AC-1/AC-2/AC-9)。
 *
 * `citationMarkdown` 插件把 `<kb doc chunk_id kb_id/>` 产出的自定义元素
 * `weknora-citation` 经 Provider `elements` 注册到本组件;属性从 hast 节点读取
 * (`vetta-svg`/行内 token 同款口径,不跨包深链)。
 *
 * - 原生 `<button type="button">`:button 语义天然(AC-9),Enter/Space 原生触发,
 *   无需 `useShortcutScope`(快捷键在弹层,overlay 级);
 * - `aria-label` 走 i18n 并插值文档名;原生 `title` = 完整文档名(hover 全名,AC-2),
 *   显示文本截断到约 13 字符(AC-1);
 * - 点击开关弹层;互斥由 `weKnoraCitationAnchorAtom` 承担(D4):后开者覆写锚点,
 *   先开者的弹层随之卸载。
 */

/** 角标显示名的截断长度(01-spec §3「约 13 字符量级」;截断加省略号,全名走 title)。 */
const BADGE_MAX_CHARS = 13;

function truncateName(name: string): string {
	return name.length > BADGE_MAX_CHARS ? `${name.slice(0, BADGE_MAX_CHARS - 1)}…` : name;
}

/** hast properties 的窄化读取:非字符串(含缺失)一律回退空串,不抛错。 */
function stringProperty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function CitationBadge({ node }: MarkdownElementProps): JSX.Element | null {
	const { t } = useTranslation("weknora");
	const anchor = useAtomValue(weKnoraCitationAnchorAtom);
	const setAnchor = useSetAtom(weKnoraCitationAnchorAtom);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const properties = node?.properties ?? {};
	const doc = stringProperty(properties.doc);
	const chunkId = stringProperty(properties.chunkId);
	// 展示名:文档名优先;退化标签(缺 doc)用 chunkId 兜底,保证角标永远有可读内容。
	// doc 与 chunkId 全缺的空标签已在插件层剥除,此处兜底返回空(防御,不显示 raw)。
	const name = doc.length > 0 ? doc : chunkId;
	if (name.length === 0) return null;
	// `open` 为真时锚点必然已挂载(锚点就是本按钮),先收窄再传给弹层,tsc 才能证明非空。
	const button = buttonRef.current;
	const open = button !== null && anchor === button;

	return (
		<>
			{/*
			 * 视觉词汇沿用消息内徽标语言(theme-ui 文件/外链 badge 同款:半透明主题色底 +
			 * 描边、rounded-md、align-middle);按钮语义复用 ui Button(ghost/sm 后由 className
			 * 拉回行内尺寸与配色)。focus 只换边框颜色(DESIGN.md Components)。
			 */}
			<Button
				ref={buttonRef}
				type="button"
				variant="ghost"
				size="sm"
				aria-label={t("citation.badgeLabel", { doc: name })}
				title={name}
				className="mx-0.5 inline-flex h-auto max-w-full items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-px align-middle text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 hover:text-primary focus-visible:border-ring"
				onClick={() => {
					setAnchor(open ? null : buttonRef.current);
				}}
			>
				{truncateName(name)}
			</Button>
			{open && button !== null ? (
				<CitationPopover anchor={button} chunkId={chunkId} doc={name} onClose={() => setAnchor(null)} />
			) : null}
		</>
	);
}
