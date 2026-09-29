// Modified by The Open Forge contributors.
import {
	activityPanelResizingAtom,
	activityPanelTabDraggingAtom,
	browserUrlByWorkspaceAtom,
	getBrowserUrlForWorkspace,
	setBrowserUrlForWorkspaceAtom,
} from "@shared/store/atoms";
import { BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS } from "@vetta/coding-agent/function-extensions";
import type { BrowserLiveEditCardProps, BrowserPanelLabels } from "@vetta-org/theme-ui/activity";
import { OVERLAY_DRAG_EVENT } from "@vetta-org/theme-ui/layout";
import { useAtomValue, useSetAtom } from "jotai";
import { type FormEvent, type Ref, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopBrowserViewState } from "@/shared/browser-view-ipc";
import { useActivityTabActivation } from "../registry/activation-context";
import { useActivityWorkspace } from "../registry/context";
import { useBrowserElementPicker } from "./useBrowserElementPicker";
import { useBrowserLiveEdit } from "./useBrowserLiveEdit";

/** 把地址栏输入规整为可加载的 URL：已带协议直接用，否则补 https://，空则返回 null。 */
function normalizeUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function boundsOf(el: HTMLElement): { x: number; y: number; width: number; height: number } {
	const rect = el.getBoundingClientRect();
	return {
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		width: Math.round(rect.width),
		height: Math.round(rect.height),
	};
}

export interface BrowserPanelModel {
	workspaceId: string;
	labels: BrowserPanelLabels;
	address: string;
	canBack: boolean;
	canForward: boolean;
	loading: boolean;
	failed: boolean;
	hasPage: boolean;
	currentUrl: string;
	hostRef: Ref<HTMLDivElement>;
	onAddressChange: (value: string) => void;
	onAddressSubmit: (event: FormEvent) => void;
	onBack: () => void;
	onForward: () => void;
	onStop: () => void;
	onReload: () => void;
	onOpenExternal: () => void;
	onRetry: () => void;
	pickerEnabled: boolean;
	pickerDisabled: boolean;
	onTogglePicker: () => void;
	liveEdit?: BrowserLiveEditCardProps;
}

export function useBrowserPanelModel(): BrowserPanelModel {
	const { t } = useTranslation("chat");
	const workspace = useActivityWorkspace();
	const workspaceId = workspace.id;
	const urlMap = useAtomValue(browserUrlByWorkspaceAtom);
	const targetUrl = getBrowserUrlForWorkspace(urlMap, workspaceId);
	const setWorkspaceUrl = useSetAtom(setBrowserUrlForWorkspaceAtom);
	const tabActive = useActivityTabActivation();
	const panelResizing = useAtomValue(activityPanelResizingAtom);
	const tabDragging = useAtomValue(activityPanelTabDraggingAtom);

	const hostRef = useRef<HTMLDivElement | null>(null);
	const attachedRef = useRef(false);
	const viewUrlRef = useRef("");
	const targetUrlRef = useRef(targetUrl);
	targetUrlRef.current = targetUrl;
	const viewVisibleRef = useRef(false);
	const [overlayDragging, setOverlayDragging] = useState(false);
	const [address, setAddress] = useState(targetUrl ?? "");
	const [currentUrl, setCurrentUrl] = useState(targetUrl ?? "");
	const [canBack, setCanBack] = useState(false);
	const [canForward, setCanForward] = useState(false);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	// 主进程建 view 失败（拒绝或无 IPC 处理器）此前被静默吞掉，面板只剩空白；单独记账以便重试。
	const [attachFailed, setAttachFailed] = useState(false);
	const [attachAttempt, setAttachAttempt] = useState(0);

	const hasPage = currentUrl !== "" || targetUrl != null;
	// 原生 view 盖在 DOM 之上：空态/失败覆盖层要显示时必须同步隐去 view，tab 隐藏同理。
	const viewVisible = tabActive && hasPage && !failed;
	viewVisibleRef.current = viewVisible;

	const applyState = useCallback(
		(state: DesktopBrowserViewState) => {
			// about:blank 是占位初始页，不当作真实页面回写。
			const url = state.url === "about:blank" ? "" : state.url;
			viewUrlRef.current = url;
			setLoading(state.loading);
			setCanBack(state.canBack);
			setCanForward(state.canForward);
			setFailed(state.failed);
			if (url) {
				setCurrentUrl(url);
				setAddress(url);
				setWorkspaceUrl({ workspaceId, url });
			}
		},
		[workspaceId, setWorkspaceUrl],
	);

	// 挂载/换 workspace：建 view、挂窗、登记事件订阅；卸载时摘下（view 本体保活）。
	// targetUrl 变化由下方导航 effect 负责；attach 只取挂载时的快照。
	// biome-ignore lint/correctness/useExhaustiveDependencies: attach 仅需挂载时快照，targetUrl 导航由独立 effect 处理
	useEffect(() => {
		const el = hostRef.current;
		if (!el) return;
		let disposed = false;
		attachedRef.current = false;
		const api = window.vetta.browserView;
		const attachUrl = targetUrlRef.current;
		void api
			.attach({
				workspaceId,
				bounds: boundsOf(el),
				url: attachUrl ?? undefined,
				visible: viewVisibleRef.current,
			})
			.then((result) => {
				if (disposed) return;
				attachedRef.current = result.ok;
				setAttachFailed(!result.ok);
				if (!result.ok) {
					console.error("[browser-panel] attach rejected", { workspaceId, code: result.code });
					return;
				}
				applyState(result.state);
				// 只补 attach 往返期间新改的目标：attach 已加载同一地址时再发一次
				// 会中止首载（ERR_ABORTED）并让 view 短暂进入失败态。
				const latest = targetUrlRef.current;
				if (latest && latest !== attachUrl) void api.navigate({ workspaceId, url: latest });
			})
			.catch((error: unknown) => {
				if (disposed) return;
				attachedRef.current = false;
				setAttachFailed(true);
				console.error("[browser-panel] attach failed", { workspaceId, error });
			});
		const unsubscribe = api.onEvent((envelope) => {
			if (envelope.workspaceId === workspaceId) applyState(envelope.state);
		});
		return () => {
			disposed = true;
			attachedRef.current = false;
			unsubscribe();
			void api.detach({ workspaceId });
		};
	}, [workspaceId, applyState, attachAttempt]);

	// bounds 跟随：布局/窗口变化经 ResizeObserver 回报占位矩形。
	useEffect(() => {
		const el = hostRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const report = (): void => {
			void window.vetta.browserView.update({ workspaceId, bounds: boundsOf(el) });
		};
		const observer = new ResizeObserver(report);
		observer.observe(el);
		report();
		return () => observer.disconnect();
	}, [workspaceId]);

	// 可见性：tab 切换/空态/失败覆盖层切换时同步 view.setVisible。
	useEffect(() => {
		void window.vetta.browserView.update({ workspaceId, visible: viewVisible });
	}, [workspaceId, viewVisible]);

	// 外部 targetUrl 变化（点会话链接 / 地址栏导航）→ 与 view 当前页不同则导航。
	useEffect(() => {
		if (!targetUrl || !attachedRef.current) return;
		if (viewUrlRef.current !== targetUrl) {
			void window.vetta.browserView.navigate({ workspaceId, url: targetUrl });
		}
	}, [workspaceId, targetUrl]);

	// 拖拽期指针穿透：面板分栏/tab 拖拽/浮动缩放的 DOM 兜底 overlay 需要
	// 收到掠过 view 区域的指针事件。
	const passthrough = panelResizing || tabDragging || overlayDragging;
	useEffect(() => {
		if (!attachedRef.current) return;
		void window.vetta.browserView.setInputPassthrough({ workspaceId, passthrough });
	}, [workspaceId, passthrough]);

	useEffect(() => {
		const onDrag = (event: Event): void => {
			const detail = (event as CustomEvent<{ active?: boolean }>).detail;
			setOverlayDragging(detail?.active === true);
		};
		window.addEventListener(OVERLAY_DRAG_EVENT, onDrag);
		return () => window.removeEventListener(OVERLAY_DRAG_EVENT, onDrag);
	}, []);

	const navigate = useCallback(
		(raw: string) => {
			const url = normalizeUrl(raw);
			if (!url) return;
			setWorkspaceUrl({ workspaceId, url });
		},
		[workspaceId, setWorkspaceUrl],
	);

	const onAddressSubmit = useCallback(
		(event: FormEvent) => {
			event.preventDefault();
			navigate(address);
		},
		[address, navigate],
	);

	const retry = useCallback(() => {
		// view 没建起来时 reload 无从作用（control 会被主进程静默丢弃），重走 attach。
		if (!attachedRef.current) {
			setAttachFailed(false);
			setAttachAttempt((attempt) => attempt + 1);
			return;
		}
		setFailed(false);
		void window.vetta.browserView.control({ workspaceId, action: "reload" });
	}, [workspaceId]);

	const openExternal = useCallback(() => {
		if (currentUrl) void window.vetta.auth.openExternal(currentUrl);
	}, [currentUrl]);

	const picker = useBrowserElementPicker({ workspaceId, hasPage });
	const liveEdit = useBrowserLiveEdit({ workspaceId, elementRef: picker.selectionRef });

	const liveEditView = useMemo((): BrowserLiveEditCardProps | undefined => {
		const selection = picker.selection;
		if (!selection) return undefined;
		const payload = selection.context.payload;
		return {
			title: payload.accessibleName || payload.role || payload.domPath,
			target: payload.domPath,
			edits: liveEdit.edits,
			busy: liveEdit.busy,
			hasElement: liveEdit.hasElement,
			error: liveEdit.error,
			styleProperties: BROWSER_ELEMENT_LIVE_EDIT_STYLE_KEYS,
			labels: {
				title: t("browser.liveEdit.title"),
				textPlaceholder: t("browser.liveEdit.textPlaceholder"),
				applyText: t("browser.liveEdit.applyText"),
				styleProperty: t("browser.liveEdit.styleProperty"),
				styleValuePlaceholder: t("browser.liveEdit.styleValuePlaceholder"),
				applyStyle: t("browser.liveEdit.applyStyle"),
				edits: t("browser.liveEdit.edits"),
				revertOne: t("browser.liveEdit.revertOne"),
				revertAll: t("browser.liveEdit.revertAll"),
				send: t("browser.liveEdit.send"),
				discard: t("browser.liveEdit.discard"),
				stale: t("browser.liveEdit.stale"),
				failed: t("browser.liveEdit.failed"),
			},
			onApplyText: (value) => void liveEdit.applyText(value),
			onApplyStyle: (property, value) => void liveEdit.applyStyle(property, value),
			onRevertEdit: (index) => void liveEdit.revertEdit(index),
			onRevertAll: () => void liveEdit.revertAll(),
			onSend: () => picker.confirmSelection(liveEdit.edits),
			onDiscard: () => {
				void liveEdit.revertAll().finally(() => picker.discardSelection());
			},
		};
	}, [liveEdit, picker, t]);

	const labels = useMemo(
		(): BrowserPanelLabels => ({
			noSession: t("browser.noSession"),
			back: t("browser.back"),
			forward: t("browser.forward"),
			stop: t("browser.stop"),
			reload: t("browser.reload"),
			addressPlaceholder: t("browser.addressPlaceholder"),
			openExternal: t("browser.openExternal"),
			empty: t("browser.empty"),
			loading: t("browser.loading"),
			failed: t("browser.failed"),
			retry: t("browser.retry"),
			picker: t("browser.picker"),
			pickerActive: t("browser.pickerActive"),
			pickerHint: t("browser.pickerHint"),
		}),
		[t],
	);

	const control = useCallback(
		(action: "back" | "forward" | "reload" | "stop") => {
			void window.vetta.browserView.control({ workspaceId, action });
		},
		[workspaceId],
	);

	return {
		workspaceId,
		labels,
		address,
		canBack,
		canForward,
		loading,
		failed: failed || attachFailed,
		hasPage,
		currentUrl,
		hostRef,
		onAddressChange: setAddress,
		onAddressSubmit,
		onBack: () => control("back"),
		onForward: () => control("forward"),
		onStop: () => control("stop"),
		onReload: () => control("reload"),
		onOpenExternal: openExternal,
		onRetry: retry,
		pickerEnabled: picker.pickerEnabled,
		pickerDisabled: !hasPage,
		onTogglePicker: picker.onTogglePicker,
		liveEdit: liveEditView,
	};
}
