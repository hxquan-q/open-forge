// Copyright The Open Forge contributors.

/**
 * 增量 + 权威快照的事件模型（ADR-0152）：Host 周期或在失步时发送 snapshot，平时发 delta。
 * 客户端只接受 revision 连续的 delta；断档时进入 stale，等待下一份快照，不猜测补齐。
 */
export type HostStreamEvent<S, D> =
	| { readonly kind: "snapshot"; readonly revision: number; readonly state: S }
	| { readonly kind: "delta"; readonly revision: number; readonly delta: D };

export type HostStreamView<S> =
	| { readonly status: "empty" }
	| { readonly status: "live"; readonly revision: number; readonly state: S }
	| { readonly status: "stale"; readonly revision: number; readonly state: S };

export function reduceHostStream<S, D>(
	view: HostStreamView<S>,
	event: HostStreamEvent<S, D>,
	applyDelta: (state: S, delta: D) => S,
): HostStreamView<S> {
	if (event.kind === "snapshot") {
		if (view.status !== "empty" && event.revision < view.revision) return view;
		return { status: "live", revision: event.revision, state: event.state };
	}
	if (view.status !== "live") return view;
	if (event.revision <= view.revision) return view;
	if (event.revision !== view.revision + 1) return { status: "stale", revision: view.revision, state: view.state };
	return { status: "live", revision: event.revision, state: applyDelta(view.state, event.delta) };
}
