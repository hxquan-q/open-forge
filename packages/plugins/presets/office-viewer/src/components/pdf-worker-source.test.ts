// Modified by The Open Forge contributors.
import { afterEach, expect, it, vi } from "vitest";
import { acquirePdfWorkerSource } from "./pdf-worker-source";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?raw", () => ({ default: "/* PDF worker fixture */" }));
afterEach(() => vi.unstubAllGlobals());

it("makes duplicate lease disposal harmless while another preview still owns the source", () => {
	const createObjectURL = vi.fn(() => "blob:shared");
	const revokeObjectURL = vi.fn();
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = createObjectURL;
			static revokeObjectURL = revokeObjectURL;
		},
	);
	const first = acquirePdfWorkerSource();
	const second = acquirePdfWorkerSource();
	try {
		expect(first.url).toBe(second.url);
		expect(createObjectURL).toHaveBeenCalledOnce();
		first.dispose();
		first.dispose();
		expect(revokeObjectURL).not.toHaveBeenCalled();
		second.dispose();
		second.dispose();
		expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:shared");
	} finally {
		first.dispose();
		second.dispose();
	}
});
