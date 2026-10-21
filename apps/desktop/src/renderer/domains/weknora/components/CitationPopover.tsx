// Copyright The Open Forge contributors.

import { Button } from "@shared/components/ui/button";
import { useShortcutScope } from "@shared/shortcuts";
import { Spin } from "@vetta-org/ui";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { parseChunkContent } from "../services/chunkContent";
import { getChunkById } from "../services/chunkClient";
import { getFileData } from "../services/fileClient";

/**
 * kb 引用原文弹层(T04 建立;F1/F2/F3 实机验收修复)。
 *
 * 浮层范式照 `WeKnoraSessionContextMenu`:portal 到 body、按锚点矩形定位(贴边收敛、
 * 下方放不下翻到上方)、点外/Escape 关闭、Escape 走统一快捷键作用域栈(overlay 级,
 * 禁 ad-hoc keydown)。三态:加载(i18n)/成功(content 原文 + doc 名)/失败(i18n 降级
 * 文案,不透出 raw 错误,fail-open)。
 *
 * 实机验收修复(07-acceptance-fixes.md):
 * - **F1 跟随滚动**:监听视口滚动/resize(passive、capture 覆盖内层滚动容器),
 *   锚点仍可见则实时重定位;锚点整体滚出视口则**自动关闭**(确定性,不留悬浮孤儿)。
 * - **F2 显式关闭按钮**:弹层内加图标关闭按钮(`Button` ghost + icon 档),主关闭路径;
 *   Esc 与点外关闭作为便捷路径**保留**。
 * - **F3 内容噪声治理 + 真图渲染**(v2):成功态正文经 `parseChunkContent` 切段——
 *   markdown 图片语法 `![alt](minio://…)` 经鉴权代理(`fileClient`)取回渲染为 `<img>`
 *   (同一 chunk 多图各自渲染);非 minio 图片语法与裸 `minio://…` 串降级 i18n 占位。
 *   **其余正文仍纯文本**(AC-15:不执行任意 HTML/markdown,图片是唯一提升为元素的语法)。
 *
 * **只读(AC-15)**:弹层内除关闭按钮外没有任何编辑入口与表单控件;取数走 `chunkClient`
 * (T02 缓存,同 chunk 二次打开不重复请求)。
 */

/** 弹层与视口边缘的最小留白(照 WeKnoraSessionContextMenu 的浮层口径)。 */
const VIEWPORT_MARGIN = 8;
/** 弹层与锚点角标的间距。 */
const ANCHOR_GAP = 6;

/** 定位只需要锚点矩形的这几个分量(DOMRect 结构兼容,便于纯函数单测)。 */
interface AnchorRect {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

/** 弹层实测尺寸(offsetWidth/offsetHeight;jsdom 量到 0,等价于不收敛)。 */
interface PopoverSize {
	readonly width: number;
	readonly height: number;
}

/**
 * 视口收敛定位(从 useLayoutEffect 里抽出,便于滚动时复用与单测):
 * 水平贴边收拢;锚点下方放不下翻到上方,上方也放不下时贴顶(内容区自身可滚动)。
 */
export function computePopoverPosition(rect: AnchorRect, size: PopoverSize): { readonly left: number; readonly top: number } {
	const maxX = window.innerWidth - size.width - VIEWPORT_MARGIN;
	const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxX));
	const belowTop = rect.bottom + ANCHOR_GAP;
	const maxY = window.innerHeight - size.height - VIEWPORT_MARGIN;
	const top =
		belowTop > maxY
			? Math.max(VIEWPORT_MARGIN, rect.top - size.height - ANCHOR_GAP)
			: Math.max(VIEWPORT_MARGIN, belowTop);
	return { left, top };
}

/** 锚点是否整体滚出视口(F1 自动关闭判据:四边都不与视口相交才算「滚出去」)。 */
export function isAnchorOutOfViewport(rect: AnchorRect): boolean {
	return rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
}

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

	/**
	 * 按当前锚点矩形重算落位并写回。
	 * @returns 锚点是否仍在视口内(供滚动监听判定是否自动关闭)。
	 */
	const applyPosition = useCallback((): boolean => {
		const element = popoverRef.current;
		if (!element) return true;
		const rect = anchor.getBoundingClientRect();
		if (isAnchorOutOfViewport(rect)) return false;
		const next = computePopoverPosition(rect, { width: element.offsetWidth, height: element.offsetHeight });
		// 位置没变就保留旧对象,避免滚动期间的无谓重渲染。
		setPosition((prev) => (prev.left === next.left && prev.top === next.top ? prev : next));
		return true;
	}, [anchor]);

	// 初次落位:锚点此刻必然可见(刚被点击),不做「滚出视口」判定(否则 jsdom 的零矩形会误关)。
	useLayoutEffect(() => {
		applyPosition();
	}, [applyPosition]);

	// F1:滚动/resize 时实时跟随;锚点整体滚出视口即自动关闭。passive 不阻塞滚动,
	// capture 让内层滚动容器(消息区)的 scroll 也能冒到 window 上的监听(其不冒泡)。
	useEffect(() => {
		const handleViewportChange = (): void => {
			if (!applyPosition()) onClose();
		};
		window.addEventListener("scroll", handleViewportChange, { passive: true, capture: true });
		window.addEventListener("resize", handleViewportChange, { passive: true });
		return () => {
			window.removeEventListener("scroll", handleViewportChange, { capture: true });
			window.removeEventListener("resize", handleViewportChange);
		};
	}, [applyPosition, onClose]);

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
			{/* F2:显式关闭按钮(DESIGN.md「允许使用原生 button 的场景」之外的操作按钮,走 Button
			    ghost + icon 档;尺寸对齐既有图标按钮档 icon-sm)。主关闭路径;Esc/点外为便捷路径。 */}
			<Button
				variant="ghost"
				size="icon-sm"
				className="absolute top-2 right-2"
				aria-label={t("citation.close")}
				title={t("citation.close")}
				onClick={onClose}
			>
				<span aria-hidden="true" className="icon-[solar--close-circle-linear] h-4 w-4" />
			</Button>
			<p className="pr-7 text-[11px] text-muted-foreground">{t("citation.popoverTitle")}</p>
			<p className="mt-0.5 truncate pr-7 text-[13px] font-medium text-foreground" title={doc}>
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
					// F3 v2:正文纯文本;仅 markdown 图片语法提升为 <img>(经鉴权代理取回),
					// 非 minio 图片语法与裸 minio 串降级为 i18n 占位(AC-15:不执行任意 HTML)。
					<p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
						{parseChunkContent(state.content).map((segment, index) => (
							<Fragment key={index}>
								{segment.type === "text" ? (
									segment.text
								) : segment.type === "image" ? (
									<ChunkImage imageRef={segment.ref} />
								) : (
									t("citation.imagePlaceholder")
								)}
							</Fragment>
						))}
					</p>
				)}
			</div>
		</div>,
		document.body,
	);
}

/**
 * chunk 原文里的一张内嵌图片(F3 v2):按 `minio://…` ref 经 `fileClient`(缓存)取回 data URL
 * 后渲染 `<img>`;取回失败/未完成一律回退 i18n 占位,绝不显示原始长串。alt 丢弃(07 取简),
 * 渲染期只读(无编辑入口,AC-15)。
 */
function ChunkImage({ imageRef }: { readonly imageRef: string }): JSX.Element {
	const { t } = useTranslation("weknora");
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		getFileData(imageRef).then(
			(file) => {
				if (!cancelled) setDataUrl(file.dataUrl);
			},
			() => {
				if (!cancelled) setFailed(true);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [imageRef]);

	if (dataUrl !== null) {
		return (
			<img
				src={dataUrl}
				alt={t("citation.imagePlaceholder")}
				className="my-1 max-h-64 max-w-full rounded-md border border-border/60"
			/>
		);
	}
	// 加载中与失败都先占位;失败加 title 提示(仍不显示原始长串)。
	return (
		<span
			className={failed ? "text-muted-foreground" : "text-muted-foreground/70"}
			title={failed ? t("citation.imageFailed") : undefined}
		>
			{t("citation.imagePlaceholder")}
		</span>
	);
}
