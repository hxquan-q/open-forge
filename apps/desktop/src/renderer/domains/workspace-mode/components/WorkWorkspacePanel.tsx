// Copyright The Open Forge contributors.
import { Button } from "@shared/components/ui/button";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { CollapsePanel } from "@vetta-org/theme-ui/shared";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useState } from "react";
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
	const [open, setOpen] = useState(true);
	return (
		<section className="rounded-xl border border-border/50 bg-card/40 px-3 py-2.5" data-section={id}>
			<Button
				type="button"
				variant="ghost"
				aria-expanded={open}
				className="h-auto w-full justify-start gap-1.5 px-0 py-0 text-left text-[12px] font-medium text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
				onClick={() => setOpen((previous) => !previous)}
			>
				<span className={`${SECTION_ICONS[id]} h-3.5 w-3.5`} aria-hidden />
				<span className="min-w-0 flex-1">{t(SECTION_TITLE_KEYS[id])}</span>
				<span
					className={`icon-[solar--alt-arrow-down-linear] h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
						open ? "" : "-rotate-90"
					}`}
					aria-hidden
				/>
			</Button>
			<CollapsePanel open={open} contentClassName="mt-1.5">
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
			</CollapsePanel>
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

/** 面板内部共享的分节骨架：宽屏 aside 与窄屏抽屉复用同一棵树。 */
function WorkPanelBody({ children }: WorkWorkspacePanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<>
			<header className="px-1 pb-0.5">
				<h2 className="text-[13px] font-medium text-foreground">{t("workspace.work.panelTitle")}</h2>
				<p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
					{t("workspace.work.panelLead")}
				</p>
			</header>
			{children ?? WORK_PANEL_SECTIONS.map((id) => <WorkPanelSection key={id} id={id} />)}
		</>
	);
}

/**
 * work 模式右栏容器。宽屏（≥640px，与侧边栏悬浮阈值同源）渲染 340px 固定宽度 aside；
 * 窄屏隐藏 aside，露出右下角抽屉触发按钮，点击后底部弹出面板——与 Coding 侧
 * `ActivityPanelPrimitive.Sheet` 同源的底部抽屉行为。
 *
 * 说明：本文件属 exclusive_paths，无法改 `DefaultChatView` 外层挂 `@container`；
 * 容器查询只能在父级已有 `@container` 上下文时才能感知外层宽度。因此这里用
 * `useNarrowScreen`（与 Coding 侧一致、与侧边栏悬浮同源）替换原来的
 * `min-[640px]` 媒体查询，行为等价、判定来源统一。
 */
export function WorkWorkspacePanel({ children }: WorkWorkspacePanelProps): JSX.Element {
	const { t } = useTranslation("chat");
	const narrow = useNarrowScreen();
	const [drawerOpen, setDrawerOpen] = useState(false);

	if (narrow) {
		return (
			<>
				<Button
					type="button"
					variant="outline"
					size="icon-lg"
					aria-expanded={drawerOpen}
					aria-label={t("workspace.work.openPanel")}
					title={t("workspace.work.openPanel")}
					className="fixed bottom-4 right-4 z-40 rounded-full bg-background shadow-lg shadow-black/20"
					data-workspace-panel-trigger="work"
					onClick={() => setDrawerOpen(true)}
				>
					<span className="icon-[solar--sidebar-minimalistic-outline] h-4 w-4" aria-hidden />
				</Button>
				<AnimatePresence>
					{drawerOpen ? (
						<>
							<motion.div
								key="work-sheet-backdrop"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
								onClick={() => setDrawerOpen(false)}
								className="fixed inset-0 z-40 bg-black/25"
							/>
							<motion.aside
								key="work-sheet"
								initial={{ y: "100%" }}
								animate={{ y: 0 }}
								exit={{ y: "100%" }}
								transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
								className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col gap-2 overflow-y-auto rounded-t-2xl border-t border-border bg-background p-3 shadow-2xl shadow-black/40"
								data-workspace-panel="work"
							>
								<WorkPanelBody>{children}</WorkPanelBody>
							</motion.aside>
						</>
					) : null}
				</AnimatePresence>
			</>
		);
	}

	return (
		<aside
			className="flex w-[340px] shrink-0 flex-col gap-2 overflow-y-auto"
			data-workspace-panel="work"
		>
			<WorkPanelBody>{children}</WorkPanelBody>
		</aside>
	);
}
