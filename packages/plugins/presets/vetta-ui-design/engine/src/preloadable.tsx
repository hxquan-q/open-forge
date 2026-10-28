// Modified by The Open Forge contributors.

import { lazy } from "react";
import type { ComponentType } from "react";

export interface Preloadable {
	Component: ComponentType;
	/** Failures stay on the lazy rendering path, where the frame boundary handles them. */
	preload(): Promise<void>;
}

/** Preload only the initial route so its first render avoids a Suspense fallback commit. */
export function preloadable(load: () => Promise<{ default: ComponentType }>): Preloadable {
	let loaded: ComponentType | null = null;
	let pending: Promise<{ default: ComponentType }> | undefined;
	const loadOnce = () => (pending ??= load());
	const Lazy = lazy(loadOnce);
	function Component() {
		const Resolved = loaded ?? Lazy;
		return <Resolved />;
	}
	return {
		Component,
		preload: () =>
			loadOnce().then(
				(module) => {
					loaded = module.default;
				},
				() => {},
			),
	};
}
