// Copyright The Open Forge contributors.

// Test ownership only; this is not an execution-boundary attestation.
export function processFixture(signal) {
	const controller = new AbortController();
	const active = new Set();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	let closed = false;
	let closing;
	return {
		signal: controller.signal,
		run(operation) {
			if (closed) return Promise.reject(new Error("test process fixture is closed"));
			const pending = (async () => {
				controller.signal.throwIfAborted();
				return operation(controller.signal);
			})();
			active.add(pending);
			pending.then(
				() => active.delete(pending),
				() => active.delete(pending),
			);
			return pending;
		},
		close() {
			if (!closing) {
				closed = true;
				abort();
				signal?.removeEventListener("abort", abort);
				closing = Promise.allSettled([...active]).then(() => {});
			}
			return closing;
		},
	};
}
