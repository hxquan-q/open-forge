// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 页签元信息宿主的 fold 合同：定义列表动态变化（缩短/换序/换集合）时按 definition.id
 * 重建对应层——复用旧实例会让新 useMeta 的 hooks 数量与旧实例不一致，直接触发
 * "Rendered fewer hooks than expected"（code 会话页签白名单收口引入的真实回归）。
 */
import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ActivityTabMetaHost } from "./ActivityTabMetaHost";
import type { ActivityTabDefinition } from "./types";

/** hookless 与带 2 个 useState 的两种 useMeta，形成不同的 hook 签名。 */
function definition(id: string, withHooks: boolean): ActivityTabDefinition {
	return {
		id,
		order: 0,
		removable: false,
		source: "builtin",
		useMeta: withHooks
			? () => {
					const [a] = useState(0);
					const [b] = useState(0);
					return { label: id, badge: a + b || undefined };
				}
			: () => ({ label: id }),
		component: () => null,
	} as ActivityTabDefinition;
}

function renderMetas(metas: ReadonlyMap<string, { label: string } | null>) {
	return <ul>{[...metas.values()].map((meta) => <li key={meta!.label}>{meta!.label}</li>)}</ul>;
}

describe("ActivityTabMetaHost", () => {
	it("定义列表缩短且中位换定义时按 id 重建层位，不触发 hooks 数量错位", () => {
		const full = [
			definition("file", false),
			definition("canvas", true),
			definition("browser", true),
			definition("debug", false),
		];
		const { rerender } = render(<ActivityTabMetaHost definitions={full}>{renderMetas}</ActivityTabMetaHost>);
		expect(document.querySelector("ul")?.children.length).toBe(4);

		// 缩短且中位换定义（git 占据原 canvas 的层位，且 hook 签名不同）。
		const whitelisted = [definition("file", false), definition("git", true), definition("browser", true)];
		expect(() =>
			rerender(<ActivityTabMetaHost definitions={whitelisted}>{renderMetas}</ActivityTabMetaHost>),
		).not.toThrow();
		expect(document.querySelector("ul")?.children.length).toBe(3);
	});
});
