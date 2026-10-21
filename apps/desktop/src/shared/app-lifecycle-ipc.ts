// Modified by The Open Forge contributors.
export type RendererPaintResult = "painted" | "skipped-hidden" | "timeout";
export type RendererStartupPhase = "app-ready" | "renderer-module-loaded" | "route-content-committed";
export const APP_LIFECYCLE_RENDERER_STARTUP_PHASE_CHANNEL = "vetta:app-lifecycle:renderer-startup-phase";
export const APP_LIFECYCLE_RENDERER_BOOT_PAINTED_CHANNEL = "vetta:app-lifecycle:renderer-boot-painted";
export const APP_LIFECYCLE_RENDERER_CONTENT_PAINTED_CHANNEL = "vetta:app-lifecycle:renderer-content-painted";
export const APP_LIFECYCLE_WHEN_READY_CHANNEL = "vetta:app-lifecycle:when-ready";
