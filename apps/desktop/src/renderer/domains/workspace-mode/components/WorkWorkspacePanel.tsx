// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * work 模式右栏（IA 定稿 §2）：Plan / Sources / Artifacts / Review 分区纵向插槽。
 * 骨架阶段各节渲染空态；TASK-0017/0018 用 `<WorkPanelSection id>` 注入真实内容——
 * 面板本身不读任何 Runtime/Session 数据，不持有执行状态（IA §8）。
 */

/**
 * 全部合法节 id。`dataset` 为 IA §2 预留位（数据分析入口接入时出节），
 * 骨架默认只渲染 WORK_PANEL_SECTIONS 中列出的四节。
 */
export const WORK_PANEL_SECTION_IDS = ["plan", "sources", "dataset", "artifacts", "review"] as const;
export type WorkPanelSectionId = (typeof WORK_PANEL_SECTION_IDS)[number];

export const WORK_PANEL_SECTIONS = ["plan", "sources", "artifacts", "review"] as const;

export type WorkPanelSectionState = "empty" | "error" | "cancelled";

const SECTION_TITLE_KEYS = {
	plan: "workspace.work.plan.title",
	sources: "workspace.work.sources.title",
	dataset: "workspace.work.dataset.title",
	artifacts: "workspace.work.artifacts.title",
	review: "workspace.work.review.title",
} as const;

const SECTION_EMPTY_KEYS = {
	plan: "workspace.work.plan.empty",
	sources: "workspace.work.sources.empty",
	dataset: "workspace.work.dataset.empty",
	artifacts: "workspace.work.artifacts.empty",
	review: "workspace.work.review.empty",
} as const;

const SECTION_ICONS: Record<WorkPanelSectionId, string> = {
	plan: "icon-[solar--list-check-linear]",
	sources: "icon-[solar--folder-with-files-linear]",
	dataset: "icon-[solar--database-linear]",
	artifacts: "icon-[solar--documents-linear]",
	review: "icon-[solar--check-read-linear]",
};

export interface WorkPanelSectionProps {
	readonly id: WorkPanelSectionId;
	/** 无 children 时渲染的占位状态（骨架期为 empty）。 */
	readonly state?: WorkPanelSectionState;
	/** error 态的重试回调；不提供则不显示重试按钮。 */
	readonly onRetry?: () => void;
	/** 节内容；缺省时按 state 渲染空/错/取消态。 */
	readonly children?: ReactNode;
}

/** work 面板的一节：标题 + 内容/占位态。节的命名插槽，不是任意 region。 */
export function WorkPanelSection({
	id,
	state = "empty",
	onRetry,
	children,
}: WorkPanelSectionProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<section className="rounded-xl border border-border/50 bg-card/40 px-3 py-2.5" data-section={id}>
			<h3 className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
				<span className={`${SECTION_ICONS[id]} h-3.5 w-3.5`} aria-hidden />
				{t(SECTION_TITLE_KEYS[id])}
			</h3>
			<div className="mt-1.5">
				{children ??
					(state === "error" ? (
						<div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5">
							<p className="min-w-0 flex-1 text-[12px] leading-5 text-destructive">
								{t("workspace.work.sectionError")}
							</p>
							{onRetry ? (
								<Button variant="outline" size="sm" onClick={onRetry}>
									{t("workspace.work.retry")}
								</Button>
							) : null}
						</div>
					) : state === "cancelled" ? (
						<p className="text-[12px] leading-5 text-muted-foreground/60">
							{t("workspace.work.sectionCancelled")}
						</p>
					) : (
						<p className="text-[12px] leading-5 text-muted-foreground/60">{t(SECTION_EMPTY_KEYS[id])}</p>
					))}
			</div>
		</section>
	);
}

export interface WorkWorkspacePanelProps {
	/**
	 * 节内容（用 `<WorkPanelSection id>` 组装）；缺省渲染骨架的四节空态。
	 * children 为空时回退默认布局，便于后续任务只注入个别节。
	 */
	readonly children?: ReactNode;
}

export function WorkWorkspacePanel({ children }: WorkWorkspacePanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		// 窄屏（<640px，与侧边栏悬浮阈值同源）没有右栏位置：coding 侧此时改走底部
		// 抽屉，work 骨架直接隐藏。
		<aside
			className="hidden w-[340px] shrink-0 flex-col gap-2 overflow-y-auto min-[640px]:flex"
			data-workspace-panel="work"
		>
			<header className="px-1 pb-0.5">
				<h2 className="text-[13px] font-medium text-foreground">{t("workspace.work.panelTitle")}</h2>
				<p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{t("workspace.work.panelLead")}</p>
			</header>
			{children ?? WORK_PANEL_SECTIONS.map((id) => <WorkPanelSection key={id} id={id} />)}
		</aside>
	);
}
