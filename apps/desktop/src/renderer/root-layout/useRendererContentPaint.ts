// Copyright The Open Forge contributors.
import { useEffect } from "react";
import { waitForCommittedPaint } from "../shared/lib/committed-paint";

export function useRendererContentPaint(routePending: boolean): void {
	useEffect(() => {
		if (routePending) return;
		let cancelled = false;
		window.vetta.appLifecycle.reportStartupPhase?.("route-content-committed");
		void waitForCommittedPaint({ timeoutMs: null }).then((result) => {
			if (!cancelled) window.vetta.appLifecycle.reportRendererContentPainted(result);
		});
		return () => {
			cancelled = true;
		};
	}, [routePending]);
}
