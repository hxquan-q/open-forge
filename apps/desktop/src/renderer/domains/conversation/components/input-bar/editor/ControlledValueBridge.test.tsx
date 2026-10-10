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

import { act, render, screen } from "@testing-library/react";
import { useReducer, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const applySpy = vi.hoisted(() => vi.fn());

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
const { insertConnectorToken, insertPlainText } = await import("./inputEditorHandle");

const setValueRef = { current: (_value: string) => {} };
const rerenderRef = { current: () => {} };

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
		render(<Harness initial="first" />);
		await flushEffects();
		const baseline = applySpy.mock.calls.length;

		act(() => setValueRef.current("second @C:/other.md"));
		await flushEffects();

		expect(applySpy.mock.calls.length).toBeGreaterThan(baseline);
		expect(screen.getByTitle("C:/other.md")).toBeTruthy();
	});
});
