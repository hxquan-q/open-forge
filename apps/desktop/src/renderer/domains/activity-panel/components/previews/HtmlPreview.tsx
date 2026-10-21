// Modified by The Open Forge contributors.
import { HtmlPreviewView } from "@vetta-org/theme-ui/activity";
import { useTranslation } from "react-i18next";

interface HtmlPreviewProps {
	content: string;
	theme: "light" | "dark";
	/** File-backed previews load the real document so relative assets resolve; inline content uses srcDoc. */
	src?: string;
	revision?: string | number;
}

/** Host wrapper: pure HTML render surface (no nested preview/code chrome). */
export function HtmlPreview({ content, theme, src, revision }: HtmlPreviewProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<HtmlPreviewView
			content={content}
			theme={theme}
			src={src}
			revision={revision}
			title={t("activityPanel.htmlPreview.title")}
		/>
	);
}
