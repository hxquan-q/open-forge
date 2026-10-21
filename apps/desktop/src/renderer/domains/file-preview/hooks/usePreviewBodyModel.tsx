// Modified by The Open Forge contributors.
import { pathDirname, pathNormalize } from "@shared/lib/utils";
import { pluginFilePreviewsAtom } from "@shared/store/atoms";
import type { FilePreviewItem, PreviewBodyViewProps } from "@vetta-org/theme-ui/file-preview";
import { getExtension } from "@vetta-org/theme-ui/file-preview";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PluginI18nBoundary } from "../../plugins/runtime/plugin-i18n";
import { PluginFilePreview } from "../components/PluginFilePreview";
import { TextPreviewRenderer } from "../components/TextPreviewRenderer";
import { collectPreviewAssets, isHtmlPreviewExtension, matchesPreviewAssetChange } from "../preview-assets";
import { downloadItem, isPreviewSupported, isTextExtension } from "../preview-utils";

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "unsupported" }
	| { status: "loaded"; content: string; extension: string };

export function usePreviewBodyModel(
	item: FilePreviewItem,
	refreshNonce = 0,
): PreviewBodyViewProps {
	const ext = useMemo(() => getExtension(item.name), [item.name]);
	const supported = isPreviewSupported(item.name);
	const canLoad = supported || Boolean(item.path);
	const { t } = useTranslation("chat");
	const pluginPreviews = useAtomValue(pluginFilePreviewsAtom);
	const pluginPreview = useMemo(
		() => pluginPreviews.find((p) => p.extensions.includes(ext)),
		[pluginPreviews, ext],
	);

	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [watchTick, setWatchTick] = useState(0);
	/** 自增即重载 iframe：文档内容变化或被引用的 CSS/JS/图片变化。 */
	const [revision, setRevision] = useState(0);
	const itemPath = item.path;
	const itemUrl = item.url;
	const itemKey = itemPath ?? itemUrl ?? item.name;
	const prevKeyRef = useRef<string | null>(null);
	/** 上次落在界面上的内容，用来区分「重读后内容未变」与真实修改。 */
	const lastLoadedRef = useRef<{ content: string; extension: string } | null>(null);

	useEffect(() => {
		if (pluginPreview || !canLoad) return;
		let cancelled = false;
		const isNewItem = prevKeyRef.current !== itemKey;
		prevKeyRef.current = itemKey;
		if (isNewItem) {
			setState({ status: "loading" });
			lastLoadedRef.current = null;
		}

		void loadItem(itemPath, itemUrl, ext, supported)
			.then((result) => {
				if (cancelled) return;
				if (result.status !== "loaded") {
					lastLoadedRef.current = null;
					setState(result);
					return;
				}
				const previous = lastLoadedRef.current;
				const unchanged =
					previous !== null && previous.content === result.content && previous.extension === result.extension;
				lastLoadedRef.current = { content: result.content, extension: result.extension };
				// 同目录写入会触发重读，但内容字符串不变时不动界面，也不重载 iframe。
				if (unchanged) return;
				setState(result);
				if (previous !== null) setRevision((value) => value + 1);
			})
			.catch((err: Error) => {
				if (!cancelled) {
					const message = err.message?.includes("too large")
						? t("fileEditor.errorPreviewTooLarge")
						: t("fileEditor.errorRead");
					setState({ status: "error", message });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [itemPath, itemUrl, ext, supported, canLoad, pluginPreview, itemKey, watchTick, refreshNonce, t]);

	const htmlDirectory = useMemo(() => (itemPath ? pathDirname(itemPath) : undefined), [itemPath]);
	// 只跟随 HTML 的引用集合；非 HTML 预览不额外监听资源目录。
	const previewAssets = useMemo(
		() =>
			isHtmlPreviewExtension(ext) && state.status === "loaded"
				? collectPreviewAssets(state.content, itemPath)
				: { paths: new Set<string>(), directories: [] as string[] },
		[ext, itemPath, state.status, state.status === "loaded" ? state.content : ""],
	);
	const assetDirectoryKey = previewAssets.directories.join("\n");

	useEffect(() => {
		if (!htmlDirectory || pluginPreview || !canLoad) return;
		const watchedDirectories = [...new Set([htmlDirectory, ...previewAssets.directories])];
		for (const dir of watchedDirectories) void window.vetta.fs.watchDir(dir);
		const htmlDirectoryKey = pathNormalize(htmlDirectory);
		const unsub = window.vetta.fs.onDirChanged((changed, fileNames) => {
			const changedKey = pathNormalize(changed);
			const isHtmlDirectory = changedKey === htmlDirectoryKey;
			const isAssetDirectory = previewAssets.directories.some(
				(directory) => pathNormalize(directory) === changedKey,
			);
			if (!isHtmlDirectory && !isAssetDirectory) return;
			// HTML 目录的变化一律重读；内容是否变化由上方比较决定。
			if (isHtmlDirectory) setWatchTick((tick) => tick + 1);
			// 被引用资源变化时只递增消息版本，让 iframe 重新加载。
			if (matchesPreviewAssetChange(previewAssets, changed, fileNames)) setRevision((value) => value + 1);
		});
		return () => {
			unsub();
			for (const dir of watchedDirectories) void window.vetta.fs.unwatchDir(dir);
		};
	}, [htmlDirectory, assetDirectoryKey, canLoad, pluginPreview, previewAssets]);

	const labels = {
		unsupported: t("fileEditor.unsupported"),
		download: t("fileEditor.download"),
	};

	if (pluginPreview) {
		return {
			state: {
				status: "plugin",
				content: (
					<PluginI18nBoundary pluginId={pluginPreview.pluginId}>
						<PluginFilePreview
							key={`${itemKey}-${refreshNonce}`}
							item={item}
							ext={ext}
							component={pluginPreview.component}
						/>
					</PluginI18nBoundary>
				),
			},
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	if (!canLoad || state.status === "unsupported") {
		return {
			state: { status: "unsupported", item },
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	if (state.status === "loading") {
		return { state: { status: "loading" }, labels, onDownload: (it) => void downloadItem(it) };
	}

	if (state.status === "error") {
		return {
			state: { status: "error", message: state.message },
			labels,
			onDownload: (it) => void downloadItem(it),
		};
	}

	const content = (
		<TextPreviewRenderer
			content={state.content}
			extension={state.extension}
			sourcePath={item.path ?? item.url}
			revision={`${revision}:${refreshNonce}`}
		/>
	);

	return {
		state: { status: "content", content },
		labels,
		onDownload: (it) => void downloadItem(it),
	};
}

async function loadItem(
	path: string | undefined,
	url: string | undefined,
	ext: string,
	declaredTextFormat: boolean,
): Promise<Extract<LoadState, { status: "loaded" | "unsupported" }>> {
	if (path) {
		if (declaredTextFormat) {
			const result = await window.vetta.fs.readFile(path);
			return { status: "loaded", content: result.content, extension: ext };
		}
		const result = await window.vetta.fs.readTextPreviewFile(path);
		return result.status === "text"
			? { status: "loaded", content: result.content, extension: "" }
			: { status: "unsupported" };
	}
	if (!url) {
		throw new Error("FILE_PREVIEW_NO_SOURCE");
	}
	if (!declaredTextFormat) return { status: "unsupported" };
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	if (isTextExtension(ext)) {
		const text = await res.text();
		return { status: "loaded", content: text, extension: ext };
	}
	const buf = await res.arrayBuffer();
	return { status: "loaded", content: arrayBufferToBase64(buf), extension: ext };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
