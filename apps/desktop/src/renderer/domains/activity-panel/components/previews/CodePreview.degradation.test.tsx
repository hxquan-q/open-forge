// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LARGE_OBJECT_LIMITS } from "@vetta-org/theme-ui/shared";

const { codeToHtml } = vi.hoisted(() => ({
	codeToHtml: vi.fn(async (_code: string, _options: unknown) => "<pre>highlighted</pre>"),
}));
vi.mock("shiki", () => ({
	codeToHtml,
}));

const { CodePreview } = await import("./CodePreview");

const NOTICE = "内容过大，已改为纯文本预览";

describe("CodePreview 大尺寸降级硬闸", () => {
	beforeEach(() => {
		codeToHtml.mockClear();
	});

	it("超过 artifact 阈值时走纯文本并显示 i18n 提示，不调用 Shiki", async () => {
		const content = `const big = 1;\n${"x".repeat(LARGE_OBJECT_LIMITS.artifactBytes)}`;
		const { container } = render(
			<CodePreview content={content} extension="ts" theme="dark" degradationNotice={NOTICE} />,
		);

		expect(container.querySelector("[data-degraded='true']")).not.toBeNull();
		expect(container.textContent).toContain(content);
		expect(container.textContent).toContain(NOTICE);
		await Promise.resolve();
		expect(codeToHtml).not.toHaveBeenCalled();
	});

	it("文件预览按 textFile 阈值判定，行数超限同样降级", async () => {
		const manyLines = Array.from({ length: LARGE_OBJECT_LIMITS.textFileLines + 1 }, () => "line").join("\n");
		const { container } = render(
			<CodePreview
				content={manyLines}
				extension="txt"
				theme="dark"
				degradationKind="textFile"
				degradationNotice={NOTICE}
			/>,
		);

		expect(container.querySelector("[data-degraded='true']")).not.toBeNull();
		await Promise.resolve();
		expect(codeToHtml).not.toHaveBeenCalled();
	});

	it("正常体量仍走高亮路径", async () => {
		const { container } = render(
			<CodePreview content="const a = 1;" extension="ts" theme="dark" degradationNotice={NOTICE} />,
		);

		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.innerHTML).toContain("highlighted"));
		expect(container.textContent).not.toContain(NOTICE);
	});
});
