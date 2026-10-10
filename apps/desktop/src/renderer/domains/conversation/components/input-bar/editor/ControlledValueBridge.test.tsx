// Copyright The Open Forge contributors.
// @vitest-environment jsdom

/**
 * BUG-0084 回归：受控投影只在「文本无法表达的差异」出现时才回写编辑器。
 *
 * 旧实现对 token 的展示元数据（isDirectory / label / alias / iconUrl …）也逐字段比较，而 team
 * 的投影由文本解析而来（`parseInputSegments(draft)`），天然没有这些字段；草稿里一旦有文件
 * token，每次渲染都判不等，`$applySegments` 会把内容整体重建（root.clear + selectEnd），
 * 中文输入法组字被反复打断——用户表现为「输入框和用户抢键盘」。
 */

import { parseInputSegments, type InputSegment } from "@shared/lib/input-tokens";
import { act, render, screen } from "@testing-library/react";
import { useReducer, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const applySpy = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

// token 胶囊渲染会回查技能目录与开放市场；jsdom 里给出空目录，保持用例无未处理拒绝。
Object.defineProperty(window, "vetta", {
	configurable: true,
	value: {
		abilities: { listOpenMarketplaces: vi.fn(async () => ({ abilities: [] })) },
		skills: { list: vi.fn(async () => []) },
	},
});

vi.mock("./tokens/segments", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./tokens/segments")>();
	return {
		...actual,
		$applySegments: (segments: Parameters<typeof actual.$applySegments>[0]): void => {
			applySpy();
			actual.$applySegments(segments);
		},
	};
});

const { InputEditor } = await import("./InputEditor");
const {
	insertConnectorToken,
	insertFileToken,
	insertImageToken,
	insertMemberToken,
	insertPlainText,
	insertSceneToken,
	insertSkillToken,
} = await import("./inputEditorHandle");

const MEMBER = { id: "member-flower", handle: "flower", label: "Flower" } as const;

/**
 * 模拟 `TeamComposerConnector.projectTeamDraftSegments`：文本解析 + mention 偏移替换。
 * 用例必须走这条「独立于编辑器」的投影，才能验证判等合同。
 */
function teamShapedProjection(draft: string, memberLabel: string | null): readonly InputSegment[] | undefined {
	if (memberLabel === null) return undefined;
	const base = parseInputSegments(draft).segments;
	const needle = `@${MEMBER.handle}`;
	const out: InputSegment[] = [];
	for (const segment of base) {
		if (segment.kind !== "text") {
			out.push(segment);
			continue;
		}
		let cursor = 0;
		while (true) {
			const at = segment.text.indexOf(needle, cursor);
			if (at === -1) break;
			if (at > cursor) out.push({ kind: "text", text: segment.text.slice(cursor, at) });
			out.push({
				kind: "member",
				memberId: MEMBER.id,
				handle: MEMBER.handle,
				label: memberLabel,
				avatar: "avatar.webp",
				meta: `@${MEMBER.handle}`,
			});
			cursor = at + needle.length;
		}
		if (cursor < segment.text.length) out.push({ kind: "text", text: segment.text.slice(cursor) });
	}
	return out;
}

const setValueRef = { current: (_value: string) => {} };
const rerenderRef = { current: () => {} };

const projectedMemberLabelRef = { current: null as string | null };

function Harness({ initial }: { initial: string }): JSX.Element {
	const [value, setValue] = useState(initial);
	const [, bump] = useReducer((tick: number) => tick + 1, 0);
	setValueRef.current = setValue;
	rerenderRef.current = bump;
	return (
		<InputEditor
			ariaLabel="Prompt"
			editable
			namespace="controlled-bridge-test"
			value={value}
			segments={teamShapedProjection(value, projectedMemberLabelRef.current)}
			history={[]}
			onValueChange={(next: string) => setValue(next)}
			onContextMenu={vi.fn()}
			onEnter={() => false}
			onFocusChange={vi.fn()}
		/>
	);
}

async function flushEffects(): Promise<void> {
	await act(async () => {});
}

/** 挂载并把投影重建计数压到当前值作为基线。 */
async function mountAndBaseline(initial: string, memberLabel: string | null = null): Promise<number> {
	projectedMemberLabelRef.current = memberLabel;
	render(<Harness initial={initial} />);
	await flushEffects();
	return applySpy.mock.calls.length;
}

describe("ControlledValueBridge projection sync", () => {
	afterEach(() => {
		applySpy.mockClear();
	});

	it("keeps the editor when typing after a file token", async () => {
		render(<Harness initial="Review @C:/workspace/brief.md" />);
		await flushEffects();
		const baseline = applySpy.mock.calls.length; // 挂载对齐：文本 → 文件 token

		act(() => insertPlainText("你"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByTitle("C:/workspace/brief.md")).toBeTruthy();
	});

	it("does not rebuild a labeled connector token on a parent re-render", async () => {
		render(<Harness initial="" />);
		await flushEffects();
		act(() => insertConnectorToken("notion", "Notion"));
		await flushEffects();
		const baseline = applySpy.mock.calls.length;

		act(() => rerenderRef.current());
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
	});

	it("still syncs a genuinely different external value", async () => {
		const baseline = await mountAndBaseline("first");

		act(() => setValueRef.current("second @C:/other.md"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBeGreaterThan(baseline);
		expect(screen.getByTitle("C:/other.md")).toBeTruthy();
	});

	it("keeps a directory token while typing", async () => {
		const baseline = await mountAndBaseline("");
		act(() => insertFileToken("C:/workspace/docs", true));
		await flushEffects();

		act(() => insertPlainText("看这里"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByTitle("C:/workspace/docs")).toBeTruthy();
	});

	it("keeps an image token while typing", async () => {
		const baseline = await mountAndBaseline("");
		act(() => insertImageToken("C:/workspace/pic.png"));
		await flushEffects();

		act(() => insertPlainText("这张"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByTitle("pic.png")).toBeTruthy();
	});

	it("keeps skill and scene tokens while typing", async () => {
		const baseline = await mountAndBaseline("");
		act(() => insertSkillToken("review", "代码评审", "icon-skill"));
		act(() => insertSceneToken("design", "设计"));
		await flushEffects();

		act(() => insertPlainText("请执行"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByText("代码评审")).toBeTruthy();
		expect(screen.getByText("设计")).toBeTruthy();
	});

	it("keeps a member token while typing when the team projection patches the mention", async () => {
		const baseline = await mountAndBaseline("", "Flower");
		act(() => insertMemberToken(MEMBER.id, MEMBER.handle, "Flower", "avatar.webp", `@${MEMBER.handle}`));
		await flushEffects();

		act(() => insertPlainText("请评审"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByTitle("Flower · @flower")).toBeTruthy();
	});

	it("does not rebuild on repeated parent re-renders with a token in the draft", async () => {
		const baseline = await mountAndBaseline("先看 @C:/workspace/brief.md 再回复");

		act(() => {
			for (let index = 0; index < 5; index += 1) rerenderRef.current();
		});
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
	});

	it("rebuilds when the external value removes the token", async () => {
		const baseline = await mountAndBaseline("先看 @C:/workspace/brief.md 再回复");

		act(() => setValueRef.current("只留正文"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBeGreaterThan(baseline);
		expect(screen.queryByTitle("C:/workspace/brief.md")).toBeNull();
	});

	it("keeps the editor when only the projected mention metadata changes", async () => {
		const baseline = await mountAndBaseline(`请 @${MEMBER.handle} 评审`, "Flower");
		expect(screen.getByTitle("Flower · @flower")).toBeTruthy();

		// 流式期间成员资料变化会让投影带新 label：元数据归编辑器所有，不应重建内容。
		projectedMemberLabelRef.current = "Flower Renamed";
		act(() => rerenderRef.current());
		await flushEffects();

		expect(applySpy.mock.calls.length).toBe(baseline);
		expect(screen.getByTitle("Flower · @flower")).toBeTruthy();
	});
});
