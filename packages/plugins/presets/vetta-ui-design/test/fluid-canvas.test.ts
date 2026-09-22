/**
 * canvas 流体：原来的 CSS 版每帧对大面积重做高斯模糊，GPU 随亮着的 frame 数飙升。
 * 这里守住三件事——画布很小、绘制不用 filter、所有 canvas 共用一个循环并能注销干净。
 */
import { afterEach, expect, it, vi } from "vitest";
import { activeFluidCount, drawFluid, fluidCanvasSize, startFluid } from "../src/canvas/fluid-canvas";

const COLORS = ["#0ea5e9", "#22d3ee", "#38bdf8", "#6366f1", "#2dd4bf"];

/** 记录调用的 2D context 替身：happy-dom 没有真正的 canvas 实现。 */
function recordingContext() {
	const calls: string[] = [];
	const props: Record<string, unknown> = {};
	const gradient = { addColorStop: () => {} };
	const ctx = new Proxy(
		{},
		{
			get(_target, key: string) {
				if (key in props) return props[key];
				if (key === "createRadialGradient") return () => gradient;
				return (...args: unknown[]) => calls.push(`${key}(${args.length})`);
			},
			set(_target, key: string, value) {
				props[key] = value;
				calls.push(`${key}=${String(value)}`);
				return true;
			},
		},
	) as unknown as CanvasRenderingContext2D;
	return { ctx, calls };
}

/** 各测试独立维护的注销函数；模块级 entries 跨用例存留，必须清干净。 */
let stops: Array<() => void> = [];

afterEach(() => {
	for (const stop of stops) stop();
	stops = [];
	vi.unstubAllGlobals();
});

it("keeps the canvas tiny and in the frame's aspect ratio", () => {
	expect(fluidCanvasSize(390, 844)).toEqual({ width: 30, height: 64 });
	expect(fluidCanvasSize(1440, 900)).toEqual({ width: 64, height: 40 });
	// 极端细长也至少留几个像素，不画成 0。
	expect(fluidCanvasSize(10, 5000).width).toBeGreaterThanOrEqual(4);
});

it("draws soft blobs and bakes the edge mask in without any filter", () => {
	const { ctx, calls } = recordingContext();
	drawFluid(ctx, 30, 64, 1234, COLORS);
	expect(calls.some((call) => call.startsWith("filter="))).toBe(false);
	expect(calls).toContain("globalCompositeOperation=destination-in");
	expect(calls.filter((call) => call.startsWith("fillRect")).length).toBe(COLORS.length + 1);
	// 画完复位，不把 destination-in 留给下一帧。
	expect(calls.at(-1)).toBe("globalCompositeOperation=source-over");
});

it("shares one animation loop across canvases and stops it when the last one leaves", () => {
	const rafs: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => rafs.push(cb));
	const cancel = vi.fn();
	vi.stubGlobal("cancelAnimationFrame", cancel);
	const canvas = (): HTMLCanvasElement =>
		({ width: 30, height: 64, getContext: () => recordingContext().ctx, closest: () => null }) as unknown as HTMLCanvasElement;

	const stopA = startFluid(canvas(), COLORS);
	const stopB = startFluid(canvas(), COLORS);
	expect(activeFluidCount()).toBe(2);
	expect(rafs).toHaveLength(1);

	stopA();
	expect(cancel).not.toHaveBeenCalled();
	stopB();
	expect(activeFluidCount()).toBe(0);
	expect(cancel).toHaveBeenCalledTimes(1);
});

it("throttles the shared loop to at most ~24fps so frame cost stays bounded", () => {
	const rafs: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => rafs.push(cb));
	vi.stubGlobal("cancelAnimationFrame", () => {});
	const { ctx, calls } = recordingContext();
	const canvas = { width: 30, height: 64, getContext: () => ctx, closest: () => null } as unknown as HTMLCanvasElement;
	stops.push(startFluid(canvas, COLORS));
	calls.length = 0; // 丢弃挂载时的同步首帧，只数循环画的帧

	const tick = (now: number): void => rafs.shift()?.(now);
	tick(10_000); // 距上一帧足够久：画
	tick(10_030); // 间隔不足 1000/24ms：跳过
	tick(10_042); // 达到间隔：画

	// 每帧 5 个 blob + 1 次遮罩；两帧共 12 次填充，30ms 那次没有出帧。
	expect(calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(12);
});

it("skips frames outside the viewport and resumes when they come back", async () => {
	// 观察者是模块级单例，happy-dom 又自带 IntersectionObserver 实现；不重置模块的话，
	// 前面的用例早用真实现占住了单例，这里的假观察者永远接不上线。
	vi.resetModules();
	const rafs: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => rafs.push(cb));
	vi.stubGlobal("cancelAnimationFrame", () => {});
	const observed: Array<{ callback: IntersectionObserverCallback; targets: unknown[] }> = [];
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			constructor(callback: IntersectionObserverCallback) {
				observed.push({ callback, targets: [] });
			}
			observe(target: unknown): void {
				observed.at(-1)?.targets.push(target);
			}
			unobserve(): void {}
		},
	);
	const { startFluid: startFreshFluid } = await import("../src/canvas/fluid-canvas");
	const recording = [recordingContext(), recordingContext()];
	const canvases = recording.map(
		(entry) =>
			({ width: 30, height: 64, getContext: () => entry.ctx, closest: () => null }) as unknown as HTMLCanvasElement,
	);
	stops.push(startFreshFluid(canvases[0], COLORS), startFreshFluid(canvases[1], COLORS));
	for (const entry of recording) entry.calls.length = 0;
	expect(observed).toHaveLength(1);
	expect(observed[0]?.targets).toEqual(canvases);

	const report = (target: unknown, isIntersecting: boolean): void => {
		observed[0]?.callback([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
	};
	report(canvases[1], false);
	rafs.shift()?.(1_000);
	// 视野内那张照常画；滚出去的那张一张帧都不出，循环本身还在跑。
	expect(recording[0]?.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(6);
	expect(recording[1]?.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(0);

	report(canvases[1], true);
	rafs.shift()?.(2_000);
	expect(recording[1]?.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(6);
});

it("skips drawing while the canvas surface is being zoomed or panned", () => {
	const rafs: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => rafs.push(cb));
	vi.stubGlobal("cancelAnimationFrame", () => {});
	const { ctx, calls } = recordingContext();
	const interacting = document.createElement("div");
	const canvas = {
		width: 30,
		height: 64,
		getContext: () => ctx,
		closest: (selector: string) => (selector === ".vetd-interacting" ? interacting : null),
	} as unknown as HTMLCanvasElement;
	stops.push(startFluid(canvas, COLORS));
	calls.length = 0;

	rafs.shift()?.(20_000);

	// 缩放/平移途中一张纹理都不上传；挂载时的同步首帧不算循环行为。
	expect(calls).toHaveLength(0);
});

it("draws exactly one static frame and never joins the loop under reduced motion", () => {
	const raf = vi.fn();
	vi.stubGlobal("requestAnimationFrame", raf);
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const { ctx, calls } = recordingContext();
	const canvas = { width: 30, height: 64, getContext: () => ctx, closest: () => null } as unknown as HTMLCanvasElement;

	const stop = startFluid(canvas, COLORS);

	// 有画面，但没有动画：不进共享循环，也就没有任何持续开销。
	expect(calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(6);
	expect(activeFluidCount()).toBe(0);
	expect(raf).not.toHaveBeenCalled();
	stop();
});
