import { Button } from "@shared/components/ui/button";
import type { DesktopArtifactView } from "@preload/api-types/task";
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RegisteredArtifactRenderer } from "@shared/store/atoms";

interface TaskArtifactPreviewProps {
	readonly artifact: DesktopArtifactView;
	readonly renderer?: RegisteredArtifactRenderer;
	readonly onClose: () => void;
}

export function TaskArtifactPreview({ artifact, renderer, onClose }: TaskArtifactPreviewProps): JSX.Element {
	const { t } = useTranslation("chat");
	const [readError, setReadError] = useState(false);
	const mountedRef = useRef(true);
	useEffect(() => () => {
			mountedRef.current = false;
		}, []);

	const rendererCanRead = Boolean(
		renderer?.canRead &&
			artifact.rendererStatus === "available" &&
			renderer.validateDescriptor(artifact.descriptor),
	);
	const source = useMemo(() => {
		if (!rendererCanRead || !renderer) return null;
		const bound = renderer.createSource({
			taskSessionId: artifact.taskSessionId,
			artifactId: artifact.descriptor.artifactId,
			version: artifact.descriptor.version,
			rendererType: artifact.descriptor.rendererType ?? artifact.descriptor.kind,
			sizeBytes: artifact.sizeBytes,
		});
		return {
			sizeBytes: bound.sizeBytes,
			readText: async () => {
				try {
					return await bound.readText();
				} catch (error) {
					if (mountedRef.current) setReadError(true);
					throw error;
				}
			},
			readBytes: async () => {
				try {
					return await bound.readBytes();
				} catch (error) {
					if (mountedRef.current) setReadError(true);
					throw error;
				}
			},
		};
	}, [artifact, renderer, rendererCanRead]);

	let unavailableLabel: string | null = null;
	if (readError) unavailableLabel = t("activityPanel.task.artifactReadFailed");
	else if (artifact.rendererStatus === "missing") unavailableLabel = t("activityPanel.task.artifactMissing");
	else if (artifact.rendererStatus !== "available") unavailableLabel = t("activityPanel.task.artifactUnavailable");
	else if (!rendererCanRead) unavailableLabel = t("activityPanel.task.artifactRendererFallback");

	return (
		<section className="rounded-xl border border-border/50 bg-card/40 px-3.5 pt-3 pb-3" aria-label={artifact.descriptor.title}>
			<div className="flex items-center gap-2">
				<h3 className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
					{artifact.descriptor.title}
				</h3>
				<Button size="sm" variant="ghost" onClick={onClose}>
					{t("activityPanel.task.artifactPreviewClose")}
				</Button>
			</div>
			{unavailableLabel ? (
				<p className="mt-2 text-[12px] text-muted-foreground" role="status" aria-live="polite">
					{unavailableLabel}
				</p>
			) : renderer && source ? (
				<div className="mt-2 min-w-0 overflow-hidden">
					<ArtifactRendererErrorBoundary
						fallback={<p className="text-[12px] text-muted-foreground" role="alert">{t("activityPanel.task.artifactReadFailed")}</p>}
					>
						<renderer.component descriptor={artifact.descriptor} source={source} />
					</ArtifactRendererErrorBoundary>
				</div>
			) : null}
		</section>
	);
}

interface ArtifactRendererErrorBoundaryProps {
	readonly children: ReactNode;
	readonly fallback: ReactNode;
}

interface ArtifactRendererErrorBoundaryState {
	readonly failed: boolean;
}

class ArtifactRendererErrorBoundary extends Component<
	ArtifactRendererErrorBoundaryProps,
	ArtifactRendererErrorBoundaryState
> {
	state: ArtifactRendererErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(): ArtifactRendererErrorBoundaryState {
		return { failed: true };
	}

	render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}
