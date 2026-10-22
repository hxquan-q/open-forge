// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRendererContentPaint } from "./useRendererContentPaint";
const painted = vi.fn(); const phase = vi.fn();
let frames: FrameRequestCallback[];
beforeEach(() => {
 frames=[]; painted.mockClear();phase.mockClear();
 vi.stubGlobal("vetta", {appLifecycle:{reportRendererContentPainted:painted,reportStartupPhase:phase}});
 vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
 vi.spyOn(window,"requestAnimationFrame").mockImplementation((callback)=>{frames.push(callback);return frames.length;});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function present() { await act(async()=>{frames.shift()?.(0);frames.shift()?.(1);}); }
it("reports only after route commit and two presentation frames", async()=>{
 const hook=renderHook(({pending})=>useRendererContentPaint(pending),{initialProps:{pending:true}});
 expect(phase).not.toHaveBeenCalled(); hook.rerender({pending:false});
 expect(phase).toHaveBeenCalledWith("route-content-committed");expect(painted).not.toHaveBeenCalled();
 await present();expect(painted).toHaveBeenCalledWith("painted");hook.unmount();
});
it("records hidden content as skipped and suppresses reports after unmount or renewed pending",async()=>{
 vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");
 const hidden=renderHook(()=>useRendererContentPaint(false));await act(async()=>{});
 expect(painted).toHaveBeenCalledWith("skipped-hidden");hidden.unmount();painted.mockClear();
 vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
 const hook=renderHook(({pending})=>useRendererContentPaint(pending),{initialProps:{pending:false}});
 hook.rerender({pending:true});await present();expect(painted).not.toHaveBeenCalled();hook.unmount();
 const unmounted=renderHook(()=>useRendererContentPaint(false));unmounted.unmount();await present();
 expect(painted).not.toHaveBeenCalled();
});
