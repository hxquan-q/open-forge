// Copyright The Open Forge contributors.

/**
 * 注入 guest 页面脚本的组装与打包器垫片（BUG-0051）。
 *
 * guest 脚本靠 `.toString()` 把主进程里的函数源码内联进页面。主进程是 esbuild
 * 单文件产物且开了 `keepNames`（见 vite.main.config.ts，TASK-0104 为保留栈帧函数名
 * 付出了 0.74MB），esbuild 会为保住 `.name` 在函数体内插入 `__name(fn, "name")`，
 * minify 后辅助函数与调用点一起收缩成单字母（实测 `o`）。`.toString()` 只带走函数体，
 * 被注入的 guest 里不存在这个模块顶层绑定，于是每条命令都以
 * `ReferenceError: o is not defined` 结束——元素点选、即时编辑、Agent 浏览器工具全废。
 *
 * 垫片在注入脚本的 IIFE 作用域里补一个等价实现：guest 里的 `.name` 毫无意义，
 * 原样返回即可（辅助函数的返回值就是被包裹的函数本身）。
 */

/** 打包器辅助函数调用的形状：`o(p, "editStore")`、`o((R) => {...}, "cssEscape")`、`o(this, "Inner")`。 */
const NAME_LITERAL_ARGUMENT = /^"(?:[^"\\]|\\.)*"$/;
const RESERVED_WORDS = new Set([
	"if",
	"for",
	"while",
	"switch",
	"catch",
	"return",
	"typeof",
	"function",
	"class",
	"new",
	"do",
	"else",
	"delete",
	"void",
	"in",
	"of",
	"instanceof",
	"await",
	"yield",
	"throw",
	"case",
	"super",
	"import",
	"export",
]);

/**
 * 常见全局可调用对象：guest 代码合法调用它们，但绝不可能是打包器辅助函数
 * （辅助函数与全局重名会让 bundle 自身失效）。宁可漏认也不误伤全局。
 */
const GLOBAL_CALLABLES = new Set([
	"Array",
	"Boolean",
	"Date",
	"Error",
	"Event",
	"Element",
	"File",
	"Image",
	"JSON",
	"Map",
	"Math",
	"MutationObserver",
	"Node",
	"Number",
	"Object",
	"Promise",
	"RegExp",
	"Set",
	"String",
	"URL",
	"WeakMap",
	"WeakSet",
	"XPathResult",
	"clearInterval",
	"clearTimeout",
	"console",
	"document",
	"fetch",
	"getComputedStyle",
	"globalThis",
	"parseFloat",
	"parseInt",
	"queueMicrotask",
	"requestAnimationFrame",
	"setInterval",
	"setTimeout",
	"structuredClone",
	"window",
]);

function isIdentifierStart(char: string): boolean {
	return char >= "a" && char <= "z" ? true : char >= "A" && char <= "Z" ? true : char === "_" || char === "$";
}

function isIdentifierPart(char: string): boolean {
	return isIdentifierStart(char) || (char >= "0" && char <= "9");
}

/** 从 `(` 出发按配对标出 `)`；跳过字符串与模板字面量，避免把引号里的括号算进去。 */
function matchingParen(source: string, openIndex: number): number {
	let depth = 0;
	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index];
		if (char === "(") {
			depth += 1;
			continue;
		}
		if (char === ")") {
			depth -= 1;
			if (depth === 0) return index;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			index += 1;
			while (index < source.length && source[index] !== char) {
				if (source[index] === "\\") index += 1;
				index += 1;
			}
		}
	}
	return -1;
}

/** 顶层（不在括号/引号里）逗号的位置。 */
function topLevelCommaOffsets(text: string): number[] {
	const offsets: number[] = [];
	let depth = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === "(" || char === "[" || char === "{") {
			depth += 1;
			continue;
		}
		if (char === ")" || char === "]" || char === "}") {
			depth -= 1;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			// 模板字面量整体跳过：其 `${}` 表达式内部自平衡，不影响顶层判定。
			index += 1;
			while (index < text.length && text[index] !== char) {
				if (text[index] === "\\") index += 1;
				index += 1;
			}
			continue;
		}
		if (char === "," && depth === 0) offsets.push(index);
	}
	return offsets;
}

function firstMeaningfulChar(text: string): string {
	return text.replace(/^(?:\s|\/\*[\s\S]*?\*\/)*/, "")[0] ?? "";
}

function looksLikeNameHelperCall(argumentText: string): boolean {
	// 辅助函数恰好两个实参：(目标, "名字")：多一个逗号就不再是它的形状。
	const commas = topLevelCommaOffsets(argumentText);
	if (commas.length !== 1) return false;
	const head = firstMeaningfulChar(argumentText.slice(0, commas[0]));
	// 首参必是函数值/标识符/this；字符串、数字等字面量开头的调用与辅助函数无关。
	if (head === "" || head === '"' || head === "'" || head === "`" || (head >= "0" && head <= "9")) return false;
	return NAME_LITERAL_ARGUMENT.test(argumentText.slice(commas[0] + 1).trim());
}

/**
 * 从将被内联的源码里认出打包器辅助函数的（自由）标识符。
 * 只做形状匹配：`name(fnOrIdentOrThis, "字面量名字")`，且名字不是保留字/已知全局。
 */
export function collectBundlerNameHelperAliases(sources: readonly string[]): string[] {
	const aliases = new Set<string>();
	for (const source of sources) {
		for (let index = 0; index < source.length; index += 1) {
			if (!isIdentifierStart(source[index])) continue;
			let end = index + 1;
			while (end < source.length && isIdentifierPart(source[end])) end += 1;
			const name = source.slice(index, end);
			const previous = source[index - 1];
			// 属性访问、可选链、构造调用都不是辅助函数调用点。
			if (previous === "." || previous === "?" || /\bnew\s*$/.test(source.slice(Math.max(0, index - 5), index))) {
				index = end - 1;
				continue;
			}
			let open = end;
			while (open < source.length && /\s/.test(source[open])) open += 1;
			if (source[open] !== "(") {
				index = end - 1;
				continue;
			}
			const close = matchingParen(source, open);
			if (close < 0) {
				index = end - 1;
				continue;
			}
			if (
				!RESERVED_WORDS.has(name) &&
				!GLOBAL_CALLABLES.has(name) &&
				looksLikeNameHelperCall(source.slice(open + 1, close))
			) {
				aliases.add(name);
			}
			index = end - 1;
		}
	}
	return [...aliases];
}

/** 无辅助函数可补时返回空串，注入脚本保持与源码逐字一致。 */
function bundlerNameHelperShim(sources: readonly string[]): string {
	return collectBundlerNameHelperAliases(sources)
		.map((alias) => `function ${alias}(target){return target}`)
		.join("");
}

export interface GuestScriptAssembly {
	/** 将被内联进 guest 的源码（函数 `.toString()` 与依赖字面量），用于识别打包器辅助函数引用。 */
	readonly sources: readonly string[];
	/** IIFE 形参列表文本，如 `"command,arg,deps"`。 */
	readonly parameters: string;
	/** IIFE 里求值的表达式：通常直接调用内联进来的 runtime 源码，只引用形参与全局对象。 */
	readonly expression: string;
	/** IIFE 实参列表文本（调用方自行 JSON 序列化）。 */
	readonly arguments: string;
}

/**
 * 组装注入 guest 的脚本：IIFE 体内补上打包器辅助函数垫片，再求值 `expression` 并把结果返回。
 *
 * `return` 不能省：脚本的完成值就是 `executeJavaScript` 的结果，外层 IIFE 少一个 return
 * 时点选/改稿的返回值永远是 undefined，用户表现为「点了元素但对话框里什么都没有」（BUG-0052）。
 * 垫片是函数声明，提升后对 `expression` 与内联 runtime 都可见。
 */
export function assembleGuestScript(assembly: GuestScriptAssembly): string {
	const shim = bundlerNameHelperShim(assembly.sources);
	return `void 0;(function(${assembly.parameters}){${shim}return ${assembly.expression}})(${assembly.arguments})`;
}
