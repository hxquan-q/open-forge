// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillCard } from "./SkillCard";
import type { MergedSkill } from "../hooks/useSkillsPageModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const baseSkill: MergedSkill = {
	name: "design-scene",
	alias: "Design",
	description: "Design work",
	type: "scene",
	version: "1.0.0",
	author: "Vetta",
	tags: [],
	category: "design",
	installed: false,
	enabled: false,
	needsUpdate: false,
	downloadCount: 0,
	license: "MIT",
};

describe("SkillCard workspace-mode label", () => {
	it("shows the fixed mode tag and defaults untagged skills to both modes", () => {
		const onInstall = vi.fn();
		const onToggle = vi.fn();
		const onUninstall = vi.fn();
		const { rerender } = render(
			<SkillCard
				skill={{ ...baseSkill, workspaceMode: "coding" }}
				onInstall={onInstall}
				onToggle={onToggle}
				onUninstall={onUninstall}
				actionState="idle"
			/>,
		);
		expect(screen.getByText("settings:agentMode.coding")).toBeTruthy();

		rerender(
			<SkillCard
				skill={baseSkill}
				onInstall={onInstall}
				onToggle={onToggle}
				onUninstall={onUninstall}
				actionState="idle"
			/>,
		);
		expect(screen.getByText("settings:agentMode.both")).toBeTruthy();
	});
});
