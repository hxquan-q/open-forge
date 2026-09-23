// Copyright The Open Forge contributors.
import { useOpenActivityTab } from "@domains/conversation/hooks/useOpenActivityTab";
import { type ArtifactCanvasOpenDetails, activeSessionAtom, pendingCanvasArtifactIdAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";

export function ArtifactCanvasOpenButton({
	artifact,
}: {
	readonly artifact: ArtifactCanvasOpenDetails;
}): JSX.Element | null {
	const { t } = useTranslation("chat");
	const workspaceId = useAtomValue(activeSessionAtom)?.cwd;
	const openActivityTab = useOpenActivityTab(workspaceId);
	const setPending = useSetAtom(pendingCanvasArtifactIdAtom);
	if (!workspaceId) return null;
	return (
		<button
			type="button"
			className="mt-2 rounded-md border border-border/60 px-2 py-1 text-[11px] text-foreground hover:bg-secondary"
			onClick={() => {
				setPending(artifact.artifactId);
				openActivityTab("canvas");
			}}
		>
			{t("toolCall.openInCanvas")}
		</button>
	);
}
