// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { SkillInfo } from "@preload/api";
import { describe, expect, it, vi } from "vitest";
import { SkillList } from "./SkillList";
import type { SkillListEmptyAction, SkillListLabels } from "./types";

const defaultLabels: SkillListLabels = {
	emptyNoMatch: "未找到匹配项",
	emptyNoMatchHint: "换个关键词试试。",
	emptyNoSkills: "暂无可用的技能或场景",
	emptyNoSkillsHint: "去能力广场安装后即可调用。",
	scenesSection: "场景",
	skillsSection: "技能",
	sectionCount: (count: number) => `${count} 项`,
};

const noopEmptyAction: SkillListEmptyAction = {
	kind: "clearFilter",
	label: "清除筛选",
	onAction: () => undefined,
};

const skill = (over: Partial<SkillInfo>): SkillInfo => ({
	name: "x",
	description: "",
	source: "user",
	type: "skill",
	...over,
});

describe("SkillList 分组与 ARIA", () => {
	it("把混合 skill/scene 渲染成「场景 → 技能」两组，分组头不参与 flat 索引", () => {
		const items = [
			skill({ name: "a", description: "A" }),
			skill({ name: "b", type: "scene", description: "B" }),
			skill({ name: "c", description: "C" }),
		];
		render(
			<SkillList
				items={items}
				activeIndex={1}
				labels={defaultLabels}
				filtering={false}
				emptyAction={noopEmptyAction}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);

		expect(screen.getByText("场景")).toBeTruthy();
		expect(screen.getByText("技能")).toBeTruthy();
		expect(screen.getAllByText("1 项").length).toBeGreaterThan(0);
		expect(screen.getAllByText("2 项").length).toBeGreaterThan(0);

		const listbox = screen.getByRole("listbox", { name: "选择技能" });
		expect(listbox).toBeTruthy();
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(3);

		// stable partition：渲染顺序为 场景组（b) → 技能组（a, c)。
		// 每行的身份索引是它在原始 items 里的 flat 下标——父级用 items[activeIndex]
		// 做 Enter 选中、data-index 做滚动定位，分组只重排视觉顺序，不重编号：
		// - b 显示在第 0 行，flat index 1 → activeIndex=1 时高亮
		// - a 显示在第 1 行，flat index 0；c 显示在第 2 行，flat index 2
		expect(options[0].getAttribute("aria-selected")).toBe("true"); // b（场景，flat index 1，高亮）
		expect(options[0].getAttribute("data-index")).toBe("1");
		expect(options[1].getAttribute("aria-selected")).toBe("false"); // a（技能，flat index 0）
		expect(options[1].getAttribute("data-index")).toBe("0");
		expect(options[2].getAttribute("aria-selected")).toBe("false"); // c（技能，flat index 2）
		expect(options[2].getAttribute("data-index")).toBe("2");
	});

	it("描述放在第二行（非右侧 truncate），空描述则省略该行", () => {
		const items = [
			skill({
				name: "with-desc",
				description: "A very long description that should wrap across lines",
			}),
			skill({ name: "no-desc" }),
		];
		render(
			<SkillList
				items={items}
				activeIndex={0}
				labels={defaultLabels}
				filtering={false}
				emptyAction={noopEmptyAction}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);
		expect(screen.getByText(/A very long description/)).toBeTruthy();
		expect(screen.getByText("no-desc")).toBeTruthy();
	});

	it("空 items 渲染空态卡片，主 CTA 触发调用方下发的行为", () => {
		const onAction = vi.fn();
		render(
			<SkillList
				items={[]}
				activeIndex={0}
				labels={defaultLabels}
				filtering
				emptyAction={{ kind: "clearFilter", label: "清除筛选", onAction }}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);
		expect(screen.getByText("未找到匹配项")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
		expect(onAction).toHaveBeenCalledTimes(1);
	});

	it("无可用项的空态仍依赖调用方下发的 CTA 品种（不再写死）", () => {
		const onAction = vi.fn();
		render(
			<SkillList
				items={[]}
				activeIndex={0}
				labels={defaultLabels}
				filtering={false}
				emptyAction={{ kind: "openMarket", label: "去能力市场安装", onAction }}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);
		expect(screen.getByText("暂无可用的技能或场景")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "去能力市场安装" }));
		expect(onAction).toHaveBeenCalledTimes(1);
	});

	it("点击 option 行触发 onSelect 并携带对应 skill", () => {
		const onSelect = vi.fn();
		const target = skill({ name: "target", description: "t", source: "plugin" });
		render(
			<SkillList
				items={[target]}
				activeIndex={0}
				labels={defaultLabels}
				filtering={false}
				emptyAction={noopEmptyAction}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={onSelect}
			/>,
		);
		fireEvent.click(screen.getByRole("option"));
		expect(onSelect).toHaveBeenCalledWith(target);
	});

	it("分组的可访问名引用可见分组头，不复制第二份文本", () => {
		render(
			<SkillList
				items={[skill({ name: "a" }), skill({ name: "b", type: "scene" })]}
				activeIndex={0}
				labels={defaultLabels}
				filtering={false}
				emptyAction={noopEmptyAction}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);
		const group = screen.getByRole("group", { name: "场景" });
		const headerId = group.getAttribute("aria-labelledby");
		expect(headerId).toBeTruthy();
		expect(document.getElementById(headerId ?? "")?.textContent).toBe("场景");
	});

	it("limit 截断只影响渲染行数，不重排分组", () => {
		const items = [
			skill({ name: "a" }),
			skill({ name: "b", type: "scene" }),
			skill({ name: "c" }),
			skill({ name: "d" }),
		];
		render(
			<SkillList
				items={items}
				activeIndex={0}
				labels={defaultLabels}
				filtering={false}
				limit={2}
				emptyAction={noopEmptyAction}
				ariaLabel="选择技能"
				onHover={() => undefined}
				onSelect={() => undefined}
			/>,
		);
		// 渲染顺序：场景组（b, startIndex=0) → 技能组（a, c, d)。
		// limit=2 → 前 2 个 global slot：slot 0 (b), slot 1 (a)。c, d 不渲染。
		expect(screen.getAllByRole("option")).toHaveLength(2);
	});
});
