// Copyright The Open Forge contributors.

import { useShortcutScope } from "@shared/shortcuts";
import { Spin } from "@vetta-org/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getChunkById } from "../services/chunkClient";

/**
 * kb 引用原文弹层(T04;02-plan §2-5 模块 5,AC-14/AC-15)。
 *
 * 浮层范式照 `WeKnoraSessionContextMenu`:portal 到 body、按锚点矩形定位(贴边收敛、
 * 下方放不下翻到上方)、点外/Escape 关闭、Escape 走统一快捷键作用域栈(overlay 级,
 * 禁 ad-hoc keydown)。三态:加载(i18n)/成功(content 原文 + doc 名)/失败(i18n 降级
 * 文案,不透出 raw 错误,fail-open)。
 *
 * **只读(AC-15)**:弹层内没有任何编辑入口,也不放关闭按钮以外的任何控件——关闭即
 * Escape/点外。取数走 `chunkClient`(T02 缓存,同 chunk 二次打开不重复请求)。
 */

/** 弹层与视口边缘的最小留白(照 WeKnoraSessionContextMenu 的浮层口径)。 */
const VIEWPORT_MARGIN = 8;
/** 弹层与锚点角标的间距。 */
const ANCHOR_GAP = 6;

type ChunkLoadState =
	| { readonly phase: "loading" }
	| { readonly phase: "loaded"; readonly content: string }
	| { readonly phase: "failed" };

export interface CitationPopoverProps {
	/** 角标按钮(定位锚点;在锚点上的按下不算「点外」,开关由角标自己的点击逻辑接管)。 */
	readonly anchor: HTMLElement;
	/** chunk id;空串表示退化标签(无 chunk_id),无处可取,直接进失败态且不发 IPC。 */
	readonly chunkId: string;
	/** 文档名(成功态与标题一起展示)。 */
	readonly doc: string;
	readonly onClose: () => void;
}

export function CitationPopover({ anchor, chunkId, doc, onClose }: CitationPopoverProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const popoverRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<ChunkLoadState>({ phase: "loading" });
	// 先按锚点矩形落位,量到实际尺寸后再做视口收敛(jsdom 量到 0,等价于不收敛)。
	const [position, setPosition] = useState(() => {
		const rect = anchor.getBoundingClientRect();
		return { left: rect.left, top: rect.bottom + ANCHOR_GAP };
	});

	useLayoutEffect(() => {
		const element = popoverRef.current;
		if (!element) return;
		const rect = anchor.getBoundingClientRect();
		const maxX = window.innerWidth - element.offsetWidth - VIEWPORT_MARGIN;
		const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxX));
		const belowTop = rect.bottom + ANCHOR_GAP;
		const maxY = window.innerHeight - element.offsetHeight - VIEWPORT_MARGIN;
		// 下方放不下翻到锚点上方;上方也放不下时贴顶(内容区自身可滚动)。
		const top =
			belowTop > maxY
				? Math.max(VIEWPORT_MARGIN, rect.top - element.offsetHeight - ANCHOR_GAP)
				: Math.max(VIEWPORT_MARGIN, belowTop);
		setPosition({ left, top });
	}, [anchor]);

	useEffect(() => {
		if (chunkId.length === 0) {
			setState({ phase: "failed" });
			return;
		}
		let cancelled = false;
		getChunkById(chunkId).then(
			(chunk) => {
				if (cancelled) return;
				// 归一化层只拦「content 缺失」;空串放行到此处,弹层判空:空原文对用户
				// 等于没取到,按失败态降级(T02 遗留裁量在此落地)。
				setState(chunk.content.length > 0 ? { phase: "loaded", content: chunk.content } : { phase: "failed" });
			},
			() => {
				// 失败降级文案,不透出 raw 错误(AC-14/D5/D7;含 403/404/网络错误)。
				if (!cancelled) setState({ phase: "failed" });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [chunkId]);

	useShortcutScope({
		id: "overlay:weknora-citation-popover",
		kind: "overlay",
		bindings: [{ key: "escape", run: onClose }],
	});

	useEffect(() => {
		const handleMouseDown = (event: MouseEvent): void => {
			const target = event.target instanceof Node ? event.target : null;
			if (!target) return;
			// 弹层内与锚点角标上的按下都不算「点外」:锚点的开/关由角标点击逻辑接管,
			// 否则「点外先关、随后 click 又开」会让点击已开角标表现为关不掉。
			if (popoverRef.current?.contains(target) || anchor.contains(target)) return;
			onClose();
		};
		const timer = setTimeout(() => document.addEventListener("mousedown", handleMouseDown), 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [anchor, onClose]);

	// 打开即聚焦弹层卡体:键盘用户立刻处于 Escape 作用域,屏幕阅读器先读弹层标题。
	useEffect(() => {
		popoverRef.current?.focus();
	}, []);

	return createPortal(
		// 视觉词汇照仓库浮层配方(DESIGN.md「Select / DropdownMenu / Popover」):浮层才有
		// shadow-md;rounded-xl + 1px border + bg-popover;`no-drag` 防落在窗口拖拽区。
		<div
			ref={popoverRef}
			role="dialog"
			aria-label={t("citation.popoverTitle")}
			tabIndex={-1}
			className="no-drag fixed z-50 box-border w-80 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md focus:outline-none"
			style={{ left: position.left, top: position.top }}
		>
			<p className="text-[11px] text-muted-foreground">{t("citation.popoverTitle")}</p>
			<p className="mt-0.5 truncate text-[13px] font-medium text-foreground" title={doc}>
				{doc}
			</p>
			<div className="mt-2 border-t border-border/60 pt-2">
				{state.phase === "loading" ? (
					<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
						{/* Spin 无 label 自身 aria-hidden(DESIGN.md):旁边已有同义加载文案。 */}
						<Spin className="shrink-0 text-primary" size="sm" />
						<span>{t("citation.loading")}</span>
					</div>
				) : state.phase === "failed" ? (
					<p className="text-[13px] text-foreground">{t("citation.loadFailed")}</p>
				) : (
					<p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
						{state.content}
					</p>
				)}
			</div>
		</div>,
		document.body,
	);
}
