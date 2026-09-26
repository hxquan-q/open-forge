import type { SkillInfo } from "@preload/api";
import { SkillTypeIcon } from "@vetta-org/theme-ui/skills";
import { motion } from "motion/react";
import { useId, useMemo } from "react";
import { SkillListEmpty } from "./SkillListEmpty";
import type { SkillListProps, SkillListSection } from "./types";

/**
 * 把扁平 items 切成「场景 / 技能」两段：渲染顺序按 type 做 stable partition，
 * 但每行的身份索引仍是它在原始 items 里的 flat 下标——父级的 activeIndex、
 * Enter 选中（items[activeIndex]）与 data-index 滚动定位都按原始序工作，
 * 分组只重排视觉顺序，不重编号。
 */
function buildSections(items: readonly SkillInfo[], scenesTitle: string, skillsTitle: string): SkillListSection[] {
	const scenes: SkillInfo[] = [];
	const skills: SkillInfo[] = [];
	for (const skill of items) {
		if (skill.type === "scene") scenes.push(skill);
		else skills.push(skill);
	}
	const sections: SkillListSection[] = [];
	if (scenes.length > 0) {
		sections.push({ kind: "scene", title: scenesTitle, count: scenes.length, items: scenes, startIndex: 0 });
	}
	if (skills.length > 0) {
		sections.push({
			kind: "skill",
			title: skillsTitle,
			count: skills.length,
			items: skills,
			startIndex: scenes.length,
		});
	}
	return sections;
}

interface SkillListItemProps {
	skill: SkillInfo;
	/** global 索引（含 indexOffset），与父级键盘导航的 activeIndex 一致。 */
	globalIndex: number;
	active: boolean;
	icon?: string;
	sourceLabel?: string;
	onHover: () => void;
	onSelect: () => void;
}

/**
 * 行：24px 圆角图标容器 + 名称 + source 徽标 + 第二行 line-clamp-2 描述。
 * 容器与 「§6 图标梯度」一致；active 用 primary 9% 背景 + 左侧 2px marker。
 * role="option" + aria-selected 与 hover/active 状态同源。
 */
function SkillListItem({
	skill,
	globalIndex,
	active,
	icon,
	sourceLabel,
	onHover,
	onSelect,
}: SkillListItemProps): JSX.Element {
	const isScene = skill.type === "scene";
	const hasDescription = Boolean(skill.description?.trim());
	const displayName = (skill.alias ?? skill.name).trim() || skill.name;
	return (
		<button
			type="button"
			role="option"
			aria-selected={active}
			data-index={globalIndex}
			onMouseEnter={onHover}
			onClick={onSelect}
			title={skill.description || displayName}
			className={[
				"relative flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
				"hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
			].join(" ")}
			style={{
				background: active ? "color-mix(in srgb, var(--primary) 9%, transparent)" : undefined,
			}}
		>
			{active && (
				<motion.span
					layoutId="command-panel-active-marker"
					className="absolute inset-y-1.5 left-0.5 w-0.5 rounded-full bg-primary"
					transition={{ type: "spring", stiffness: 500, damping: 32 }}
				/>
			)}
			<span
				className={[
					"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border",
					isScene
						? "border-border/60 bg-accent/60 text-muted-foreground"
						: "border-primary/30 bg-primary/10 text-primary",
				].join(" ")}
			>
				<SkillTypeIcon type={isScene ? "scene" : "skill"} icon={icon} className="h-3.5 w-3.5" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-center gap-1.5">
					<span className="truncate text-[13px] font-medium leading-tight text-foreground">{displayName}</span>
					{sourceLabel && (
						<span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium leading-4 text-muted-foreground/70">
							{sourceLabel}
						</span>
					)}
				</span>
				{hasDescription && (
					<span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground/70">
						{skill.description}
					</span>
				)}
			</span>
		</button>
	);
}

/** 分组头：纯展示（不参与 flat 计数）。与 §6 字号档位一致（10px）。id 供分组容器的 aria-labelledby 引用。 */
function SectionHeader({
	section,
	countLabel,
	titleId,
}: {
	section: SkillListSection;
	countLabel: string;
	titleId: string;
}): JSX.Element {
	return (
		<div className="flex items-center justify-between px-3 pt-2.5 pb-1">
			<span
				id={titleId}
				className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60"
			>
				{section.title}
			</span>
			<span className="text-[10px] normal-case tracking-normal text-muted-foreground/50">{countLabel}</span>
		</div>
	);
}

/**
 * skill 与场景合并后的单列列表，按 type 切两组。
 *
 * 排序与过滤在 useSkillList 完成；activeIndex 是「flat items 内的全局下标」，
 * 键盘 ↑↓ 在 useCommandPanelModel / useSkillPickerModel 里以 0..items.length-1 推进，
 * 本组件不重新编号，仅按「分组头 + 分组条目」渲染。
 *
 * A11y：
 * - 容器 role="listbox"，行 role="option"，aria-selected 与键盘/hover 状态同源；
 * - 分组头不是 option，不参与 flat 计数。
 * - 不用 aria-activedescendant：option 本身是可聚焦 button，该属性只在容器持有焦点时
 *   生效，混用反而向读屏器声明了矛盾的焦点模型。
 */
export function SkillList({
	items,
	activeIndex,
	indexOffset = 0,
	labels,
	filtering,
	limit,
	resolveIcon,
	emptyAction,
	ariaLabel,
	onHover,
	onSelect,
}: SkillListProps): JSX.Element {
	const sections = useMemo(
		() => buildSections(items, labels.scenesSection, labels.skillsSection),
		[items, labels.scenesSection, labels.skillsSection],
	);
	// 分组只改渲染顺序：每行的身份索引仍是它在原始 items 里的 flat 下标，
	// 与父级 items[activeIndex] 选中、data-index 滚动定位同一份坐标。
	const flatIndexBySkill = useMemo(() => new Map(items.map((skill, index) => [skill, index])), [items]);
	const listId = useId();
	if (sections.length === 0) {
		return <SkillListEmpty filtering={filtering} labels={labels} action={emptyAction} />;
	}
	const visibleCount = limit === undefined ? items.length : Math.min(limit, items.length);
	return (
		<div role="listbox" aria-label={ariaLabel} className="py-1.5">
			{sections.map((section) => (
				// 分组名来自可见标题本身（aria-labelledby），避免同一份文案维护两处。
				<div key={section.kind} role="group" aria-labelledby={`${listId}-${section.kind}`}>
					<SectionHeader
						section={section}
						countLabel={labels.sectionCount(section.count)}
						titleId={`${listId}-${section.kind}`}
					/>
					<div className="px-1.5">
						{section.items.map((skill, sectionIndex) => {
							const displayIndex = section.startIndex + sectionIndex;
							if (displayIndex >= visibleCount) return null;
							const flatIndex = flatIndexBySkill.get(skill) ?? displayIndex;
							const globalIndex = flatIndex + indexOffset;
							return (
								<SkillListItem
									key={`${skill.type}-${skill.source}-${skill.name}`}
									skill={skill}
									globalIndex={globalIndex}
									active={flatIndex === activeIndex}
									icon={resolveIcon?.(skill)}
									sourceLabel={labels.sourceLabel?.(skill.source, skill.type)}
									onHover={() => onHover(globalIndex)}
									onSelect={() => onSelect(skill)}
								/>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
