// Modified by The Open Forge contributors.
import type { RendererPaintResult, RendererStartupPhase } from "../../shared/app-lifecycle-ipc.js";

export interface DesktopAppLifecycleApi {
	reportRendererBootPainted(result?: RendererPaintResult): void;
	reportRendererContentPainted(result?: RendererPaintResult): void;
	reportStartupPhase?(phase: RendererStartupPhase): void;
	whenReady(): Promise<void>;
}
