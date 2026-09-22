import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkPanelSection, WorkWorkspacePanel } from "./WorkWorkspacePanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("WorkWorkspacePanel", () => {
	it("默认渲染四节插槽空态（plan/sources/artifacts/review），dataset 预留不出节", () => {
		const html = renderToStaticMarkup(<WorkWorkspacePanel />);
		for (const id of ["plan", "sources", "artifacts", "review"]) {
			expect(html).toContain(`data-section="${id}"`);
			expect(html).toContain(`workspace.work.${id}.empty`);
		}
		expect(html).not.toContain('data-section="dataset"');
	});

	it("children 组合替换默认骨架，节内容可注入", () => {
		const html = renderToStaticMarkup(
			<WorkWorkspacePanel>
				<WorkPanelSection id="plan">
					<div data-testid="plan-content" />
				</WorkPanelSection>
				<WorkPanelSection id="artifacts" />
			</WorkWorkspacePanel>,
		);
		expect(html).toContain('data-testid="plan-content"');
		expect(html).not.toContain("workspace.work.plan.empty");
		expect(html).toContain("workspace.work.artifacts.empty");
		// 只组装了两节，sources/review 不出现。
		expect(html).not.toContain('data-section="sources"');
	});
});

describe("WorkPanelSection 占位状态", () => {
	it("error 态渲染错误条与重试入口，cancelled 态渲染取消文案", () => {
		const errorHtml = renderToStaticMarkup(
			<WorkPanelSection id="plan" state="error" onRetry={() => {}} />,
		);
		expect(errorHtml).toContain("workspace.work.sectionError");
		expect(errorHtml).toContain("workspace.work.retry");
		expect(errorHtml).toContain("destructive");

		const cancelledHtml = renderToStaticMarkup(<WorkPanelSection id="plan" state="cancelled" />);
		expect(cancelledHtml).toContain("workspace.work.sectionCancelled");
		expect(cancelledHtml).not.toContain("workspace.work.retry");
	});

	it("error 态无 onRetry 时不渲染重试按钮", () => {
		const html = renderToStaticMarkup(<WorkPanelSection id="plan" state="error" />);
		expect(html).toContain("workspace.work.sectionError");
		expect(html).not.toContain("workspace.work.retry");
	});
});
