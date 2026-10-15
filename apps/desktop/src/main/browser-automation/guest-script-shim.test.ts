// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { evaluateInjectedGuestScript } from "../../test/injected-guest-script.js";
import { assembleGuestScript, collectBundlerNameHelperAliases } from "./guest-script-shim.js";
import { buildBrowserTabGuestScript } from "./webview-agent-guest.js";
import { buildInAppBrowserGuestScript } from "./webview-picker-guest.js";

/**
 * 真产物的形状（摘自 dist/main 的 minify 输出）：esbuild 开了 keepNames
 * （vite.main.config.ts），为保住 `.name` 在函数体内插入 `__name(fn, "name")`，
 * minify 后辅助函数与调用点一起收缩成 `o`。`.toString()` 只带走函数体，
 * guest 里没有这个模块顶层绑定——修复前每条命令都是 `ReferenceError: o is not defined`（BUG-0051）。
 */
const KEEP_NAMES_MINIFIED_SOURCE = `function VVt(t, e, n) {
  const s = /* @__PURE__ */ o((i) => i + 1, "increment");
  function a(i) {
    return s(i);
  }
  o(a, "describeTag");
  return a(t);
}`;

describe("guest 注入脚本的打包器垫片", () => {
	it("认出 keepNames 插入的辅助函数调用，补垫片后注入脚本可正常求值", () => {
		expect(collectBundlerNameHelperAliases([KEEP_NAMES_MINIFIED_SOURCE])).toEqual(["o"]);
		// 无垫片时正是线上故障：guest 里不存在 `o`。
		expect(() => evaluateInjectedGuestScript(`void 0;(${KEEP_NAMES_MINIFIED_SOURCE})(41)`)).toThrow(ReferenceError);

		const script = assembleGuestScript({
			sources: [KEEP_NAMES_MINIFIED_SOURCE],
			parameters: "command",
			expression: `(${KEEP_NAMES_MINIFIED_SOURCE})(command)`,
			arguments: "41",
		});
		expect(evaluateInjectedGuestScript(script)).toBe(42);
	});

	it("dev 产物里辅助函数还叫 __name，同样要认出来", () => {
		// dev 构建不 minify（vite.main.config.ts），keepNames 插入的是未改名的 `__name(...)`。
		const source = 'function run(t) { const step = __name((i) => i + 1, "step"); return step(t); }';
		expect(collectBundlerNameHelperAliases([source])).toEqual(["__name"]);
		const script = assembleGuestScript({
			sources: [source],
			parameters: "command",
			expression: `(${source})(command)`,
			arguments: "1",
		});
		expect(evaluateInjectedGuestScript(script)).toBe(2);
	});

	it("源码里没有辅助函数调用时不注入任何垫片", () => {
		const source = "function bare(t) { const inner = () => t; return inner(); }";
		expect(collectBundlerNameHelperAliases([source])).toEqual([]);
		expect(
			assembleGuestScript({
				sources: [source],
				parameters: "command",
				expression: `(${source})(command)`,
				arguments: '"x"',
			}),
		).toBe(`void 0;(function(command){return (${source})(command)})("x")`);
	});

	it("普通调用与局部函数不会被误认成辅助函数", () => {
		// 单实参、字符串开头、属性访问、构造调用都不是 keepNames 的形状。
		const noisy = [
			"function a(t) { return t; }",
			'function b(t) { return c(t.prop ?? ""); }',
			'function d(t) { return window.localStorage.getItem("k"); }',
			'function e(t) { return new Set("ab"); }',
		].join("\n");
		expect(collectBundlerNameHelperAliases([noisy])).toEqual([]);
	});

	it("被测函数不调用同模块的兄弟导出（guest 里那是未定义绑定）", async () => {
		const [liveEdit, pickTarget] = await Promise.all([
			import("./webview-live-edit.js"),
			import("./webview-picker-target.js"),
		]);
		const serialized = [
			pickTarget.chooseInAppBrowserPickTarget,
			liveEdit.applyInAppBrowserLiveEdit,
			liveEdit.revertInAppBrowserLiveEditEntry,
			liveEdit.revertInAppBrowserLiveEditEntries,
		];
		for (const source of serialized) {
			const text = source.toString();
			for (const other of serialized) {
				if (other === source) continue;
				expect(text, `${source.name} 调用了兄弟导出 ${other.name}`).not.toMatch(
					new RegExp(`\\b${other.name}\\s*\\(`),
				);
			}
		}
	});

	it("两条注入脚本都不调用 guest 模块的导出绑定", async () => {
		const modules = await Promise.all([
			import("./webview-picker-guest.js"),
			import("./webview-picker-target.js"),
			import("./webview-live-edit.js"),
			import("./webview-agent-guest.js"),
		]);
		const exported = new Set(modules.flatMap((module) => Object.keys(module)));
		for (const script of [buildInAppBrowserGuestScript("start"), buildBrowserTabGuestScript({ kind: "snapshot" })]) {
			for (const name of exported) {
				if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
				const pattern = new RegExp(`\\b${name}\\s*\\(`, "g");
				// deps 的四个函数本体会以 `function <导出名>(` 声明形式内联进脚本，那不算调用。
				const declarations = script.match(new RegExp(`function\\s+${name}\\s*\\(`, "g"))?.length ?? 0;
				const calls = (script.match(pattern)?.length ?? 0) - declarations;
				expect(calls, `注入脚本调用了模块导出 ${name}`).toBe(0);
			}
		}
	});
});
