// Modified by The Open Forge contributors.
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

let activeSource: { url: string; readers: number } | undefined;

/** Keep the shared URL alive until every PDF loading task has finished shutting down. */
export function acquirePdfWorkerSource(): { url: string; dispose(): void } {
	activeSource ??= {
		url: URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })),
		readers: 0,
	};
	const source = activeSource;
	source.readers++;
	let disposed = false;
	return {
		url: source.url,
		dispose() {
			if (disposed) return;
			disposed = true;
			if (--source.readers !== 0) return;
			activeSource = undefined;
			URL.revokeObjectURL(source.url);
		},
	};
}
