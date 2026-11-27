// Copyright The Open Forge contributors.
import type { ReadonlyCodeView } from "./ReadonlyCodeView";

type ReadonlyCodeViewComponent = typeof ReadonlyCodeView;
let viewPromise: Promise<ReadonlyCodeViewComponent> | undefined;

/**
 * ReadonlyCodeView 静态引入整套 CodeMirror 语法；预览组件本身必须保持轻量，
 * 只有文件超过高亮阈值时才拉取这段代码（见 readonly-dependencies.test.ts 门禁）。
 */
export function loadReadonlyCodeView(): Promise<ReadonlyCodeViewComponent> {
	viewPromise ??= import("./ReadonlyCodeView")
		.then((module) => module.ReadonlyCodeView)
		.catch((error: unknown) => {
			viewPromise = undefined;
			throw error;
		});
	return viewPromise;
}
