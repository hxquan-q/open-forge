// Modified by The Open Forge contributors.
import type { PluginFilePreviewProps } from "@vetta-org/plugin-sdk";
import { useTranslation } from "@vetta-org/plugin-sdk";
import type { ComponentType, JSX } from "react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "./components/PreviewState";
import { isSpreadsheetExtension, OFFICE_EXTENSIONS } from "./office-formats";

type Preview = ComponentType<PluginFilePreviewProps>;
type LoadedPreview = { extension: string; component: Preview | null };

function loadPreview(extension: string): Promise<Preview> | undefined {
	switch (extension) {
		case "pdf":
			return import("./components/PdfPreview").then((module) => module.PdfPreview);
		case "docx":
			return import("./components/DocxPreview").then((module) => module.DocxPreview);
		case "pptx":
			return import("./components/PptxPreview").then((module) => module.PptxPreview);
		default:
			return isSpreadsheetExtension(extension)
				? import("./components/spreadsheet/SpreadsheetPreview").then((module) => module.SpreadsheetPreview)
				: undefined;
	}
}

export function OfficePreview(props: PluginFilePreviewProps): JSX.Element {
	const { t } = useTranslation();
	const [revision, setRevision] = useState(0);
	const [loaded, setLoaded] = useState<LoadedPreview>();
	const extension = props.file.extension;

	useEffect(() => {
		const watcher = props.file.watch(() => setRevision((value) => value + 1));
		return () => watcher.dispose();
	}, [props.file]);

	useEffect(() => {
		let cancelled = false;
		// Registration stays synchronous; request parser code only after a preview mounts.
		void loadPreview(extension)?.then(
			(component) => {
				if (!cancelled) setLoaded({ extension, component });
			},
			() => {
				if (!cancelled) setLoaded({ extension, component: null });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [extension]);

	if (!OFFICE_EXTENSIONS.includes(extension)) {
		return <ErrorState message={t("error.unsupportedFormat")} />;
	}
	if (loaded?.extension !== extension) return <LoadingState />;
	if (!loaded.component) {
		return <ErrorState message={t("error.loadPreview")} hint={t("state.loadErrorHint")} />;
	}
	const Preview = loaded.component;
	return <Preview key={revision} {...props} />;
}
